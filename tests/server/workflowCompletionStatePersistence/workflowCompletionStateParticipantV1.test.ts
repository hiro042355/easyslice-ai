import assert from "node:assert/strict";
import test from "node:test";
import type { DurableWorkflowSameSessionQueryCapabilityV2, DurableWorkflowSameSessionQueryResultV2 } from "../../../lib/server/productionWorkflowRuntime/durableTransaction";
import { createWorkflowCompletionTransitionRequest } from "../../../lib/server/workflowCompletionState";
import { createWorkflowCompletionStateSameSessionParticipantV1 } from "../../../lib/server/workflowCompletionStatePersistence";

const requestResult = createWorkflowCompletionTransitionRequest({
  workflowIdentity: Object.freeze({ identityVersion: "1.0", namespace: "workflow-completion", protectedValue: "participant-workflow" }),
  logicalAttemptIdentity: Object.freeze({ identityVersion: "1.0", namespace: "workflow-completion", protectedValue: "participant-attempt" }),
  expectedRevision: "0",
  completionTimestamp: "2026-08-08T00:00:00.000Z",
  resultReference: Object.freeze({ referenceVersion: "1.0", resultReferenceIdentity: "participant-result" }),
});
if (requestResult.status !== "valid") throw new Error("fixture-invalid");

const execute = async (source: DurableWorkflowSameSessionQueryResultV2) => {
  let calls = 0;
  const query: DurableWorkflowSameSessionQueryCapabilityV2 = Object.freeze({
    capabilityVersion: "2.0",
    evidence: Object.freeze({ evidenceVersion: "1.0", sessionScope: "workflow-transaction", sessionAffinity: "same-session-required", transactionOwnership: "workflow-owner", separateConnectionPermitted: false, capabilityOwnsLifecycle: false, validOnlyDuringActiveTransaction: true }),
    executeQuery: async () => { calls += 1; return source; },
  });
  const participant = createWorkflowCompletionStateSameSessionParticipantV1(Object.freeze({ factoryVersion: "1.0", sameSessionQuery: query }));
  return { participant, result: await participant.transition(requestResult.request), calls };
};

test("participant projects every executor V2 outcome exactly once", async () => {
  const transitioned = await execute(Object.freeze({ resultVersion: "2.0", status: "success", rows: Object.freeze([Object.freeze({ state: "completed", revision: "1" })]), rowCount: 1, command: "UPDATE" }));
  assert.equal(transitioned.result.status, "transitioned");
  assert.equal(transitioned.calls, 1);
  assert.equal(transitioned.participant.ownsTransactionLifecycle, false);

  const zero = await execute(Object.freeze({ resultVersion: "2.0", status: "success", rows: Object.freeze([]), rowCount: 0, command: "UPDATE" }));
  assert.equal(zero.result.status, "not-applied");
  const many = await execute(Object.freeze({ resultVersion: "2.0", status: "success", rows: Object.freeze([]), rowCount: 2, command: "UPDATE" }));
  assert.equal(many.result.status, "internal-invariant-violation");
});

for (const retryable of [true, false] as const) {
  test(`participant preserves execution failure retryable=${retryable}`, async () => {
    const value = await execute(Object.freeze({
      resultVersion: "2.0",
      status: "execution-failure",
      phase: "query",
      classification: "timeout",
      safeReason: "postgresql-timeout",
      retryable,
      sqlStateClass: "57",
      queryConnectionDisposition: "must-rollback-before-reuse",
    }));
    assert.deepEqual(value.result, {
      resultVersion: "2.0",
      status: "execution-failure",
      issue: "timeout",
      safeReason: "postgresql-timeout",
      retryable,
      sqlStateClass: "57",
      queryConnectionDisposition: "must-rollback-before-reuse",
      ownerAction: "rollback-required",
    });
    assert.equal(value.calls, 1);
  });
}
