import assert from "node:assert/strict";
import test from "node:test";

import type {
  MultiCutReplayPostgresqlPureExecutionParameter,
  MultiCutReplayPostgresqlPureExecutionRequest,
} from "../../../lib/server/multiCutReplayPostgresqlAdapter";
import {
  createMultiCutReplayPostgresqlProductionBridge,
  projectMultiCutReplayPostgresqlParameter,
} from "../../../lib/server/multiCutReplayPostgresqlProductionBridge";
import type {
  PostgreSQLCommitResult,
  PostgreSQLConnection,
  PostgreSQLConnectionState,
  PostgreSQLConnectionPool,
  PostgreSQLPoolState,
  PostgreSQLQueryRequest,
  PostgreSQLQueryResult,
  PostgreSQLRollbackResult,
  PostgreSQLTransactionConnection,
  PostgreSQLTransactionState,
} from "../../../lib/server/productionWorkflowRuntime/postgresqlDriver";

const parameter = (
  postgresqlCast:
    MultiCutReplayPostgresqlPureExecutionParameter["postgresqlCast"],
  value: unknown,
): MultiCutReplayPostgresqlPureExecutionParameter =>
  Object.freeze({
    ordinal: 1,
    token: "$1",
    postgresqlCast,
    physicalField: "fixture_field",
    parameterBinding: "fixture_binding",
    value,
  });

test("all parameter casts project exactly and invalid values fail closed", () => {
  assert.deepEqual(
    projectMultiCutReplayPostgresqlParameter(
      parameter("uuid", "123e4567-e89b-42d3-a456-426614174000"),
    ),
    { kind: "uuid", value: "123e4567-e89b-42d3-a456-426614174000" },
  );
  assert.deepEqual(
    projectMultiCutReplayPostgresqlParameter(parameter("text", "value")),
    { kind: "string", value: "value" },
  );
  assert.deepEqual(
    projectMultiCutReplayPostgresqlParameter(parameter("integer", 42)),
    { kind: "safe-integer", value: 42 },
  );
  assert.deepEqual(
    projectMultiCutReplayPostgresqlParameter(
      parameter("bigint", "9223372036854775807"),
    ),
    { kind: "bigint", value: "9223372036854775807" },
  );
  assert.deepEqual(
    projectMultiCutReplayPostgresqlParameter(
      parameter("timestamptz", "2026-07-30T00:00:00.000Z"),
    ),
    { kind: "utc-timestamp", value: "2026-07-30T00:00:00.000Z" },
  );
  for (const invalid of [
    parameter("uuid", "not-uuid"),
    parameter("text", 1),
    parameter("integer", 2_147_483_648),
    parameter("bigint", "9223372036854775808"),
    parameter("timestamptz", "2026-07-30T09:00:00+09:00"),
  ]) {
    assert.throws(
      () => projectMultiCutReplayPostgresqlParameter(invalid),
      ({ kind, safeReason }) =>
        kind === "query-rejected" &&
        safeReason === "invalid-postgresql-parameter",
    );
  }
});

type FixtureOptions = Readonly<{
  queryResult?: PostgreSQLQueryResult;
  commitResult?: PostgreSQLCommitResult;
  rollbackResult?: PostgreSQLRollbackResult;
}>;

const createFixture = (options: FixtureOptions = {}) => {
  const log: string[] = [];
  const requests: unknown[] = [];
  let active = false;
  let discarded = false;
  let released = false;
  const transaction: PostgreSQLTransactionConnection = Object.freeze({
    state: (): PostgreSQLTransactionState =>
      active ? "active" : "committed",
    async query(request: PostgreSQLQueryRequest) {
      log.push("query");
      requests.push(request);
      return options.queryResult ?? Object.freeze({
        status: "success",
        rows: Object.freeze([]),
        rowCount: 0,
        command: "UPDATE",
      });
    },
    async commit() {
      log.push("commit");
      active = false;
      const result = options.commitResult ?? Object.freeze({ status: "committed" });
      if (result.status === "unknown-outcome") discarded = true;
      return result;
    },
    async rollback() {
      log.push("rollback");
      active = false;
      return options.rollbackResult ?? Object.freeze({ status: "rolled-back" });
    },
    release: (): "released" => "released",
  });
  const connection: PostgreSQLConnection = Object.freeze({
    state: (): PostgreSQLConnectionState =>
      discarded ? "discarded" : released ? "released" : active
        ? "transaction-active" : "checked-out",
    async query() {
      throw new Error("direct-query-forbidden");
    },
    async begin() {
      log.push("begin");
      active = true;
      return transaction;
    },
    release() {
      log.push("release");
      if (discarded || released) return "already-released";
      if (active) return "transaction-active";
      released = true;
      return "released";
    },
    discard() {
      log.push("discard");
      if (discarded || released) return "already-released";
      discarded = true;
      active = false;
      return "discarded";
    },
  });
  const pool: PostgreSQLConnectionPool = Object.freeze({
    state: (): PostgreSQLPoolState => "ready",
    start: async (): Promise<"already-started"> => "already-started",
    async checkout() {
      log.push("checkout");
      return connection;
    },
    close: async (): Promise<"closed"> => "closed",
  });
  return { pool, log, requests };
};

const request = (
  projectedParameter = parameter("text", "value"),
): MultiCutReplayPostgresqlPureExecutionRequest =>
  Object.freeze({
    requestVersion: "1.0",
    statementId: "renew-processing-reservation",
    sql: "UPDATE fixture SET value = $1::text RETURNING value",
    parameters: Object.freeze([projectedParameter]),
    values: Object.freeze([projectedParameter.value]),
  });

test("query request, zero rows, and command are projected without classification", async () => {
  const fixture = createFixture();
  const driver = createMultiCutReplayPostgresqlProductionBridge(fixture);
  const connection = await driver.acquire();
  await connection.begin();
  const result = await connection.query(request());
  assert.deepEqual(result, { rows: [], rowCount: 0, command: "UPDATE" });
  const projected = fixture.requests[0] as {
    expectedResult: string;
    values: readonly unknown[];
  };
  assert.equal(projected.expectedResult, "many");
  assert.deepEqual(projected.values, [{ kind: "string", value: "value" }]);
  await connection.commit();
  await driver.release(connection);
  assert.deepEqual(fixture.log, [
    "checkout", "begin", "query", "commit", "release",
  ]);
});

test("rows are copy-isolated and null is preserved", async () => {
  const bytes = new Uint8Array([1, 2]);
  const nested = { values: [1, null] };
  const fixture = createFixture({
    queryResult: Object.freeze({
      status: "success",
      rows: Object.freeze([Object.freeze({ bytes, nested, empty: null })]),
      rowCount: 1,
      command: "SELECT",
    }),
  });
  const connection =
    await createMultiCutReplayPostgresqlProductionBridge(fixture).acquire();
  await connection.begin();
  const result = await connection.query(request());
  bytes[0] = 9;
  nested.values[0] = 9;
  assert.deepEqual(result.rows[0], {
    bytes: new Uint8Array([1, 2]),
    nested: { values: [1, null] },
    empty: null,
  });
  assert.equal(result.command, "SELECT");
});

test("driver failures preserve classification and safe SQLSTATE only", async () => {
  const fixture = createFixture({
    queryResult: Object.freeze({
      status: "failure",
      issue: "retryable-conflict",
      diagnostic: Object.freeze({
        stage: "query",
        issue: "retryable-conflict",
        sqlStateClass: "40",
        retryable: true,
      }),
    }),
  });
  const connection =
    await createMultiCutReplayPostgresqlProductionBridge(fixture).acquire();
  await connection.begin();
  await assert.rejects(
    connection.query(request()),
    (failure: unknown) => {
      const value = failure as Record<string, unknown>;
      return (
        value.kind === "serialization-conflict" &&
        value.retryable === true &&
        value.sqlStateClass === "40" &&
        value.originalCauseRetained === false
      );
    },
  );
});

test("bounded timeout remains non-retryable and preserves only safe class 57", async () => {
  const fixture = createFixture({
    queryResult: Object.freeze({
      status: "failure",
      issue: "timeout",
      diagnostic: Object.freeze({
        stage: "query",
        issue: "timeout",
        sqlStateClass: "57",
        retryable: false,
      }),
    }),
  });
  const connection =
    await createMultiCutReplayPostgresqlProductionBridge(fixture).acquire();
  await connection.begin();
  await assert.rejects(
    connection.query(request()),
    (failure: unknown) => {
      const value = failure as Record<string, unknown>;
      return (
        value.kind === "query-rejected" &&
        value.safeReason === "postgresql-timeout" &&
        value.retryable === true &&
        value.sqlStateClass === "57" &&
        value.originalCauseRetained === false
      );
    },
  );
});

test("commit unknown is preserved, discarded, and subsequent release is safe", async () => {
  const fixture = createFixture({
    commitResult: Object.freeze({ status: "unknown-outcome" }),
  });
  const driver = createMultiCutReplayPostgresqlProductionBridge(fixture);
  const connection = await driver.acquire();
  await connection.begin();
  await assert.rejects(
    connection.commit(),
    (failure: unknown) => {
      const value = failure as Record<string, unknown>;
      return (
        value.kind === "commit-outcome-unknown" &&
        value.commitUnknown === true &&
        value.reconciliationRequired === true
      );
    },
  );
  await driver.release(connection);
  assert.deepEqual(fixture.log, ["checkout", "begin", "commit", "release"]);
});

test("release of an active transaction discards instead of returning it to pool", async () => {
  const fixture = createFixture();
  const driver = createMultiCutReplayPostgresqlProductionBridge(fixture);
  const connection = await driver.acquire();
  await connection.begin();
  await driver.release(connection);
  assert.deepEqual(fixture.log, ["checkout", "begin", "release", "discard"]);
});
