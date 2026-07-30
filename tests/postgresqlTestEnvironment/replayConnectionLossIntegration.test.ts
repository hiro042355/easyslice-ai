import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { PoolClient } from "pg";

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
  PostgreSQLConnectionPoolAdapter,
  type PostgreSQLConnection,
  type PostgreSQLConnectionConfig,
  type PostgreSQLQueryRequest,
} from "../../lib/server/productionWorkflowRuntime/postgresqlDriver";

let environment: PostgreSqlTestEnvironment;
let composition: MultiCutReplayPostgresqlProductionComposition;
let targetPool: PostgreSQLConnectionPoolAdapter;
let provider: ReturnType<
  typeof createMultiCutReplayPostgresqlDriverConnectionProvider
>;
let sequence = 0;

before(async () => {
  environment = await startPostgreSqlTestEnvironment();
  const config: PostgreSQLConnectionConfig = {
    ...environment.connection,
    maxConnections: 4,
    connectionTimeoutMs: 5_000,
    idleTimeoutMs: 5_000,
    applicationName: "replay-connection-loss-integration",
    tls: { mode: "disabled" },
  };
  const composed =
    await createMultiCutReplayPostgresqlProductionComposition(config);
  assert.equal(composed.status, "ready");
  if (composed.status !== "ready") throw new Error("composition-not-ready");
  composition = composed.composition;
  targetPool = new PostgreSQLConnectionPoolAdapter(config);
  assert.equal(await targetPool.start(), "ready");
  provider = createMultiCutReplayPostgresqlDriverConnectionProvider(
    createMultiCutReplayPostgresqlProductionBridge({ pool: targetPool }),
  );
});

after(async () => {
  if (composition) {
    assert.deepEqual(await composition.shutdown(), { status: "closed" });
  }
  if (targetPool) assert.equal(await targetPool.close(), "closed");
  if (environment) await environment.stop();
});

const lowLevelRequest = (
  statementId: string,
  text: string,
  expectedResult: PostgreSQLQueryRequest["expectedResult"] = "many",
): PostgreSQLQueryRequest => Object.freeze({
  statementId,
  text,
  values: Object.freeze([]),
  expectedResult,
});

const bridgeRequest = (
  statementId:
    Parameters<typeof composition.runtime.execute>[0]["statementId"],
  sql: string,
) => Object.freeze({
  requestVersion: "1.0" as const,
  statementId,
  sql,
  parameters: Object.freeze([]),
  values: Object.freeze([]),
});

const backendPid = async (
  connection: PostgreSQLConnection,
  statementId: string,
): Promise<number> => {
  const result = await connection.query(
    lowLevelRequest(statementId, "SELECT pg_backend_pid() AS backend_pid", "single"),
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") throw new Error("backend-pid-unavailable");
  const value = result.rows[0]?.backend_pid;
  assert.equal(typeof value, "number");
  return value as number;
};

const terminate = async (
  admin: PoolClient,
  targetPid: number,
) => {
  const adminPid = await admin.query<{ backend_pid: number }>(
    "SELECT pg_backend_pid() AS backend_pid",
  );
  assert.notEqual(adminPid.rows[0].backend_pid, targetPid);
  const result = await admin.query<{ terminated: boolean }>(
    "SELECT pg_terminate_backend($1, 5000) AS terminated",
    [targetPid],
  );
  assert.equal(result.rows[0].terminated, true);
};

const assertConnectionFailure = (
  result: Awaited<ReturnType<PostgreSQLConnection["query"]>>,
) => {
  assert.equal(result.status, "failure");
  if (result.status !== "failure") throw new Error("connection-loss-not-observed");
  assert.equal(result.issue, "connection-unavailable");
  assert.equal(result.diagnostic.retryable, false);
  if (result.diagnostic.sqlStateClass !== undefined) {
    assert.ok(
      result.diagnostic.sqlStateClass === "08" ||
        result.diagnostic.sqlStateClass === "57",
    );
  }
  assert.equal("command" in result, false);
  assert.equal("rowCount" in result, false);
};

test("query-stage backend termination is deterministic and pool recovery is repeatable", async () => {
  const admin = await environment.pool.connect();
  const terminatedPids: number[] = [];
  try {
    for (const attempt of [1, 2]) {
      const target = await targetPool.checkout();
      assert.equal("status" in target, false);
      if ("status" in target) throw new Error("target-checkout-failed");
      const pid = await backendPid(target, `connection-loss.pid.${attempt}`);
      assert.equal(terminatedPids.includes(pid), false);
      terminatedPids.push(pid);

      const lockKey = 8_100 + attempt;
      await admin.query("SELECT pg_advisory_lock($1)", [lockKey]);
      try {
        const pending = target.query(lowLevelRequest(
          `connection-loss.blocked.${attempt}`,
          `SELECT pg_advisory_lock(${lockKey})`,
          "single",
        ));
        await terminate(admin, pid);
        assertConnectionFailure(await pending);
      } finally {
        await admin.query("SELECT pg_advisory_unlock($1)", [lockKey]);
        assert.equal(target.discard(), "discarded");
      }

      const replacement = await targetPool.checkout();
      assert.equal("status" in replacement, false);
      if ("status" in replacement) throw new Error("replacement-checkout-failed");
      const replacementPid = await backendPid(
        replacement,
        `connection-loss.replacement-pid.${attempt}`,
      );
      assert.notEqual(replacementPid, pid);
      const healthy = await replacement.query(lowLevelRequest(
        `connection-loss.recovered.${attempt}`,
        "SELECT 1 AS healthy",
        "single",
      ));
      assert.equal(healthy.status, "success");
      if (healthy.status === "success") {
        assert.equal(healthy.command, "SELECT");
        assert.equal(healthy.rowCount, 1);
      }
      assert.equal(replacement.release(), "released");
    }
  } finally {
    admin.release();
  }
});

test("transaction-stage loss discards the client and rolls back uncommitted replay mutation", async () => {
  sequence += 1;
  const replayIdentity = {
    physical_schema_version: "2.0",
    logical_schema_version: "2.0",
    identity_version: "2.0",
    scope_version: "1.0",
    replay_namespace: "multi-cut",
    tenant_identity_version: "1.0",
    protected_tenant_identity: "tenant:connection-loss",
    operation_identity: "operation:connection-loss",
    key_identity: `key:connection-loss:${sequence}`,
  };
  const created = await composition.runtime.execute({
    inputVersion: "1.0",
    statementId: "resolve-new-reservation",
    bindings: {
      internal_record_id: `40000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
      replay_identity: replayIdentity,
      request_fingerprint_identity: "fingerprint:before-loss",
      reservation_identity: "reservation:connection-loss",
      lease_identity: "lease:connection-loss",
      lease_duration_milliseconds: "60000",
    },
  });
  assert.equal(created.status, "completed");

  const admin = await environment.pool.connect();
  const target = await provider.acquire();
  await target.begin();
  try {
    const pidResult = await target.execute(bridgeRequest(
      "lookup-authoritative-replay",
      "SELECT pg_backend_pid() AS backend_pid",
    ));
    assert.equal(pidResult.rowCount, 1);
    const pid = pidResult.rows[0]?.backend_pid;
    assert.equal(typeof pid, "number");

    const changed = await target.execute(bridgeRequest(
      "renew-processing-reservation",
      `UPDATE ${schema.table.name}
        SET request_fingerprint_identity = 'fingerprint:must-rollback'
        WHERE key_identity = '${replayIdentity.key_identity}'
        RETURNING key_identity`,
    ));
    assert.equal(changed.command, "UPDATE");
    assert.equal(changed.rowCount, 1);

    const lockKey = 8_200 + sequence;
    await admin.query("SELECT pg_advisory_lock($1)", [lockKey]);
    try {
      const pending = target.execute(bridgeRequest(
        "complete-processing-replay",
        `SELECT pg_advisory_lock(${lockKey})`,
      )).then(
        (result) => ({ status: "completed" as const, result }),
        (failure: unknown) => ({ status: "failed" as const, failure }),
      );
      await terminate(admin, pid as number);
      const outcome = await pending;
      assert.equal(outcome.status, "failed");
      if (outcome.status !== "failed") throw new Error("loss-not-observed");
      const failure =
        outcome.failure as MultiCutReplayPostgresqlDriverFailure;
      assert.equal(failure.classification, "execution-failure");
      assert.equal(failure.retryClassification, "retryable");
      assert.equal(failure.safeReason, "postgresql-connection-unavailable");
      if (failure.sqlStateClass !== undefined) {
        assert.ok(failure.sqlStateClass === "08" || failure.sqlStateClass === "57");
      }
      assert.equal("command" in failure, false);
      assert.equal("rowCount" in failure, false);
    } finally {
      await admin.query("SELECT pg_advisory_unlock($1)", [lockKey]);
    }

    let rollbackFailure: MultiCutReplayPostgresqlDriverFailure | undefined;
    try {
      await target.rollback();
    } catch (value) {
      rollbackFailure = value as MultiCutReplayPostgresqlDriverFailure;
    }
    assert.ok(rollbackFailure);
    assert.equal(rollbackFailure.classification, "execution-failure");
  } finally {
    await provider.release(target);
    admin.release();
  }

  const persisted = await environment.pool.query<{
    request_fingerprint_identity: string;
  }>(
    `SELECT request_fingerprint_identity FROM ${schema.table.name}
      WHERE key_identity = $1`,
    [replayIdentity.key_identity],
  );
  assert.equal(persisted.rows.length, 1);
  assert.equal(
    persisted.rows[0].request_fingerprint_identity,
    "fingerprint:before-loss",
  );

  const replacement = await provider.acquire();
  await replacement.begin();
  const healthy = await replacement.execute(bridgeRequest(
    "fail-processing-replay",
    "SELECT 1 AS healthy",
  ));
  assert.equal(healthy.command, "SELECT");
  assert.equal(healthy.rowCount, 1);
  await replacement.commit();
  await provider.release(replacement);
});
