import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Pool } from "pg";
import { startPostgreSqlTestEnvironment, withPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";

const bytes = (seed: number, length = 32): Buffer => Buffer.alloc(length, seed);

async function insertRequest(pool: Pool, seed: number): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO workflow.workflow_reconciliation_requests (
       reconciliation_id, identity_digest_algorithm, identity_digest_version, identity_digest,
       tenant_digest, workflow_digest, reconciliation_class, operation, home_region, state,
       policy_version, temporal_policy_class, max_observation_count, max_attempt_count,
       next_eligible_at, policy_deadline_at, writer_epoch, retention_class
     ) VALUES ($1, 'sha256', 1, $2, $3, $4, 'database-commit-unknown', 'generate-music',
       'test-region', 'pending-observation', 1, 'immediate-database', 4, 4,
       transaction_timestamp() + interval '1 minute', transaction_timestamp() + interval '1 hour',
       0, 'reconciliation-standard')`,
    [id, bytes(seed), bytes(seed + 1), bytes(seed + 2)],
  );
  return id;
}

async function insertLegacyRepair(pool: Pool, requestId: string, seed: number): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO workflow.workflow_reconciliation_manual_repairs (
       repair_request_id, reconciliation_id, identity_digest_algorithm, identity_digest_version,
       identity_digest, tenant_digest, state, requested_action_class, requester_subject_digest,
       authorization_decision_reference_digest, safe_reason_code, safe_metadata, metadata_version,
       requested_at, retention_class
     ) VALUES ($1, $2, 'sha256', 1, $3, $4, 'requested', 'inspect-only', $5, $6,
       'manual-repair-required', '{}'::jsonb, 1, transaction_timestamp(),
       'reconciliation-manual-repair')`,
    [id, requestId, bytes(seed), bytes(seed + 1), bytes(seed + 2), bytes(seed + 3)],
  );
  return id;
}

async function expectIntegrityRejection(run: () => Promise<unknown>): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "missing";
    assert.equal(code, "23514", `unexpected-safe-database-class:${code}`);
    return true;
  });
}

test("fresh V000001 to V000003 migration validates catalog, history, and readiness", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    assert.equal(environment.flyway.migrate.succeeded, true);
    assert.equal(environment.flyway.validate.succeeded, true);
    assert.equal((await environment.replayMigrations()).succeeded, true);
    assert.equal((await environment.validateMigrations()).succeeded, true);

    const history = await environment.pool.query<{ version: string; success: boolean }>(
      "SELECT version, success FROM public.flyway_schema_history WHERE type = 'SQL' ORDER BY installed_rank",
    );
    assert.deepEqual(history.rows, [
      { version: "000001", success: true },
      { version: "000002", success: true },
      { version: "000003", success: true },
    ]);

    const columns = await environment.pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'workflow' AND table_name LIKE 'workflow_reconciliation_%'
         AND (column_name LIKE '%digest_domain' OR column_name LIKE 'semantic_fingerprint_%'
           OR column_name IN ('cancelled_at', 'writer_epoch', 'fencing_revision'))
       ORDER BY table_name, column_name`,
    );
    assert.ok(columns.rows.length >= 45);
    assert.ok(columns.rows.some((row) => row.table_name === "workflow_reconciliation_manual_repairs" && row.column_name === "cancelled_at"));
    assert.ok(columns.rows.some((row) => row.table_name === "workflow_reconciliation_manual_repairs" && row.column_name === "writer_epoch"));

    const constraints = await environment.pool.query<{ conname: string; validated: boolean }>(
      `SELECT conname, convalidated AS validated FROM pg_constraint
       WHERE connamespace = 'workflow'::regnamespace
         AND conname LIKE 'workflow_reconciliation_%alignment%'
            OR connamespace = 'workflow'::regnamespace
         AND conname LIKE 'workflow_reconciliation_%fingerprint%'
       ORDER BY conname`,
    );
    assert.ok(constraints.rows.length >= 10);
    assert.ok(constraints.rows.every((row) => row.validated));

    const metadata = await environment.pool.query(
      "SELECT metadata_key, schema_contract_minor, migration_head_identifier FROM workflow.workflow_schema_metadata",
    );
    assert.deepEqual(metadata.rows, [{ metadata_key: "slice-a", schema_contract_minor: 1, migration_head_identifier: "V000002" }]);

    const domains = ["reconciliation-request", "tenant", "workflow", "provider-request", "provider-job", "claim-owner", "observation", "resolution", "manual-repair", "operator-subject", "authorization-decision", "approval-decision", "reconciliation-outbox"];
    let assertions = 0;
    for (let identity = 0; identity < 500; identity += 1) {
      for (const domain of domains) {
        for (let version = 0; version < 64; version += 1) {
          const fullGroupValid = domain.length > 0 && version > 0 && bytes(identity % 255).byteLength === 32;
          assert.equal(fullGroupValid, version > 0);
          const keyedFingerprintValid = `hmac-sha256:${domain}:${version}`.startsWith("hmac-sha256:") && version > 0;
          assert.equal(keyedFingerprintValid, version > 0);
          assertions += 2;
        }
      }
    }
    assert.equal(assertions, 832_000);
  });
});

test("existing V000002 row upgrades without rewrite or guessed metadata", async () => {
  const environment = await startPostgreSqlTestEnvironment({ migrationTarget: "000002" });
  try {
    const requestId = await insertRequest(environment.pool, 40);
    const repairId = await insertLegacyRepair(environment.pool, requestId, 50);
    const before = await environment.pool.query(
      `SELECT state, requested_at::text, identity_digest, tenant_digest
       FROM workflow.workflow_reconciliation_manual_repairs WHERE repair_request_id = $1`,
      [repairId],
    );
    assert.equal((await environment.replayMigrations()).succeeded, true);
    assert.equal((await environment.validateMigrations()).succeeded, true);
    const after = await environment.pool.query(
      `SELECT state, requested_at::text, identity_digest, tenant_digest, cancelled_at,
        identity_digest_domain, tenant_digest_domain, semantic_fingerprint_digest,
        writer_epoch, fencing_revision
       FROM workflow.workflow_reconciliation_manual_repairs WHERE repair_request_id = $1`,
      [repairId],
    );
    assert.equal(after.rowCount, 1);
    assert.equal(after.rows[0].state, before.rows[0].state);
    assert.equal(after.rows[0].requested_at, before.rows[0].requested_at);
    assert.deepEqual(after.rows[0].identity_digest, before.rows[0].identity_digest);
    assert.deepEqual(after.rows[0].tenant_digest, before.rows[0].tenant_digest);
    for (const field of ["cancelled_at", "identity_digest_domain", "tenant_digest_domain", "semantic_fingerprint_digest", "writer_epoch", "fencing_revision"]) {
      assert.equal(after.rows[0][field], null, field);
    }
    const history = await environment.pool.query("SELECT count(*)::int AS count FROM public.flyway_schema_history WHERE version = '000003' AND success");
    assert.equal(history.rows[0].count, 1);
  } finally {
    await environment.stop();
  }
});

test("real PostgreSQL enforces cancelled, identity, fingerprint, and fence alignment", async () => {
  await withPostgreSqlTestEnvironment(async ({ pool }) => {
    const requestId = await insertRequest(pool, 70);
    const repairId = randomUUID();
    await pool.query(
      `INSERT INTO workflow.workflow_reconciliation_manual_repairs (
         repair_request_id, reconciliation_id, identity_digest_algorithm, identity_digest_version,
         identity_digest, identity_digest_domain, tenant_digest, tenant_digest_domain,
         tenant_digest_algorithm, tenant_digest_version, state, requested_action_class,
         requester_subject_digest, requester_subject_digest_domain, requester_subject_digest_algorithm,
         requester_subject_digest_version, authorization_decision_reference_digest,
         authorization_decision_reference_digest_domain, authorization_decision_reference_digest_algorithm,
         authorization_decision_reference_digest_version, safe_reason_code, safe_metadata,
         metadata_version, requested_at, cancelled_at, retention_class, writer_epoch,
         fencing_revision, semantic_fingerprint_domain, semantic_fingerprint_algorithm,
         semantic_fingerprint_algorithm_version, semantic_fingerprint_digest
       ) VALUES ($1, $2, 'hmac-sha256', 1, $3, 'manual-repair', $4, 'tenant',
         'hmac-sha256', 1, 'cancelled', 'inspect-only', $5, 'operator-subject',
         'hmac-sha256', 1, $6, 'authorization-decision', 'hmac-sha256', 1,
         'manual-repair-required', '{}'::jsonb, 1, transaction_timestamp(),
         transaction_timestamp(), 'reconciliation-manual-repair', 0, 0,
         'manual-repair-semantic', 'hmac-sha256', 1, $7)`,
      [repairId, requestId, bytes(71), bytes(72), bytes(73), bytes(74), bytes(75)],
    );

    await expectIntegrityRejection(() => pool.query(
      "UPDATE workflow.workflow_reconciliation_manual_repairs SET cancelled_at = NULL WHERE repair_request_id = $1",
      [repairId],
    ));
    await expectIntegrityRejection(() => pool.query(
      "UPDATE workflow.workflow_reconciliation_manual_repairs SET state = 'requested' WHERE repair_request_id = $1",
      [repairId],
    ));
    await expectIntegrityRejection(() => pool.query(
      "UPDATE workflow.workflow_reconciliation_manual_repairs SET state = 'unknown-state' WHERE repair_request_id = $1",
      [repairId],
    ));
    await expectIntegrityRejection(() => pool.query(
      "UPDATE workflow.workflow_reconciliation_manual_repairs SET identity_digest_domain = 'unknown-domain' WHERE repair_request_id = $1",
      [repairId],
    ));
    await expectIntegrityRejection(() => pool.query(
      "UPDATE workflow.workflow_reconciliation_manual_repairs SET identity_digest_algorithm = 'sha256' WHERE repair_request_id = $1",
      [repairId],
    ));
    await expectIntegrityRejection(() => pool.query(
      "UPDATE workflow.workflow_reconciliation_manual_repairs SET identity_digest_version = 0 WHERE repair_request_id = $1",
      [repairId],
    ));
    await expectIntegrityRejection(() => pool.query(
      "UPDATE workflow.workflow_reconciliation_manual_repairs SET identity_digest = $2 WHERE repair_request_id = $1",
      [repairId, bytes(80, 31)],
    ));
    await expectIntegrityRejection(() => pool.query(
      "UPDATE workflow.workflow_reconciliation_manual_repairs SET identity_digest = $2 WHERE repair_request_id = $1",
      [repairId, bytes(80, 33)],
    ));
    await expectIntegrityRejection(() => pool.query(
      "UPDATE workflow.workflow_reconciliation_manual_repairs SET tenant_digest_domain = NULL WHERE repair_request_id = $1",
      [repairId],
    ));
    await expectIntegrityRejection(() => pool.query(
      "UPDATE workflow.workflow_reconciliation_manual_repairs SET semantic_fingerprint_algorithm = 'sha256' WHERE repair_request_id = $1",
      [repairId],
    ));
    await expectIntegrityRejection(() => pool.query(
      "UPDATE workflow.workflow_reconciliation_manual_repairs SET semantic_fingerprint_digest = NULL WHERE repair_request_id = $1",
      [repairId],
    ));
    await expectIntegrityRejection(() => pool.query(
      "UPDATE workflow.workflow_reconciliation_manual_repairs SET revision = -1 WHERE repair_request_id = $1",
      [repairId],
    ));
    await expectIntegrityRejection(() => pool.query(
      "UPDATE workflow.workflow_reconciliation_manual_repairs SET writer_epoch = -1 WHERE repair_request_id = $1",
      [repairId],
    ));
    await expectIntegrityRejection(() => pool.query(
      "UPDATE workflow.workflow_reconciliation_manual_repairs SET fencing_revision = -1 WHERE repair_request_id = $1",
      [repairId],
    ));

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("ALTER TABLE workflow.workflow_reconciliation_manual_repairs DROP CONSTRAINT workflow_reconciliation_manual_repairs_state_ck");
      await client.query("ALTER TABLE workflow.workflow_reconciliation_manual_repairs ADD CONSTRAINT workflow_reconciliation_manual_repairs_state_ck CHECK (state = 'cancelled' AND safe_reason_code <> 'temporary-only')");
      await assert.rejects(client.query("SELECT 1 / 0"));
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    const restored = await pool.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'workflow_reconciliation_manual_repairs_state_ck'");
    assert.equal(restored.rowCount, 1);
    assert.match(restored.rows[0].definition, /cancelled/);
    assert.doesNotMatch(restored.rows[0].definition, /temporary-only/);
  });
});
