import assert from "node:assert/strict";
import test from "node:test";
import {
  createDurableWorkflowGeneralPostgresqlSameSessionQueryCapabilityV1,
  projectDurableWorkflowDatabaseCardinalityConflictV2,
  projectDurableWorkflowDatabaseNotFoundV2,
  projectDurableWorkflowGeneralQueryFailureV2,
  type DurableWorkflowDatabaseExecutionResult,
  type DurableWorkflowDatabaseExecutionResultV2,
} from "../../../lib/server/productionWorkflowRuntime/durableTransaction";
import type {
  PostgreSQLQueryRequest,
  PostgreSQLQueryResult,
  PostgreSQLTransactionConnection,
} from "../../../lib/server/productionWorkflowRuntime/postgresqlDriver";

const connection = (result: PostgreSQLQueryResult): PostgreSQLTransactionConnection => Object.freeze({
  state: () => "active" as const,
  query: async (_request: PostgreSQLQueryRequest) => result,
  commit: async () => ({ status: "committed" as const }),
  rollback: async () => ({ status: "rolled-back" as const }),
  release: () => "transaction-active" as const,
});

const request = Object.freeze({ statementId: "evidence.query", text: "SELECT 1", values: Object.freeze([]), expectedResult: "single" as const });

test("General failure directly preserves both retryable authority values", async () => {
  for (const retryable of [true, false]) {
    const capability = createDurableWorkflowGeneralPostgresqlSameSessionQueryCapabilityV1({
      transactionConnection: connection({
        status: "failure",
        issue: retryable ? "retryable-conflict" : "schema-mismatch",
        safeReason: retryable ? "postgresql-retryable-conflict" : "postgresql-schema-mismatch",
        diagnostic: {
          stage: "query",
          issue: retryable ? "retryable-conflict" : "schema-mismatch",
          retryable,
          sqlStateClass: retryable ? "40" : "42",
          queryConnectionDisposition: "must-rollback-before-reuse",
        },
      }),
    });
    const result = await capability.executeQuery(request);
    assert.equal(result.status, "execution-failure");
    if (result.status !== "execution-failure") return;
    assert.equal(result.retryable, retryable);
    const durable = projectDurableWorkflowGeneralQueryFailureV2(result, retryable ? "retryable-conflict" : "schema-mismatch");
    assert.equal(durable.retryable, retryable);
    assert.equal(durable.issue, result.classification);
    assert.equal(durable.safeReason, result.safeReason);
    assert.equal(durable.sqlStateClass, result.sqlStateClass);
    assert.equal(durable.queryConnectionDisposition, result.queryConnectionDisposition);
    assert.equal(Object.isFrozen(durable), true);
  }
});

test("not-found evidence projects one-to-one without raw query data", () => {
  const result = projectDurableWorkflowDatabaseNotFoundV2(Object.freeze({
    resultVersion: "1.0", status: "not-found", expectedResult: "single", actualRowCount: 0, command: "SELECT",
  }));
  assert.deepEqual(result, { status: "not-found", expectedResult: "single", actualRowCount: 0, command: "SELECT" });
  for (const forbidden of ["rows", "text", "values", "reason"]) assert.equal(forbidden in result, false);
  assert.equal(Object.isFrozen(result), true);
});

test("cardinality evidence projects exact single and none facts", () => {
  for (const expectedResult of ["single", "none"] as const) {
    const result = projectDurableWorkflowDatabaseCardinalityConflictV2(Object.freeze({
      resultVersion: "1.0", status: "cardinality-conflict", expectedResult, actualRowCount: expectedResult === "single" ? 2 : 1, command: "SELECT",
    }));
    assert.equal(result.expectedResult, expectedResult);
    assert.equal(result.actualRowCount, expectedResult === "single" ? 2 : 1);
    assert.equal(result.command, "SELECT");
    for (const forbidden of ["rows", "text", "values", "reason"]) assert.equal(forbidden in result, false);
    assert.equal(Object.isFrozen(result), true);
  }
});

test("query-only V2 results remain structurally consumable as V1 while requiring evidence", () => {
  const result: DurableWorkflowDatabaseExecutionResultV2 = Object.freeze({ status: "not-found", expectedResult: "single", actualRowCount: 0, command: "SELECT" });
  const v1Result: DurableWorkflowDatabaseExecutionResult = result;
  assert.deepEqual(v1Result, result);
});
