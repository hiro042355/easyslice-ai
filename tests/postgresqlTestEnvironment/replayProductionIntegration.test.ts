import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { startPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";
import type { PostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment/foundation";
import { MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2 as schema } from "../../lib/server/multiCutReplayPhysicalSchema/physicalSchemaV2";
import {
  createMultiCutReplayPostgresqlProductionComposition,
  type MultiCutReplayPostgresqlProductionComposition,
} from "../../lib/server/multiCutReplayPostgresqlProductionComposition";

let environment: PostgreSqlTestEnvironment;
let composition: MultiCutReplayPostgresqlProductionComposition;
let id = 0;

before(async () => {
  environment = await startPostgreSqlTestEnvironment();
  const result = await createMultiCutReplayPostgresqlProductionComposition({
    ...environment.connection,
    maxConnections: 4,
    connectionTimeoutMs: 5_000,
    idleTimeoutMs: 5_000,
    applicationName: "replay-production-integration",
    tls: { mode: "disabled" },
  });
  assert.equal(result.status, "ready");
  if (result.status !== "ready") throw new Error("composition-not-ready");
  composition = result.composition;
});

after(async () => {
  if (composition) assert.deepEqual(await composition.shutdown(), { status: "closed" });
  if (environment) await environment.stop();
});

const replayIdentity = (name: string) => ({
  physical_schema_version: "2.0",
  logical_schema_version: "2.0",
  identity_version: "2.0",
  scope_version: "1.0",
  replay_namespace: "multi-cut",
  tenant_identity_version: "1.0",
  protected_tenant_identity: "tenant:integration",
  operation_identity: "operation:integration",
  key_identity: `key:${name}`,
});

const execute = async (
  statementId: Parameters<typeof composition.runtime.execute>[0]["statementId"],
  bindings: Readonly<Record<string, unknown>>,
) => {
  const result = await composition.runtime.execute({
    inputVersion: "1.0",
    statementId,
    bindings,
  });
  assert.equal(result.status, "completed", JSON.stringify(result));
  if (result.status !== "completed") throw new Error("runtime-not-completed");
  return result.adapterResult;
};

const reserve = async (name: string) => {
  id += 1;
  const identity = replayIdentity(name);
  const reservation = `reservation:${name}:1`;
  const lease = `lease:${name}:1`;
  const result = await execute("resolve-new-reservation", {
    internal_record_id: `20000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    replay_identity: identity,
    request_fingerprint_identity: `fingerprint:${name}`,
    reservation_identity: reservation,
    lease_identity: lease,
    lease_duration_milliseconds: "60000",
  });
  assert.equal(result.status, "mapped");
  assert.equal(result.rowCount, 1);
  assert.equal(result.command, "INSERT");
  return { identity, reservation, lease, result };
};

const owner = (reservation: string, lease: string, attempt = 1) => ({
  reservation_identity: reservation,
  lease_identity: lease,
  reservation_attempt: attempt,
});

const terminal = (
  identity: ReturnType<typeof replayIdentity>,
  reservation: string,
  lease: string,
  classification: string,
) => ({
  replay_identity: identity,
  expected_revision: "1",
  expected_ownership_evidence: owner(reservation, lease),
  expected_fence: "1",
  terminal_metadata_version: "1.0",
  terminal_at: "2026-07-30T00:00:00.000Z",
  terminal_classification: classification,
});

test("Flyway creates the exact V000004 physical schema", async () => {
  assert.equal(environment.flyway.migrate.succeeded, true);
  assert.equal(environment.flyway.validate.succeeded, true);
  const columns = await environment.pool.query<{
    column_name: string;
    is_nullable: "YES" | "NO";
    column_default: string | null;
  }>(
    `SELECT column_name, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [schema.table.name],
  );
  assert.equal(columns.rows.length, 31);
  assert.deepEqual(
    columns.rows.map(({ column_name }) => column_name),
    schema.table.columns.map(({ name }) => name),
  );
  schema.table.columns.forEach((expected, index) => {
    assert.equal(columns.rows[index].is_nullable === "YES", expected.nullable);
    assert.equal(columns.rows[index].column_default, null);
  });
  const constraints = await environment.pool.query<{ conname: string }>(
    "SELECT conname FROM pg_constraint WHERE conrelid = $1::regclass",
    [schema.table.name],
  );
  for (const expected of [...schema.constraints, schema.authoritativeUniqueConstraint]) {
    assert.ok(constraints.rows.some(({ conname }) => conname === expected.name));
  }
  const indexes = await environment.pool.query<{ indexname: string }>(
    "SELECT indexname FROM pg_indexes WHERE tablename = $1",
    [schema.table.name],
  );
  for (const expected of schema.indexes) {
    assert.ok(indexes.rows.some(({ indexname }) => indexname === expected.name));
  }
});

test("new, lookup, renew, and stale zero-row traverse the production path", async () => {
  const created = await reserve("base");
  assert.deepEqual(
    [created.result.row.revision, created.result.row.fencing_token, created.result.row.reservation_attempt],
    ["1", "1", 1],
  );
  const lookup = await execute("lookup-authoritative-replay", {
    replay_identity: created.identity,
  });
  assert.equal(lookup.status, "mapped");
  assert.equal(lookup.command, "SELECT");
  assert.equal(Object.isFrozen(lookup.row), true);
  const renewed = await execute("renew-processing-reservation", {
    replay_identity: created.identity,
    expected_revision: "1",
    expected_ownership_evidence: owner(created.reservation, created.lease),
    expected_fence: "1",
    lease_duration_milliseconds: "60000",
  });
  assert.equal(renewed.status, "mapped");
  assert.equal(renewed.command, "UPDATE");
  const stale = await execute("renew-processing-reservation", {
    replay_identity: created.identity,
    expected_revision: "2",
    expected_ownership_evidence: owner(created.reservation, created.lease),
    expected_fence: "0",
    lease_duration_milliseconds: "60000",
  });
  assert.equal(stale.status, "zero-row");
  assert.equal(stale.command, "UPDATE");
});

test("complete, fail, and release bind every terminal parameter", async () => {
  for (const statementId of [
    "complete-processing-replay",
    "fail-processing-replay",
    "release-processing-replay",
  ] as const) {
    const created = await reserve(statementId);
    const bindings: Record<string, unknown> = terminal(
      created.identity,
      created.reservation,
      created.lease,
      statementId,
    );
    if (statementId === "complete-processing-replay") {
      bindings.result_reference_version = "1.0";
      bindings.result_reference_identity = "result:integration";
    }
    const result = await execute(statementId, bindings);
    assert.equal(result.status, "mapped");
    assert.equal(result.rowCount, 1);
    assert.equal(result.command, "UPDATE");
    assert.equal(result.row.terminal_metadata_version, "1.0");
  }
});

test("released replay clears ownership and re-reserves with exact successors", async () => {
  const created = await reserve("rereserve");
  await execute(
    "release-processing-replay",
    terminal(created.identity, created.reservation, created.lease, "released"),
  );
  const released = await environment.pool.query<{
    reservation_identity: null;
    lease_identity: null;
  }>(
    `SELECT reservation_identity, lease_identity FROM ${schema.table.name}
      WHERE key_identity = $1`,
    [created.identity.key_identity],
  );
  assert.deepEqual(released.rows[0], {
    reservation_identity: null,
    lease_identity: null,
  });
  const nextReservation = "reservation:rereserve:2";
  const nextLease = "lease:rereserve:2";
  const result = await execute("resolve-existing-replay", {
    replay_identity: created.identity,
    request_fingerprint_identity: "fingerprint:rereserve",
    expected_revision: "2",
    expected_last_fencing_token: "1",
    expected_last_reservation_attempt: 1,
    reservation_identity: nextReservation,
    lease_identity: nextLease,
    lease_duration_milliseconds: "60000",
  });
  assert.equal(result.status, "mapped");
  assert.deepEqual(
    [result.row.state, result.row.revision, result.row.fencing_token, result.row.reservation_attempt],
    ["processing", "3", "2", 2],
  );
  const oldOwner = await execute("renew-processing-reservation", {
    replay_identity: created.identity,
    expected_revision: "3",
    expected_ownership_evidence: owner(created.reservation, created.lease, 2),
    expected_fence: "2",
    lease_duration_milliseconds: "60000",
  });
  assert.equal(oldOwner.status, "zero-row");
  const newOwner = await execute("renew-processing-reservation", {
    replay_identity: created.identity,
    expected_revision: "3",
    expected_ownership_evidence: owner(nextReservation, nextLease, 2),
    expected_fence: "2",
    lease_duration_milliseconds: "60000",
  });
  assert.equal(newOwner.status, "mapped");
});

test("stale takeover uses old predicates, new ownership, and checked successors", async () => {
  const created = await reserve("takeover");
  await environment.pool.query(
    `UPDATE ${schema.table.name}
        SET lease_expires_at = transaction_timestamp() - interval '1 second'
      WHERE key_identity = $1`,
    [created.identity.key_identity],
  );
  const nextReservation = "reservation:takeover:2";
  const nextLease = "lease:takeover:2";
  const result = await execute("takeover-stale-processing-replay", {
    replay_identity: created.identity,
    takeover_expected_revision: "1",
    expected_last_fencing_token: "1",
    expected_last_reservation_attempt: 1,
    expected_ownership_evidence: owner(created.reservation, created.lease),
    takeover_expected_fence: "1",
    takeover_reservation_identity: nextReservation,
    takeover_lease_identity: nextLease,
    lease_duration_milliseconds: "60000",
  });
  assert.equal(result.status, "mapped");
  assert.equal(result.command, "UPDATE");
  assert.deepEqual(
    [
      result.row.revision,
      result.row.fencing_token,
      result.row.reservation_attempt,
      result.row.reservation_identity,
      result.row.lease_identity,
    ],
    ["2", "2", 2, nextReservation, nextLease],
  );
  const oldOwner = await execute("renew-processing-reservation", {
    replay_identity: created.identity,
    expected_revision: "2",
    expected_ownership_evidence: owner(created.reservation, created.lease, 2),
    expected_fence: "2",
    lease_duration_milliseconds: "60000",
  });
  assert.equal(oldOwner.status, "zero-row");
});

test("concurrent reservation yields one authoritative row without sleeping", async () => {
  const identity = replayIdentity("concurrent");
  const request = async () => {
    id += 1;
    return execute("resolve-new-reservation", {
      internal_record_id: `20000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
      replay_identity: identity,
      request_fingerprint_identity: "fingerprint:concurrent",
      reservation_identity: "reservation:concurrent",
      lease_identity: "lease:concurrent",
      lease_duration_milliseconds: "60000",
    });
  };
  const results = await Promise.all([request(), request()]);
  assert.deepEqual(results.map(({ status }) => status).sort(), ["mapped", "zero-row"]);
  const count = await environment.pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${schema.table.name}
      WHERE key_identity = $1`,
    [identity.key_identity],
  );
  assert.equal(count.rows[0].count, "1");
});

test("explicit rollback persists no mutation and releases the connection", async () => {
  const client = await environment.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE ${schema.table.name} SET request_fingerprint_identity = $1
        WHERE key_identity = $2`,
      ["fingerprint:rolled-back", "key:base"],
    );
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
  const row = await environment.pool.query<{ request_fingerprint_identity: string }>(
    `SELECT request_fingerprint_identity FROM ${schema.table.name}
      WHERE key_identity = $1`,
    ["key:base"],
  );
  assert.equal(row.rows[0].request_fingerprint_identity, "fingerprint:base");
  assert.equal((await environment.pool.query("SELECT 1")).rowCount, 1);
});
