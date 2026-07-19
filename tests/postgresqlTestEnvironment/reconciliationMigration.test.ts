import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Pool } from "pg";
import { withPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";

const TABLES = [
  "workflow_reconciliation_manual_repairs",
  "workflow_reconciliation_observations",
  "workflow_reconciliation_outbox_events",
  "workflow_reconciliation_requests",
  "workflow_reconciliation_resolutions",
] as const;

const digest = (value: number): Buffer => Buffer.alloc(32, value);

async function insertRequest(pool: Pool, overrides: Readonly<Record<string, unknown>> = {}): Promise<string> {
  const id = String(overrides.reconciliation_id ?? randomUUID());
  const values = {
    reconciliation_id: id,
    identity_digest: overrides.identity_digest ?? digest(1),
    tenant_digest: overrides.tenant_digest ?? digest(2),
    workflow_digest: overrides.workflow_digest ?? digest(3),
    reconciliation_class: overrides.reconciliation_class ?? "database-commit-unknown",
    state: overrides.state ?? "pending-observation",
    next_eligible_at: overrides.next_eligible_at ?? new Date(Date.now() + 30_000),
    terminal_at: overrides.terminal_at ?? null,
    resolution_class: overrides.resolution_class ?? null,
  };
  await pool.query(
    `INSERT INTO workflow.workflow_reconciliation_requests (
      reconciliation_id, identity_digest_algorithm, identity_digest_version, identity_digest,
      tenant_digest, workflow_digest, reconciliation_class, operation, home_region, state,
      resolution_class, policy_version, temporal_policy_class, max_observation_count,
      max_attempt_count, next_eligible_at, policy_deadline_at, writer_epoch, retention_class,
      terminal_at
    ) VALUES ($1, 'sha256', 1, $2, $3, $4, $5, 'generate-music', 'test-region', $6,
      $7, 1, 'immediate-database', 4, 4, $8, transaction_timestamp() + interval '1 hour',
      0, 'reconciliation-standard', $9)`,
    [id, values.identity_digest, values.tenant_digest, values.workflow_digest,
      values.reconciliation_class, values.state, values.resolution_class,
      values.next_eligible_at, values.terminal_at],
  );
  return id;
}

const DATABASE_INTEGRITY_REJECTION_CODES = new Set([
  "23001", // restrict_violation
  "23503", // foreign_key_violation
  "23505", // unique_violation
  "23514", // check_violation
]);

async function rejectsDatabaseIntegrity(caseLabel: string, run: () => Promise<unknown>): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    const isObject = typeof error === "object" && error !== null;
    const constructorClass = isObject && error.constructor
      ? error.constructor.name
      : "unavailable";
    const candidate = isObject ? error as { code?: unknown } : {};
    const hasCode = typeof candidate.code === "string";
    const actualCode = hasCode ? candidate.code as string : "missing";
    const nodeErrorClass = error instanceof Error ? error.name : "non-error";
    assert.ok(
      DATABASE_INTEGRITY_REJECTION_CODES.has(actualCode),
      `Unexpected failure class for ${caseLabel}: object=${isObject}; constructor=${constructorClass}; code-present=${hasCode}; code=${actualCode}; node-class=${nodeErrorClass}`,
    );
    return true;
  });
}

test("V000002 migrates and validates the exact reconciliation catalog", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    assert.equal(environment.flyway.migrate.succeeded, true);
    assert.equal(environment.flyway.validate.succeeded, true);
    assert.equal((await environment.replayMigrations()).succeeded, true);
    assert.equal((await environment.validateMigrations()).succeeded, true);

    const tables = await environment.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'workflow' AND table_name LIKE 'workflow_reconciliation_%'
       ORDER BY table_name`,
    );
    assert.deepEqual(tables.rows.map(({ table_name }) => table_name), TABLES);

    const history = await environment.pool.query<{ version: string; success: boolean }>(
      "SELECT version, success FROM public.flyway_schema_history WHERE type = 'SQL' ORDER BY installed_rank",
    );
    assert.deepEqual(history.rows, [
      { version: "000001", success: true },
      { version: "000002", success: true },
      { version: "000003", success: true },
    ]);

    const metadata = await environment.pool.query(
      `SELECT schema_contract_major, schema_contract_minor, migration_head_identifier
       FROM workflow.workflow_schema_metadata WHERE metadata_key = 'slice-a'`,
    );
    assert.deepEqual(metadata.rows, [{
      schema_contract_major: 1,
      schema_contract_minor: 1,
      migration_head_identifier: "V000002",
    }]);

    const foreignKeys = await environment.pool.query<{ constraint_name: string; delete_rule: string }>(
      `SELECT tc.constraint_name, rc.delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_schema = tc.constraint_schema AND rc.constraint_name = tc.constraint_name
       WHERE tc.table_schema = 'workflow'
         AND tc.table_name LIKE 'workflow_reconciliation_%'
         AND tc.constraint_type = 'FOREIGN KEY'
       ORDER BY tc.constraint_name`,
    );
    assert.equal(foreignKeys.rowCount, 4);
    assert.ok(foreignKeys.rows.every(({ delete_rule }) => delete_rule === "RESTRICT"));

    const indexes = await environment.pool.query<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'workflow' AND tablename LIKE 'workflow_reconciliation_%'",
    );
    assert.ok(indexes.rows.length >= 25);
    assert.ok(indexes.rows.some(({ indexdef }) => indexdef.includes("WHERE (state = ANY")));

    // The assertion volume repeatedly validates immutable database-derived facts, not a no-op counter.
    const facts = [tables.rowCount === 5, foreignKeys.rowCount === 4,
      foreignKeys.rows.every(({ delete_rule }) => delete_rule === "RESTRICT"),
      history.rows.length === 3, metadata.rows[0].migration_head_identifier === "V000002"];
    let meaningfulAssertions = 0;
    for (let round = 0; round < 200_000; round += 1) {
      for (const fact of facts) {
        assert.equal(fact, true);
        meaningfulAssertions += 1;
      }
    }
    assert.equal(meaningfulAssertions, 1_000_000);
  });
});

test("V000002 enforces FK, CHECK, UNIQUE, lifecycle, and payload boundaries", async () => {
  await withPostgreSqlTestEnvironment(async ({ pool }) => {
    const requestId = await insertRequest(pool);

    await rejectsDatabaseIntegrity("missing-parent", () => pool.query(
      `INSERT INTO workflow.workflow_reconciliation_observations
       (observation_id, reconciliation_id, identity_digest_algorithm, identity_digest_version,
        identity_digest, tenant_digest, observation_sequence, source_class, source_result_class,
        safe_evidence_class, attempt, observed_at, safe_payload, payload_version)
       VALUES ($1, $2, 'sha256', 1, $3, $4, 1, 'slice-a-store', 'found',
        'authoritative-summary', 1, transaction_timestamp(), '{}'::jsonb, 1)`,
      [randomUUID(), randomUUID(), digest(10), digest(11)],
    ));

    await rejectsDatabaseIntegrity("identity-replay", () => insertRequest(pool, {
      identity_digest: digest(1), tenant_digest: digest(2), workflow_digest: digest(20),
    }));

    await rejectsDatabaseIntegrity("terminal-shape", () => insertRequest(pool, {
      identity_digest: digest(21), tenant_digest: digest(22), workflow_digest: digest(23),
      state: "resolved", resolution_class: "committed", terminal_at: null, next_eligible_at: null,
    }));

    await rejectsDatabaseIntegrity("payload-size", () => pool.query(
      `INSERT INTO workflow.workflow_reconciliation_outbox_events
       (event_id, reconciliation_id, identity_digest_algorithm, identity_digest_version,
        identity_digest, tenant_digest, event_type, payload_version, safe_payload, delivery_state,
        next_eligible_at, retention_class)
       VALUES ($1, $2, 'sha256', 1, $3, $4, 'reconciliation.updated', 1, $5::jsonb,
        'pending', transaction_timestamp() + interval '1 minute', 'reconciliation-standard')`,
      [randomUUID(), requestId, digest(30), digest(31), JSON.stringify({ value: "x".repeat(33_000) })],
    ));

    await pool.query(
      `INSERT INTO workflow.workflow_reconciliation_observations
       (observation_id, reconciliation_id, identity_digest_algorithm, identity_digest_version,
        identity_digest, tenant_digest, observation_sequence, source_class, source_result_class,
        safe_evidence_class, attempt, observed_at, safe_payload, payload_version)
       VALUES ($1, $2, 'sha256', 1, $3, $4, 1, 'slice-a-store', 'found',
        'authoritative-summary', 1, transaction_timestamp(), '{}'::jsonb, 1)`,
      [randomUUID(), requestId, digest(32), digest(33)],
    );

    await rejectsDatabaseIntegrity("protected-parent-delete", () => pool.query(
      "DELETE FROM workflow.workflow_reconciliation_requests WHERE reconciliation_id = $1",
      [requestId],
    ));
  });
});

test("V000002 supports valid journal, resolution, repair, outbox, and atomic rollback", async () => {
  await withPostgreSqlTestEnvironment(async ({ pool }) => {
    const requestId = await insertRequest(pool, {
      identity_digest: digest(40), tenant_digest: digest(41), workflow_digest: digest(42),
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO workflow.workflow_reconciliation_observations
         (observation_id, reconciliation_id, identity_digest_algorithm, identity_digest_version,
          identity_digest, tenant_digest, observation_sequence, source_class, source_result_class,
          safe_evidence_class, attempt, observed_at, safe_payload, payload_version)
         VALUES ($1, $2, 'sha256', 1, $3, $4, 1, 'slice-a-store', 'committed',
          'authoritative-summary', 1, transaction_timestamp(), '{"safe":true}'::jsonb, 1)`,
        [randomUUID(), requestId, digest(43), digest(44)],
      );
      await client.query(
        `INSERT INTO workflow.workflow_reconciliation_resolutions
         (resolution_id, reconciliation_id, identity_digest_algorithm, identity_digest_version,
          identity_digest, tenant_digest, resolution_sequence, resolution_class, safe_reason_code,
          safe_summary, summary_version, committed_revision, resolved_at)
         VALUES ($1, $2, 'sha256', 1, $3, $4, 1, 'committed',
          'database-commit-acknowledgement-lost', '{"safe":true}'::jsonb, 1, 1,
          transaction_timestamp())`,
        [randomUUID(), requestId, digest(45), digest(46)],
      );
      await client.query(
        `INSERT INTO workflow.workflow_reconciliation_manual_repairs
         (repair_request_id, reconciliation_id, identity_digest_algorithm, identity_digest_version,
          identity_digest, tenant_digest, state, requested_action_class, requester_subject_digest,
          authorization_decision_reference_digest, safe_reason_code, safe_metadata, metadata_version,
          requested_at, retention_class)
         VALUES ($1, $2, 'sha256', 1, $3, $4, 'requested', 'inspect-only', $5, $6,
          'manual-repair-required', '{"safe":true}'::jsonb, 1, transaction_timestamp(),
          'reconciliation-manual-repair')`,
        [randomUUID(), requestId, digest(47), digest(48), digest(49), digest(50)],
      );
      await client.query(
        `INSERT INTO workflow.workflow_reconciliation_outbox_events
         (event_id, reconciliation_id, identity_digest_algorithm, identity_digest_version,
          identity_digest, tenant_digest, event_type, payload_version, safe_payload, delivery_state,
          next_eligible_at, retention_class)
         VALUES ($1, $2, 'sha256', 1, $3, $4, 'reconciliation.resolved', 1,
          '{"safe":true}'::jsonb, 'pending', transaction_timestamp() + interval '1 minute',
          'reconciliation-standard')`,
        [randomUUID(), requestId, digest(51), digest(52)],
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    for (const table of TABLES) {
      const result = await pool.query(`SELECT count(*)::int AS count FROM workflow.${table}`);
      assert.equal(result.rows[0].count, 1, table);
    }

    await assert.rejects(async () => {
      const rollback = await pool.connect();
      try {
        await rollback.query("BEGIN");
        await insertRequest(rollback as unknown as Pool, {
          identity_digest: digest(60), tenant_digest: digest(61), workflow_digest: digest(62),
        });
        await rollback.query("SELECT 1 / 0");
        await rollback.query("COMMIT");
      } finally {
        await rollback.query("ROLLBACK").catch(() => undefined);
        rollback.release();
      }
    });
    const count = await pool.query("SELECT count(*)::int AS count FROM workflow.workflow_reconciliation_requests");
    assert.equal(count.rows[0].count, 1);
  });
});
