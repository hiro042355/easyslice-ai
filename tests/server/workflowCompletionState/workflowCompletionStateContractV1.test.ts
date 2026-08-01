import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  WORKFLOW_COMPLETION_LIFECYCLE_CONTRACT_V1,
  WORKFLOW_COMPLETION_TRANSACTION_PARTICIPATION_V1,
  classifyWorkflowCompletionObservation,
  createWorkflowCompletionNotAppliedResult,
  createWorkflowCompletionTransitionCandidate,
  createWorkflowCompletionTransitionRequest,
  projectWorkflowCompletionEvidenceForAtomicRecovery,
  validateWorkflowCompletionRevision,
} from "../../../lib/server/workflowCompletionState";
import type {
  WorkflowCompletionAtomicComponentConsistencyV1,
  WorkflowCompletionAuthoritativeObservationV1,
  WorkflowCompletionTransitionRequestV1,
} from "../../../lib/server/workflowCompletionState";

const identity = (protectedValue: string) => Object.freeze({
  identityVersion: "1.0" as const,
  namespace: "workflow-completion",
  protectedValue,
});
const reference = (resultReferenceIdentity: string) => Object.freeze({
  referenceVersion: "1.0" as const,
  resultReferenceIdentity,
});
const consistent: WorkflowCompletionAtomicComponentConsistencyV1 = Object.freeze({
  evidenceVersion: "1.0",
  status: "consistent",
});

const requestResult = createWorkflowCompletionTransitionRequest({
  workflowIdentity: identity("workflow"),
  logicalAttemptIdentity: identity("attempt-a"),
  expectedRevision: "0",
  completionTimestamp: "2026-08-02T00:00:00.000Z",
  resultReference: reference("result-a"),
});
assert.equal(requestResult.status, "valid");
const request: WorkflowCompletionTransitionRequestV1 = requestResult.status === "valid"
  ? requestResult.request
  : (() => { throw new Error("fixture-invalid"); })();

const completed = (
  overrides: Partial<Extract<WorkflowCompletionAuthoritativeObservationV1, { status: "found" }>> = {},
): Extract<WorkflowCompletionAuthoritativeObservationV1, { status: "found" }> => Object.freeze({
  observationVersion: "1.0",
  status: "found",
  workflowIdentity: identity("workflow"),
  state: "completed",
  revision: "1",
  logicalAttemptIdentity: identity("attempt-a"),
  completionTimestamp: "2026-08-02T00:00:00.000Z",
  resultReference: reference("result-a"),
  evidenceCompleteness: "complete",
  invariantStatus: "consistent",
  ...overrides,
});

const eligibleStale = (): Extract<WorkflowCompletionAuthoritativeObservationV1, { status: "found" }> => Object.freeze({
  observationVersion: "1.0",
  status: "found",
  workflowIdentity: identity("workflow"),
  state: "eligible-for-completion",
  revision: "2",
  evidenceCompleteness: "complete",
  invariantStatus: "consistent",
});

const incompleteCompleted = (
  include: "attempt" | "reference",
): Extract<WorkflowCompletionAuthoritativeObservationV1, { status: "found" }> => Object.freeze({
  observationVersion: "1.0",
  status: "found",
  workflowIdentity: identity("workflow"),
  state: "completed",
  revision: "1",
  ...(include === "attempt" ? { logicalAttemptIdentity: identity("attempt-a") } : {}),
  completionTimestamp: "2026-08-02T00:00:00.000Z",
  ...(include === "reference" ? { resultReference: reference("result-a") } : {}),
  evidenceCompleteness: "incomplete",
  invariantStatus: "inconsistent",
});

test("contract fixes exact lifecycle, terminal semantics, attempt equality, and ownership", () => {
  assert.deepEqual(WORKFLOW_COMPLETION_LIFECYCLE_CONTRACT_V1, {
    schemaVersion: "1.0",
    contractVersion: "1.0",
    owner: "workflow-completion-state",
    eligibleState: "eligible-for-completion",
    completedState: "completed",
    completedTerminal: true,
    completedAbsorbing: true,
    transitionAllowedAfterCompletion: false,
    attemptComparison: "equality-only",
    attemptOrderingAuthority: "none",
    revisionAuthority: "workflow-completion-state",
  });
  assert.deepEqual(WORKFLOW_COMPLETION_TRANSACTION_PARTICIPATION_V1, {
    contractVersion: "1.0",
    transactionOwnership: "workflow-owner",
    ownsStandaloneTransaction: false,
    successBeforeCommit: "pending-owner-commit",
    commitUnknownOwner: "workflow-owner",
  });
  assert.equal(Object.isFrozen(WORKFLOW_COMPLETION_LIFECYCLE_CONTRACT_V1), true);
});

test("revision validation accepts canonical signed-64-bit non-negative decimals only", () => {
  for (const value of ["0", "1", "9223372036854775807"]) assert.equal(validateWorkflowCompletionRevision(value), true);
  for (const value of ["", "-1", "+1", "01", "1.0", "a", "9223372036854775808"]) assert.equal(validateWorkflowCompletionRevision(value), false, value);
});

test("request factory fixes states, validates authorities, and copy-isolates nested identities", () => {
  assert.equal(request.expectedState, "eligible-for-completion");
  assert.equal(request.targetState, "completed");
  assert.equal(request.expectedRevision, "0");
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.workflowIdentity), true);
  assert.equal(Object.isFrozen(request.logicalAttemptIdentity), true);
  assert.equal(Object.isFrozen(request.resultReference), true);
  assert.equal("successorRevision" in request, false);

  assert.equal(createWorkflowCompletionTransitionRequest({ ...request, expectedRevision: "1" }).status, "invalid");
  assert.equal(createWorkflowCompletionTransitionRequest({ ...request, completionTimestamp: "invalid" }).status, "invalid");
  assert.equal(createWorkflowCompletionTransitionRequest({ ...request, resultReference: reference("") }).status, "invalid");
});

test("one-row candidate remains pending owner commit and zero-row remains unresolved", () => {
  const candidate = createWorkflowCompletionTransitionCandidate(request);
  assert.equal(candidate.status, "transitioned");
  assert.equal(candidate.previousState, "eligible-for-completion");
  assert.equal(candidate.currentState, "completed");
  assert.equal(candidate.previousRevision, "0");
  assert.equal(candidate.currentRevision, "1");
  assert.equal(candidate.durability, "pending-owner-commit");
  assert.equal(candidate.ownsStandaloneTransaction, false);
  assert.notEqual(candidate.workflowIdentity, request.workflowIdentity);
  assert.notEqual(candidate.logicalAttemptIdentity, request.logicalAttemptIdentity);
  assert.notEqual(candidate.resultReference, request.resultReference);

  assert.deepEqual(createWorkflowCompletionNotAppliedResult(), {
    resultVersion: "1.0",
    status: "not-applied",
    cause: "unresolved",
    ownerAction: "rollback-required",
    commitAllowed: false,
    authoritativeLookupRequired: true,
    retryAttempted: false,
  });
});

test("authoritative observation matrix is exhaustive and deterministic", () => {
  const matrix = [
    [completed(), "idempotent-completion"],
    [completed({ resultReference: reference("different") }), "reference-conflict"],
    [completed({ logicalAttemptIdentity: identity("attempt-b") }), "competing-attempt"],
    [completed({ logicalAttemptIdentity: identity("attempt-b"), resultReference: reference("different") }), "competing-attempt"],
    [eligibleStale(), "stale-evidence"],
    [Object.freeze({ observationVersion: "1.0" as const, status: "missing" as const }), "missing-workflow"],
    [incompleteCompleted("reference"), "inconsistent-observation"],
    [incompleteCompleted("attempt"), "inconsistent-observation"],
    [Object.freeze({ observationVersion: "1.0" as const, status: "multiple" as const }), "inconsistent-observation"],
  ] as const;
  for (const [observation, expected] of matrix) {
    const first = classifyWorkflowCompletionObservation(request, observation, consistent);
    const second = classifyWorkflowCompletionObservation(request, observation, consistent);
    assert.equal(first.status, expected);
    assert.deepEqual(first, second);
    assert.equal(first.retryPermitted, false);
    assert.equal(first.mutationRepeatPermitted, false);
    assert.equal(Object.isFrozen(first), true);
  }
});

test("atomic component inconsistency blocks idempotent success", () => {
  const classified = classifyWorkflowCompletionObservation(request, completed(), Object.freeze({ evidenceVersion: "1.0", status: "inconsistent" }));
  assert.equal(classified.status, "inconsistent-observation");
  assert.equal(classified.manualInterventionRequired, true);
});

test("Atomic Recovery projection preserves candidate boundaries without deciding commit unknown", () => {
  const expected = new Map([
    ["idempotent-completion", "reconciled-success-candidate"],
    ["reference-conflict", "inconsistent-observation"],
    ["competing-attempt", "competing-attempt"],
    ["stale-evidence", "stale-evidence"],
    ["missing-workflow", "definite-not-committed-candidate"],
    ["inconsistent-observation", "inconsistent-observation"],
  ]);
  const observations: readonly WorkflowCompletionAuthoritativeObservationV1[] = [
    completed(),
    completed({ resultReference: reference("different") }),
    completed({ logicalAttemptIdentity: identity("attempt-b") }),
    eligibleStale(),
    Object.freeze({ observationVersion: "1.0", status: "missing" }),
    Object.freeze({ observationVersion: "1.0", status: "multiple" }),
  ];
  for (const observation of observations) {
    const classified = classifyWorkflowCompletionObservation(request, observation, consistent);
    const projection = projectWorkflowCompletionEvidenceForAtomicRecovery(classified);
    assert.equal(projection.classification, expected.get(classified.status));
    assert.equal(projection.finalCommitUnknownDecisionOwnedBy, "workflow-completion-transaction-owner");
    assert.equal(Object.isFrozen(projection), true);
  }
});

test("neutral package contains no persistence, ordering, retry loop, or unrelated domain fields", () => {
  const root = join(process.cwd(), "lib", "server", "workflowCompletionState");
  const source = ["types.ts", "contractV1.ts", "index.ts"]
    .map((name) => readFileSync(join(root, name), "utf8"))
    .join("\n");
  for (const forbidden of [
    'from "pg"', "PostgreSQL", "SELECT ", "UPDATE ", "INSERT ", "DELETE ",
    "process.env", "Date.now", "new Date", "commit(", "rollback(", "begin(",
    "newer-attempt", "older-attempt", "superseded", ".sort(", "localeCompare",
    "fencingToken", "reservationAttempt", "deliveryState", "tableName", "columnName",
    " as any", "unknown as",
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});
