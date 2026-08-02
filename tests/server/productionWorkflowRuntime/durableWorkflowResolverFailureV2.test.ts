import assert from "node:assert/strict";
import test from "node:test";
import {
  createDurableWorkflowResolverFailureV2,
  isDurableWorkflowDatabaseResolverFailureV2,
  type DurableWorkflowDatabaseCapability,
  type DurableWorkflowDatabaseCapabilityV2,
  type DurableWorkflowDatabaseExecutionResultV2,
} from "../../../lib/server/productionWorkflowRuntime/durableTransaction";

test("every resolver reason maps exhaustively to an immutable pre-query failure", () => {
  const cases = [
    [{ status: "unsupported-statement", statementId: "safe.unknown" } as const, "unsupported-statement"],
    [{ status: "invalid-request", reason: "parameter-count-mismatch" } as const, "parameter-count-mismatch"],
    [{ status: "invalid-request", reason: "cardinality-mismatch" } as const, "cardinality-mismatch"],
  ] as const;
  for (const [source, reason] of cases) {
    const projected = createDurableWorkflowResolverFailureV2(source);
    assert.deepEqual(projected, {
      resultVersion: "2.0",
      status: "failure",
      kind: "resolver-failure",
      phase: "statement-resolution",
      reason,
      queryInvoked: false,
      mutationAttempted: false,
      retryAttempted: false,
      ownerAction: "do-not-commit",
    });
    assert.equal(Object.isFrozen(projected), true);
    assert.equal(isDurableWorkflowDatabaseResolverFailureV2(projected), true);
  }
});

test("resolver failure exposes no PostgreSQL, query, payload, or transport fields", () => {
  const projected = createDurableWorkflowResolverFailureV2({ status: "unsupported-statement", statementId: "private-input" });
  for (const forbidden of [
    "statementId", "issue", "safeReason", "retryable", "sqlStateClass",
    "queryConnectionDisposition", "command", "actualRowCount", "sql", "text",
    "bindings", "values", "request", "error", "message", "stack",
  ]) assert.equal(forbidden in projected, false);
});

test("validator rejects arbitrary reasons and incomplete evidence", () => {
  assert.equal(isDurableWorkflowDatabaseResolverFailureV2({
    resultVersion: "2.0", status: "failure", kind: "resolver-failure",
    phase: "statement-resolution", reason: "arbitrary", queryInvoked: false,
    mutationAttempted: false, retryAttempted: false, ownerAction: "do-not-commit",
  }), false);
  assert.equal(isDurableWorkflowDatabaseResolverFailureV2({ status: "failure", kind: "resolver-failure" }), false);
});

test("V2 union accepts resolver failure without disguising it as a V1 execution failure", () => {
  const value: DurableWorkflowDatabaseExecutionResultV2 = createDurableWorkflowResolverFailureV2({
    status: "invalid-request", reason: "cardinality-mismatch",
  });
  const v2: DurableWorkflowDatabaseCapabilityV2 = Object.freeze({
    capabilityVersion: "1.0", failureContractVersion: "2.0", execute: async () => value,
  });
  // @ts-expect-error Resolver failure has no fabricated V1 failure or transport retry fields.
  const v1: DurableWorkflowDatabaseCapability = v2;
  void v1;
});
