import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  WORKFLOW_COMPLETION_ATOMIC_MUTATION_PLAN,
  WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP,
} from "../../../lib/server/workflowCompletionAtomicRecovery";
import type {
  WorkflowCompletionCommitIntent,
  WorkflowCompletionReconciliationRequest,
  WorkflowCompletionReconciliationResult,
} from "../../../lib/server/workflowCompletionAtomicRecovery";

const protectedIdentity = (value: string) => Object.freeze({
  identityVersion: "1.0" as const,
  namespace: "workflow-completion",
  protectedValue: value,
});

const replayIdentity = Object.freeze({
  identityVersion: "2.0" as const,
  protectedScope: Object.freeze({
    scopeVersion: "1.0" as const,
    replayNamespace: "multi-cut",
    tenant: Object.freeze({ identityVersion: "1.0" as const, protectedTenantIdentity: "tenant" }),
    operationIdentity: "operation",
  }),
  resolvedIdentity: Object.freeze({
    identityVersion: "1.0" as const,
    keyIdentity: "key",
    requestFingerprintIdentity: "fingerprint",
  }),
});

const intent: WorkflowCompletionCommitIntent = Object.freeze({
  intentVersion: "1.0",
  workflowIdentity: protectedIdentity("workflow"),
  replayIdentity,
  completionOperationIdentity: protectedIdentity("completion-operation"),
  resultReference: Object.freeze({ referenceVersion: "1.0", resultReferenceIdentity: "result-reference" }),
  resultReferenceVersion: "1.0",
  expectedPreCommitRevision: "1",
  expectedPostCommitRevision: "2",
  expectedOwnershipEvidence: Object.freeze({
    evidenceVersion: "1.0",
    reservation: Object.freeze({ reservationVersion: "1.0", reservationIdentity: "reservation" }),
    expectedRevision: Object.freeze({ revisionVersion: "1.0", expectedRevision: "1" }),
    fencing: Object.freeze({ fencingVersion: "1.0", fencingToken: "1" }),
    lease: Object.freeze({ leaseVersion: "1.0", leaseIdentity: "lease" }),
    leaseExpiresAt: "2026-08-01T00:00:00.000Z",
    reservationAttempt: 1,
  }),
  terminalMetadata: Object.freeze({
    metadataVersion: "1.0",
    completedAt: "2026-08-01T00:00:00.000Z",
    completionClassification: "workflow-completed",
  }),
  outboxEventIdentity: protectedIdentity("outbox"),
  workflowFinalResultIdentity: protectedIdentity("final-result"),
  workflowFinalResultFingerprint: protectedIdentity("result-fingerprint"),
  logicalAttemptIdentity: protectedIdentity("logical-attempt"),
});

const snapshot = Object.freeze({
  snapshotVersion: "1.0" as const,
  isolation: "single-read-only-transaction" as const,
  mutationSessionReused: false as const,
  replay: Object.freeze({
    status: "found" as const,
    replayIdentity,
    state: "completed" as const,
    revision: "2",
    resultReference: intent.resultReference,
    terminalMetadataVersion: "1.0" as const,
  }),
  workflowCompletion: Object.freeze({ status: "found" as const, identity: intent.workflowIdentity }),
  resultReference: Object.freeze({ status: "found" as const, identity: intent.workflowFinalResultIdentity }),
  outbox: Object.freeze({ status: "found" as const, identity: intent.outboxEventIdentity }),
  workflowFinalResult: Object.freeze({ status: "found" as const, identity: intent.workflowFinalResultIdentity }),
});

test("atomic mutation inventory is complete, ordered, immutable, and same-store", () => {
  const plan = WORKFLOW_COMPLETION_ATOMIC_MUTATION_PLAN;
  assert.equal(plan.components.length, 12);
  assert.deepEqual(plan.components.map(({ order }) => order), [1, 2, 3, 4, 4, 4, 4, 4, 4, 4, 4, 5]);
  assert.equal(new Set(plan.components.map(({ component }) => component)).size, 12);
  assert.equal(plan.components.every(({ participation }) => participation === "required"), true);
  assert.equal(plan.components.every(({ failureDisposition }) => failureDisposition === "rollback-entire-transaction"), true);
  assert.equal(plan.storeRequirement, "same-postgresql-cluster-and-database");
  assert.equal(plan.sessionRequirement, "same-transaction-session");
  assert.equal(plan.productionWiringRequiresSameStoreProof, true);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.components), true);
  assert.equal(plan.components.every(Object.isFrozen), true);
});

test("external side effects are excluded and never prove database commit", () => {
  assert.deepEqual(WORKFLOW_COMPLETION_ATOMIC_MUTATION_PLAN.excludedSideEffects, [
    "object-storage-upload", "provider-api-call", "external-webhook-delivery",
    "analytics-delivery", "notification-delivery", "media-publishing",
    "external-queue-acknowledgement",
  ]);
  assert.equal(WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP.externalIoInsideTransaction, false);
  assert.equal(WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP.outboxDeliveryProvesCommit, false);
});

test("transaction owner alone owns rollback, commit unknown, timeout, and retry", () => {
  const ownership = WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP;
  assert.equal(ownership.commitOwner, "workflow-completion-transaction-owner");
  assert.equal(ownership.rollbackOwner, "workflow-completion-transaction-owner");
  assert.equal(ownership.commitUnknownOwner, "workflow-completion-transaction-owner");
  assert.equal(ownership.participantOwnsCommitUnknown, false);
  assert.equal(ownership.zeroRowRequiresRollbackBeforeLookup, true);
  assert.equal(ownership.cardinalityRequiresRollbackBeforeLookup, true);
  assert.equal(ownership.lookupUsesFailedMutationSession, false);
  assert.equal(ownership.participantRetryPermitted, false);
  assert.equal(ownership.commitUnknownRetryPermitted, false);
});

test("commit intent and reconciliation request preserve fixed authoritative identities", () => {
  const request: WorkflowCompletionReconciliationRequest = Object.freeze({
    requestVersion: "1.0",
    trigger: "final-commit-outcome-unknown",
    intent,
    lookupRequirement: "single-read-only-transaction",
    retryBeforeReconciliation: false,
  });
  assert.equal(request.intent, intent);
  assert.equal(request.intent.replayIdentity, replayIdentity);
  assert.equal(request.intent.resultReferenceVersion, "1.0");
  assert.equal(request.intent.expectedPreCommitRevision, "1");
  assert.equal(request.intent.expectedPostCommitRevision, "2");
  assert.equal(request.lookupRequirement, "single-read-only-transaction");
  assert.equal(request.retryBeforeReconciliation, false);
  assert.equal("metadata" in request, false);
});

test("reconciliation result distinguishes success, not committed, inconsistency, supersession, and unavailable", () => {
  const results: readonly WorkflowCompletionReconciliationResult[] = [
    Object.freeze({ resultVersion: "1.0", status: "reconciled-success", snapshot, retryPermitted: false }),
    Object.freeze({ resultVersion: "1.0", status: "definite-not-committed", snapshot, retryPermitted: true, retryAuthority: "workflow-completion-transaction-owner-policy", sameLogicalAttemptRequired: true }),
    Object.freeze({ resultVersion: "1.0", status: "inconsistent-observation", snapshot, issues: Object.freeze(["partial-atomic-observation"] as const), retryPermitted: false, manualInterventionRequired: true }),
    Object.freeze({ resultVersion: "1.0", status: "superseded", snapshot, issue: "newer-attempt-observed", retryPermitted: false }),
    Object.freeze({ resultVersion: "1.0", status: "unavailable", issue: "lookup-unavailable", retryPermitted: false }),
  ];
  assert.deepEqual(results.map(({ status }) => status), [
    "reconciled-success", "definite-not-committed", "inconsistent-observation", "superseded", "unavailable",
  ]);
  assert.equal(results.filter(({ retryPermitted }) => retryPermitted).length, 1);
});

test("contract boundary contains no implementation, transaction control, SQL, raw errors, or free metadata", () => {
  const root = join(process.cwd(), "lib", "server", "workflowCompletionAtomicRecovery");
  const source = ["types.ts", "contractV1.ts", "index.ts"]
    .map((file) => readFileSync(join(root, file), "utf8"))
    .join("\n");
  for (const forbidden of [
    "from \"pg\"", "process.env", "PoolClient", "begin(", "commit(", "rollback(",
    "execute(", "SELECT ", "UPDATE ", "INSERT ", "DELETE ", "rawError", "sqlState:",
    "Record<string, unknown>", "unknown as", " as any",
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.equal(source.includes("multiCutReplayPostgresqlTransactionParticipation"), false);
  assert.equal(source.includes("multiCutReplayPostgresqlExecutionRuntime"), false);
});
