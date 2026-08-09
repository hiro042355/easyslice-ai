import assert from "node:assert/strict";
import test from "node:test";
import { PostgreSQLTransactionConnectionAdapter } from "../../../lib/server/productionWorkflowRuntime/postgresqlDriver/postgresqlTransactionConnection";

const request = Object.freeze({ statementId: "test.v2", text: "SELECT 1", values: Object.freeze([]), expectedResult: "many" as const });
test("query V2 preserves all authoritative dispositions and invokes the query once", async () => {
  for (const disposition of ["safe-to-reuse", "must-rollback-before-reuse", "must-discard", "unknown"] as const) {
    let calls = 0;
    const connection = new PostgreSQLTransactionConnectionAdapter({} as never, async () => { calls += 1; return Object.freeze({ status: "failure", issue: "unknown-failure", safeReason: "postgresql-unknown-failure", diagnostic: Object.freeze({ stage: "query", issue: "unknown-failure", retryable: false, queryConnectionDisposition: disposition }) }); }, () => {}, () => {});
    const result = await connection.queryV2(request);
    assert.equal(calls, 1); assert.equal(result.status, "failure");
    if (result.status === "failure") assert.equal(result.diagnostic.queryConnectionDisposition, disposition);
  }
});
test("query V2 rejects missing authority without inventing unknown", async () => {
  const connection = new PostgreSQLTransactionConnectionAdapter({} as never, async () => Object.freeze({ status: "failure", issue: "invalid-request", safeReason: "postgresql-invalid-request", diagnostic: Object.freeze({ stage: "query", issue: "invalid-request", retryable: false }) }), () => {}, () => {});
  await assert.rejects(connection.queryV2(request), /missing-authoritative/);
});
