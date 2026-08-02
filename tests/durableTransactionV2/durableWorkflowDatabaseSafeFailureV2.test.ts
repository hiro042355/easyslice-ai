import assert from "node:assert/strict";
import test from "node:test";
import {
  isDurableWorkflowDatabaseSafeExecutionFailureV2,
  projectDurableWorkflowDatabaseSafeFailureV2,
} from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import type {
  DurableWorkflowDatabaseCapability,
  DurableWorkflowDatabaseCapabilityV2,
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

test("V2 capability remains structurally compatible with V1 consumers", () => {
  const v2: DurableWorkflowDatabaseCapabilityV2 = Object.freeze({
    capabilityVersion: "1.0",
    failureContractVersion: "2.0",
    execute: async () => projectDurableWorkflowDatabaseSafeFailureV2({
      source: source(),
      failure: "unavailable",
    }),
  });
  const v1Consumer: DurableWorkflowDatabaseCapability = v2;
  assert.equal(typeof v1Consumer.execute, "function");
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
