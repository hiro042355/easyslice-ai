import assert from "node:assert/strict";
import test from "node:test";
import {
  isDurableWorkflowDatabaseSafeExecutionFailureV2,
  projectDurableWorkflowDatabaseSafeFailureV2,
} from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import type {
  DurableWorkflowDatabaseCapabilityV2,
  DurableWorkflowDatabaseExecutionResult,
} from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import type { PostgreSQLQueryExecutionFailure } from "@/lib/server/productionWorkflowRuntime/postgresqlDriver";

const source = (withOptional = true): PostgreSQLQueryExecutionFailure => Object.freeze({
  status: "failure",
  issue: "connection-unavailable",
  safeReason: "postgresql-connection-unavailable",
  diagnostic: Object.freeze({
    stage: "query",
    issue: "connection-unavailable",
    retryable: true,
    ...(withOptional
      ? {
          sqlStateClass: "08" as const,
          queryConnectionDisposition: "must-discard" as const,
        }
      : {}),
  }),
});

test("projects the authoritative safe query fields without inference", () => {
  const projected = projectDurableWorkflowDatabaseSafeFailureV2({
    source: source(),
    failure: "unavailable",
  });
  assert.deepEqual(projected, {
    resultVersion: "2.0",
    status: "failure",
    kind: "execution-failure",
    failure: "unavailable",
    retryable: true,
    issue: "connection-unavailable",
    safeReason: "postgresql-connection-unavailable",
    sqlStateClass: "08",
    queryConnectionDisposition: "must-discard",
  });
  assert.equal(Object.isFrozen(projected), true);
  assert.equal(isDurableWorkflowDatabaseSafeExecutionFailureV2(projected), true);
});

test("preserves absent optional diagnostics as absent", () => {
  const projected = projectDurableWorkflowDatabaseSafeFailureV2({
    source: source(false),
    failure: "unavailable",
  });
  assert.equal("sqlStateClass" in projected, false);
  assert.equal("queryConnectionDisposition" in projected, false);
});

test("V2 query execution failures remain structurally compatible with V1 results", async () => {
  const v2: DurableWorkflowDatabaseCapabilityV2 = Object.freeze({
    capabilityVersion: "1.0",
    failureContractVersion: "2.0",
    execute: async () => projectDurableWorkflowDatabaseSafeFailureV2({
      source: source(),
      failure: "unavailable",
    }),
  });
  const result = await v2.execute({ commandVersion: "1.0", statementId: "safe", parameters: [], expectedResult: "many" });
  assert.equal(result.status, "failure");
  if (result.status !== "failure" || result.kind !== "execution-failure") return;
  const v1Result: DurableWorkflowDatabaseExecutionResult = result;
  assert.equal(v1Result.status, "failure");
});

test("validator rejects raw or incomplete failure objects", () => {
  assert.equal(isDurableWorkflowDatabaseSafeExecutionFailureV2(new Error("raw")), false);
  assert.equal(isDurableWorkflowDatabaseSafeExecutionFailureV2({
    resultVersion: "2.0",
    status: "failure",
    kind: "execution-failure",
    failure: "unavailable",
    retryable: false,
    issue: "unknown-failure",
  }), false);
});
