import assert from "node:assert/strict";
import test from "node:test";
import {
  createDurableWorkflowPostgresqlSameSessionQueryCapability,
  type DurableWorkflowSameSessionQueryRequestV1,
  type DurableWorkflowTransactionContextV3,
} from "../../../lib/server/productionWorkflowRuntime/durableTransaction";
import type {
  PostgreSQLQueryRequest,
  PostgreSQLQueryResult,
  PostgreSQLTransactionConnection,
} from "../../../lib/server/productionWorkflowRuntime/postgresqlDriver";
import { PostgreSQLTransactionConnectionAdapter } from "../../../lib/server/productionWorkflowRuntime/postgresqlDriver/postgresqlTransactionConnection";

const request = (): DurableWorkflowSameSessionQueryRequestV1 => ({
  statementId: "workflow.same-session",
  text: "SELECT $1::jsonb AS payload, $2::bytea AS bytes",
  values: [
    { kind: "json", value: { nested: ["original"] } },
    { kind: "bytea", value: new Uint8Array([1, 2, 3]) },
  ],
  expectedResult: "many",
});

function fakeConnection(
  query: (request: PostgreSQLQueryRequest) => Promise<PostgreSQLQueryResult>,
): PostgreSQLTransactionConnection {
  return Object.freeze({
    state: () => "active" as const,
    query,
    commit: async () => ({ status: "committed" as const }),
    rollback: async () => ({ status: "rolled-back" as const }),
    release: () => "transaction-active" as const,
  });
}

test("factory exposes only the versioned query capability and same-session evidence", () => {
  const capability = createDurableWorkflowPostgresqlSameSessionQueryCapability({
    transactionConnection: fakeConnection(async () => ({
      status: "success", rows: [], rowCount: 0, command: "SELECT",
    })),
  });

  assert.deepEqual(Object.keys(capability).sort(), [
    "capabilityVersion", "evidence", "executeQuery",
  ]);
  assert.equal(capability.capabilityVersion, "1.0");
  assert.equal(capability.evidence.transactionOwnership, "workflow-owner");
  assert.equal(capability.evidence.separateConnectionPermitted, false);
  assert.equal(capability.evidence.capabilityOwnsLifecycle, false);
  assert.equal(Object.isFrozen(capability), true);
  assert.equal(Object.isFrozen(capability.evidence), true);
  for (const forbidden of ["begin", "commit", "rollback", "acquire", "release", "discard", "close", "connection", "client"]) {
    assert.equal(forbidden in capability, false);
  }
});

test("executeQuery delegates exactly once and copy-isolates request and success", async () => {
  let calls = 0;
  let captured: PostgreSQLQueryRequest | undefined;
  const rawJson = { nested: ["database"] };
  const rawBytes = new Uint8Array([7, 8]);
  const rawRows = [{ payload: rawJson, bytes: rawBytes, nullable: null }];
  const capability = createDurableWorkflowPostgresqlSameSessionQueryCapability({
    transactionConnection: fakeConnection(async (input) => {
      calls += 1;
      captured = input;
      return { status: "success", rows: rawRows, rowCount: 1, command: "CUSTOM" };
    }),
  });
  const input = request();
  const result = await capability.executeQuery(input);

  assert.equal(calls, 1);
  assert.notEqual(captured, input);
  assert.equal(captured?.expectedResult, "many");
  assert.deepEqual(captured?.values, input.values);
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.equal(result.command, "CUSTOM");
  assert.equal(result.rowCount, 1);
  assert.deepEqual(result.rows, rawRows);
  assert.notEqual(result.rows, rawRows);
  assert.notEqual(result.rows[0], rawRows[0]);
  rawJson.nested[0] = "mutated";
  rawBytes[0] = 0;
  assert.deepEqual(result.rows[0]?.payload, { nested: ["database"] });
  assert.deepEqual(result.rows[0]?.bytes, new Uint8Array([7, 8]));
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.rows), true);
  assert.equal(Object.isFrozen(result.rows[0]), true);
});

test("zero rows remain success without command or cardinality inference", async () => {
  const capability = createDurableWorkflowPostgresqlSameSessionQueryCapability({
    transactionConnection: fakeConnection(async () => ({
      status: "success", rows: [], rowCount: 0, command: "UPDATE",
    })),
  });
  const result = await capability.executeQuery(request());
  assert.deepEqual(result, {
    resultVersion: "1.0", status: "success", rows: [], rowCount: 0, command: "UPDATE",
  });
  assert.equal("not-found" in result, false);
  assert.equal("cardinality-conflict" in result, false);
});

test("failure preserves only safe transport facts without defaults or policy", async () => {
  for (const disposition of [
    "safe-to-reuse", "must-rollback-before-reuse", "must-discard", "unknown",
  ] as const) {
    const capability = createDurableWorkflowPostgresqlSameSessionQueryCapability({
      transactionConnection: fakeConnection(async () => ({
        status: "failure",
        issue: "timeout",
        safeReason: "postgresql-timeout",
        diagnostic: {
          stage: "query",
          issue: "timeout",
          sqlStateClass: "57",
          retryable: true,
          queryConnectionDisposition: disposition,
        },
      })),
    });
    const result = await capability.executeQuery(request());
    assert.deepEqual(result, {
      resultVersion: "1.0",
      status: "execution-failure",
      phase: "query",
      classification: "timeout",
      safeReason: "postgresql-timeout",
      sqlStateClass: "57",
      queryConnectionDisposition: disposition,
    });
    for (const forbidden of ["retryMetadata", "reconciliationMetadata", "retryable", "diagnostic", "sqlState", "error", "stack", "text", "values", "commit-unknown"]) {
      assert.equal(forbidden in result, false);
    }
  }
});

test("optional safe failure facts remain absent and transaction-ended rejection is delegated once", async () => {
  let calls = 0;
  const capability = createDurableWorkflowPostgresqlSameSessionQueryCapability({
    transactionConnection: fakeConnection(async () => {
      calls += 1;
      return {
        status: "failure",
        issue: "disposed",
        safeReason: "postgresql-disposed",
        diagnostic: { stage: "query", issue: "disposed", retryable: false },
      };
    }),
  });
  const result = await capability.executeQuery(request());
  assert.equal(calls, 1);
  assert.equal(result.status, "execution-failure");
  assert.equal("sqlStateClass" in result, false);
  assert.equal("queryConnectionDisposition" in result, false);
});

test("committed, rolled-back, released, discarded, and unknown transactions reject without query execution", async () => {
  const scenarios = ["committed", "rolled-back", "released", "discarded", "unknown"] as const;
  for (const scenario of scenarios) {
    let executions = 0;
    const client = {
      async query() {
        if (scenario === "unknown") throw new Error("commit-unknown");
        return { command: scenario === "rolled-back" ? "ROLLBACK" : "COMMIT", rows: [], rowCount: 0, fields: [] };
      },
    };
    const transaction = new PostgreSQLTransactionConnectionAdapter(
      client as never,
      async () => {
        executions += 1;
        return { status: "success", rows: [], rowCount: 0, command: "SELECT" };
      },
      () => {},
      () => {},
      () => {},
    );
    if (scenario === "rolled-back") await transaction.rollback();
    else if (scenario === "discarded") transaction.markDiscarded();
    else {
      await transaction.commit();
      if (scenario === "released") transaction.release();
    }
    const capability = createDurableWorkflowPostgresqlSameSessionQueryCapability({
      transactionConnection: transaction,
    });
    const result = await capability.executeQuery(request());
    assert.equal(result.status, "execution-failure");
    if (result.status === "execution-failure") {
      assert.equal(result.classification, "disposed");
      assert.equal(result.safeReason, "postgresql-disposed");
    }
    assert.equal(executions, 0);
  }
});

test("capability is compatible with Context V3 without changing Context V2", () => {
  const capability = createDurableWorkflowPostgresqlSameSessionQueryCapability({
    transactionConnection: fakeConnection(async () => ({ status: "success", rows: [], rowCount: 0, command: "SELECT" })),
  });
  const acceptsV3 = (_value: DurableWorkflowTransactionContextV3["sameSessionQuery"]): void => {};
  acceptsV3(capability);
});

test("many-only request rejects other cardinalities at compile time", () => {
  const single: DurableWorkflowSameSessionQueryRequestV1 = {
    ...request(),
    // @ts-expect-error Same-session capability accepts many only.
    expectedResult: "single",
  };
  const none: DurableWorkflowSameSessionQueryRequestV1 = {
    ...request(),
    // @ts-expect-error Same-session capability accepts many only.
    expectedResult: "none",
  };
  void single;
  void none;
});
