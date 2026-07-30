import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { startPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";
import type { PostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment/foundation";
import {
  createMultiCutReplayPostgresqlDriverConnectionProvider,
  type MultiCutReplayPostgresqlDriverFailure,
} from "../../lib/server/multiCutReplayPostgresqlDriver";
import {
  createMultiCutReplayPostgresqlProductionBridge,
} from "../../lib/server/multiCutReplayPostgresqlProductionBridge";
import {
  createMultiCutReplayPostgresqlProductionComposition,
  type MultiCutReplayPostgresqlProductionComposition,
} from "../../lib/server/multiCutReplayPostgresqlProductionComposition";
import { MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2 as schema } from "../../lib/server/multiCutReplayPhysicalSchema/physicalSchemaV2";
import {
  mapPostgreSQLError,
  PostgreSQLConnectionPoolAdapter,
  type PostgreSQLConnectionConfig,
} from "../../lib/server/productionWorkflowRuntime/postgresqlDriver";

let environment: PostgreSqlTestEnvironment;
let composition: MultiCutReplayPostgresqlProductionComposition;
let driverPool: PostgreSQLConnectionPoolAdapter;
let connectionConfig: PostgreSQLConnectionConfig;
let provider: ReturnType<
  typeof createMultiCutReplayPostgresqlDriverConnectionProvider
>;
let sequence = 0;

before(async () => {
  environment = await startPostgreSqlTestEnvironment();
  connectionConfig = {
    ...environment.connection,
    maxConnections: 6,
    connectionTimeoutMs: 5_000,
    idleTimeoutMs: 5_000,
    applicationName: "replay-failure-recovery-integration",
    tls: { mode: "disabled" as const },
  };
  const composed =
    await createMultiCutReplayPostgresqlProductionComposition(connectionConfig);
  assert.equal(composed.status, "ready");
  if (composed.status !== "ready") throw new Error("composition-not-ready");
  composition = composed.composition;
  driverPool = new PostgreSQLConnectionPoolAdapter(connectionConfig);
  assert.equal(await driverPool.start(), "ready");
  provider = createMultiCutReplayPostgresqlDriverConnectionProvider(
    createMultiCutReplayPostgresqlProductionBridge({ pool: driverPool }),
  );
});

after(async () => {
  if (composition) {
    assert.deepEqual(await composition.shutdown(), { status: "closed" });
  }
  if (driverPool) assert.equal(await driverPool.close(), "closed");
  if (environment) await environment.stop();
});

const identity = (name: string) => ({
  physical_schema_version: "2.0",
  logical_schema_version: "2.0",
  identity_version: "2.0",
  scope_version: "1.0",
  replay_namespace: "multi-cut",
  tenant_identity_version: "1.0",
  protected_tenant_identity: "tenant:failure-integration",
  operation_identity: "operation:failure-integration",
  key_identity: `key:failure:${name}`,
});

const runtimeExecute = async (
  statementId: Parameters<typeof composition.runtime.execute>[0]["statementId"],
  bindings: Readonly<Record<string, unknown>>,
) => composition.runtime.execute({ inputVersion: "1.0", statementId, bindings });

const reserve = async (name: string) => {
  sequence += 1;
  const replayIdentity = identity(name);
  const result = await runtimeExecute("resolve-new-reservation", {
    internal_record_id: `30000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    replay_identity: replayIdentity,
    request_fingerprint_identity: `fingerprint:failure:${name}`,
    reservation_identity: `reservation:failure:${name}`,
    lease_identity: `lease:failure:${name}`,
    lease_duration_milliseconds: "60000",
  });
  assert.equal(result.status, "completed", JSON.stringify(result));
  if (result.status !== "completed") throw new Error("reservation-failed");
  assert.equal(result.adapterResult.status, "mapped");
  return replayIdentity;
};

const request = (
  sql: string,
  statementId:
    Parameters<typeof composition.runtime.execute>[0]["statementId"] =
      "lookup-authoritative-replay",
) => Object.freeze({
  requestVersion: "1.0" as const,
  statementId,
  sql,
  parameters: Object.freeze([]),
  values: Object.freeze([]),
});

const captureFailure = async (
  sql: string,
): Promise<MultiCutReplayPostgresqlDriverFailure> => {
  const connection = await provider.acquire();
  await connection.begin();
  try {
    await connection.execute(request(sql));
    throw new Error("expected-statement-failure");
  } catch (failure) {
    assert.equal(typeof failure, "object");
    assert.notEqual(failure, null);
    assert.equal("command" in (failure as object), false);
    assert.equal("rowCount" in (failure as object), false);
    return failure as MultiCutReplayPostgresqlDriverFailure;
  } finally {
    await connection.rollback();
    await provider.release(connection);
  }
};

test("explicit rollback persists no mutation and releases the client", async () => {
  const replayIdentity = await reserve("rollback");
  const connection = await provider.acquire();
  await connection.begin();
  const changed = await connection.execute(request(
    `UPDATE ${schema.table.name}
        SET request_fingerprint_identity = 'fingerprint:rolled-back'
      WHERE key_identity = '${replayIdentity.key_identity}'
      RETURNING key_identity`,
  ));
  assert.equal(changed.command, "UPDATE");
  assert.equal(changed.rowCount, 1);
  await connection.rollback();
  await provider.release(connection);

  const persisted = await environment.pool.query<{ request_fingerprint_identity: string }>(
    `SELECT request_fingerprint_identity FROM ${schema.table.name}
      WHERE key_identity = $1`,
    [replayIdentity.key_identity],
  );
  assert.equal(
    persisted.rows[0].request_fingerprint_identity,
    "fingerprint:failure:rollback",
  );
});

test("unique and check failures preserve safe class 23 and recover the pool", async () => {
  const replayIdentity = await reserve("constraints");
  const duplicate = await captureFailure(
    `INSERT INTO ${schema.table.name}
      SELECT * FROM ${schema.table.name}
      WHERE key_identity = '${replayIdentity.key_identity}'`,
  );
  assert.equal(duplicate.classification, "execution-failure");
  assert.equal(duplicate.retryClassification, "non-retryable");
  assert.equal(duplicate.sqlStateClass, "23");
  assert.equal(duplicate.safeReason, "postgresql-constraint-conflict");

  const check = await captureFailure(
    `UPDATE ${schema.table.name}
        SET state = 'not-a-replay-state'
      WHERE key_identity = '${replayIdentity.key_identity}'`,
  );
  assert.equal(check.classification, "execution-failure");
  assert.equal(check.retryClassification, "non-retryable");
  assert.equal(check.sqlStateClass, "23");
  assert.equal(check.safeReason, "postgresql-constraint-conflict");

  const recovered = await provider.acquire();
  await recovered.begin();
  const result = await recovered.execute(request("SELECT 1 AS recovered"));
  assert.equal(result.command, "SELECT");
  assert.equal(result.rowCount, 1);
  await recovered.commit();
  await provider.release(recovered);
});

test("serialization failure preserves class 40 and retryable classification", async () => {
  const replayIdentity = await reserve("serialization");
  const first = await environment.pool.connect();
  const second = await environment.pool.connect();
  try {
    await first.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await second.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const select = `SELECT revision FROM ${schema.table.name}
      WHERE key_identity = $1`;
    await first.query(select, [replayIdentity.key_identity]);
    await second.query(select, [replayIdentity.key_identity]);
    await first.query(
      `UPDATE ${schema.table.name}
        SET request_fingerprint_identity = request_fingerprint_identity
        WHERE key_identity = $1`,
      [replayIdentity.key_identity],
    );
    await first.query("COMMIT");
    let databaseFailure: unknown;
    try {
      await second.query(
        `UPDATE ${schema.table.name}
          SET request_fingerprint_identity = request_fingerprint_identity
          WHERE key_identity = $1`,
        [replayIdentity.key_identity],
      );
    } catch (value) {
      databaseFailure = value;
    }
    assert.ok(databaseFailure);
    const failure = mapPostgreSQLError(databaseFailure, {
      stage: "query",
      statementId: "serialization-integration",
      connectionState: "transaction-active",
      transactionState: "failed",
    });
    assert.equal(failure.status, "failure");
    assert.equal(failure.issue, "retryable-conflict");
    assert.equal(failure.diagnostic.retryable, true);
    assert.equal(failure.diagnostic.sqlStateClass, "40");
    await second.query("ROLLBACK");
  } finally {
    first.release();
    second.release();
  }
});

test("statement failure is distinct from a committed zero-row success", async () => {
  const replayIdentity = await reserve("distinction");
  const zero = await runtimeExecute("renew-processing-reservation", {
    replay_identity: replayIdentity,
    expected_revision: "1",
    expected_ownership_evidence: {
      reservation_identity: "reservation:wrong",
      lease_identity: "lease:wrong",
      reservation_attempt: 1,
    },
    expected_fence: "1",
    lease_duration_milliseconds: "60000",
  });
  assert.equal(zero.status, "completed");
  if (zero.status === "completed") {
    assert.equal(zero.adapterResult.status, "zero-row");
    if (zero.adapterResult.status === "zero-row") {
      assert.equal(zero.adapterResult.rowCount, 0);
      assert.equal(zero.adapterResult.command, "UPDATE");
    }
  }

  const failure = await captureFailure("SELECT * FROM replay_missing_relation");
  assert.equal(failure.classification, "execution-failure");
  assert.equal(failure.retryClassification, "non-retryable");
  assert.equal(failure.sqlStateClass, "42");
  assert.equal(failure.safeReason, "postgresql-schema-mismatch");
});
