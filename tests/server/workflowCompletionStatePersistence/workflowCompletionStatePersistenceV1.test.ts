import assert from "node:assert/strict";
import test from "node:test";
import { createWorkflowCompletionTransitionRequest } from "../../../lib/server/workflowCompletionState";
import {
  WORKFLOW_COMPLETION_BINDING_KEYS_V1,
  WORKFLOW_COMPLETION_STATE_SQL_V1,
  createWorkflowCompletionPersistenceInput,
  executeWorkflowCompletionStateTransition,
  hasExactWorkflowCompletionBindings,
} from "../../../lib/server/workflowCompletionStatePersistence";
import type { DurableWorkflowSameSessionQueryCapability } from "../../../lib/server/productionWorkflowRuntime/durableTransaction";

const identity = (protectedValue: string) => Object.freeze({ identityVersion: "1.0" as const, namespace: "workflow-completion", protectedValue });
const requestResult = createWorkflowCompletionTransitionRequest({
  workflowIdentity: identity("workflow"), logicalAttemptIdentity: identity("attempt"), expectedRevision: "0",
  completionTimestamp: "2026-08-02T00:00:00.000Z",
  resultReference: Object.freeze({ referenceVersion: "1.0", resultReferenceIdentity: "result-reference" }),
});
if (requestResult.status !== "valid") throw new Error("fixture-invalid");
const request = requestResult.request;

test("binding inventory, factory, and SQL definition are exact and immutable", () => {
  const projected = createWorkflowCompletionPersistenceInput(request);
  assert.equal(projected.status, "valid");
  if (projected.status !== "valid") return;
  assert.deepEqual(Object.keys(projected.input.bindings), WORKFLOW_COMPLETION_BINDING_KEYS_V1);
  assert.equal(hasExactWorkflowCompletionBindings(projected.input.bindings), true);
  assert.equal(hasExactWorkflowCompletionBindings({ ...projected.input.bindings, extra: "rejected" }), false);
  assert.equal(Object.isFrozen(projected.input.bindings), true);
  assert.equal(WORKFLOW_COMPLETION_STATE_SQL_V1.command, "UPDATE");
  assert.match(WORKFLOW_COMPLETION_STATE_SQL_V1.text, /state = \$8::text/);
  assert.match(WORKFLOW_COMPLETION_STATE_SQL_V1.text, /revision = \$12::bigint/);
  assert.match(WORKFLOW_COMPLETION_STATE_SQL_V1.text, /revision = revision \+ 1/);
  assert.match(WORKFLOW_COMPLETION_STATE_SQL_V1.text, /RETURNING/);
  assert.equal(WORKFLOW_COMPLETION_STATE_SQL_V1.text.includes("INSERT"), false);
  assert.equal(WORKFLOW_COMPLETION_STATE_SQL_V1.text.includes("ON CONFLICT"), false);
});

const fake = (result: Awaited<ReturnType<DurableWorkflowSameSessionQueryCapability["executeQuery"]>>) => {
  let calls = 0;
  const capability: DurableWorkflowSameSessionQueryCapability = Object.freeze({
    capabilityVersion: "1.0",
    evidence: Object.freeze({ evidenceVersion: "1.0", sessionScope: "workflow-transaction", sessionAffinity: "same-session-required", transactionOwnership: "workflow-owner", separateConnectionPermitted: false, capabilityOwnsLifecycle: false, validOnlyDuringActiveTransaction: true }),
    async executeQuery() { calls += 1; return result; },
  });
  return { capability, calls: () => calls };
};

test("executor maps one-row, zero-row, cardinality, and safe failure without lifecycle ownership", async () => {
  const one = fake(Object.freeze({ resultVersion: "1.0", status: "success", command: "UPDATE", rowCount: 1, rows: Object.freeze([Object.freeze({ state: "completed", revision: "1" })]) }));
  const transitioned = await executeWorkflowCompletionStateTransition({ inputVersion: "1.0", query: one.capability, transitionRequest: request });
  assert.equal(transitioned.status, "transitioned"); assert.equal(one.calls(), 1);
  if (transitioned.status === "transitioned") assert.equal(transitioned.transition.durability, "pending-owner-commit");

  const zero = fake(Object.freeze({ resultVersion: "1.0", status: "success", command: "UPDATE", rowCount: 0, rows: Object.freeze([]) }));
  const notApplied = await executeWorkflowCompletionStateTransition({ inputVersion: "1.0", query: zero.capability, transitionRequest: request });
  assert.equal(notApplied.status, "not-applied");
  if (notApplied.status === "not-applied") { assert.equal(notApplied.cause, "unresolved"); assert.equal(notApplied.authoritativeLookupRequired, true); }

  const many = fake(Object.freeze({ resultVersion: "1.0", status: "success", command: "UPDATE", rowCount: 2, rows: Object.freeze([]) }));
  assert.equal((await executeWorkflowCompletionStateTransition({ inputVersion: "1.0", query: many.capability, transitionRequest: request })).status, "internal-invariant-violation");

  const failure = fake(Object.freeze({ resultVersion: "1.0", status: "execution-failure", phase: "query", classification: "timeout", safeReason: "postgresql-timeout", sqlStateClass: "57", queryConnectionDisposition: "must-rollback-before-reuse" }));
  const failed = await executeWorkflowCompletionStateTransition({ inputVersion: "1.0", query: failure.capability, transitionRequest: request });
  assert.deepEqual(failed, { resultVersion: "1.0", status: "execution-failure", issue: "timeout", safeReason: "postgresql-timeout", sqlStateClass: "57", queryConnectionDisposition: "must-rollback-before-reuse", ownerAction: "rollback-required" });
});
