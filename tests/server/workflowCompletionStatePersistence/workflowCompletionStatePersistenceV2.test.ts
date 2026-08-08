import assert from "node:assert/strict";
import test from "node:test";
import type { DurableWorkflowSameSessionQueryCapabilityV2 } from "../../../lib/server/productionWorkflowRuntime/durableTransaction";
import { createWorkflowCompletionTransitionRequest } from "../../../lib/server/workflowCompletionState";
import { executeWorkflowCompletionStateTransitionV2 } from "../../../lib/server/workflowCompletionStatePersistence";

const built = createWorkflowCompletionTransitionRequest({
  workflowIdentity: Object.freeze({ identityVersion: "1.0", namespace: "workflow-completion", protectedValue: "workflow-v2" }),
  logicalAttemptIdentity: Object.freeze({ identityVersion: "1.0", namespace: "workflow-completion", protectedValue: "attempt-v2" }),
  expectedRevision: "0",
  completionTimestamp: "2026-08-08T00:00:00.000Z",
  resultReference: Object.freeze({ referenceVersion: "1.0", resultReferenceIdentity: "result-v2" }),
});
if (built.status !== "valid") throw new Error("fixture-invalid");

for (const retryable of [true, false] as const) {
  test(`V2 preserves authoritative retryable=${retryable} without retry`, async () => {
    let calls = 0;
    const query: DurableWorkflowSameSessionQueryCapabilityV2 = Object.freeze({
      capabilityVersion: "2.0",
      evidence: Object.freeze({ evidenceVersion: "1.0", sessionScope: "workflow-transaction", sessionAffinity: "same-session-required", transactionOwnership: "workflow-owner", separateConnectionPermitted: false, capabilityOwnsLifecycle: false, validOnlyDuringActiveTransaction: true }),
      executeQuery: async () => {
        calls += 1;
        return Object.freeze({
          resultVersion: "2.0",
          status: "execution-failure",
          phase: "query",
          classification: "timeout",
          safeReason: "postgresql-timeout",
          retryable,
          sqlStateClass: "57",
          queryConnectionDisposition: "must-rollback-before-reuse",
        });
      },
    });
    const result = await executeWorkflowCompletionStateTransitionV2(Object.freeze({
      inputVersion: "2.0",
      query,
      transitionRequest: built.request,
    }));
    assert.deepEqual(result, {
      resultVersion: "2.0",
      status: "execution-failure",
      issue: "timeout",
      safeReason: "postgresql-timeout",
      retryable,
      sqlStateClass: "57",
      queryConnectionDisposition: "must-rollback-before-reuse",
      ownerAction: "rollback-required",
    });
    assert.equal(calls, 1);
  });
}
