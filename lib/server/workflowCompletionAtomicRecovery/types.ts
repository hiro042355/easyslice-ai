import type {
  MultiCutReplayCompletionMetadataV4,
} from "../multiCutReplayLifecycle/typesV4";
import type {
  MultiCutReplayAuthoritativeIdentity,
  MultiCutReplayReservationEvidence,
  MultiCutReplayResultReference,
} from "../multiCutReplayShared/types";
import type {
  WorkflowProtectedIdentity,
} from "../productionWorkflowRuntime/types";

export type WorkflowCompletionAtomicRecoveryContractVersion = "1.0";

export type WorkflowCompletionAttemptRelation =
  | "same-attempt"
  | "different-attempt"
  | "missing-attempt-evidence"
  | "inconsistent-attempt-evidence";

export type WorkflowCompletionAttemptSemantics = Readonly<{
  contractVersion: WorkflowCompletionAtomicRecoveryContractVersion;
  identityAuthority: "logical-attempt-identity";
  comparisonAuthority: "equality-only";
  orderingAuthority: "none";
  differentAttemptClassification: "competing-attempt";
  automaticRetryForDifferentAttempt: false;
  orderingInferencePermitted: false;
}>;

export type WorkflowCompletionAttemptRelationInput = Readonly<{
  requestAttempt?: WorkflowProtectedIdentity;
  observedAttempt?: WorkflowProtectedIdentity;
}>;

export type WorkflowCompletionAttemptRelationResult = Readonly<{
  resultVersion: WorkflowCompletionAtomicRecoveryContractVersion;
  relation: WorkflowCompletionAttemptRelation;
}>;

export type WorkflowCompletionAtomicMutationComponent =
  | "workflow-final-result-persistence"
  | "workflow-completion-state"
  | "result-reference-linkage"
  | "workflow-completion-outbox"
  | "replay-completed-state"
  | "replay-result-reference-version"
  | "replay-result-reference-identity"
  | "replay-terminal-metadata"
  | "replay-completion-timestamp"
  | "replay-revision-successor"
  | "replay-active-processing-evidence-clear"
  | "replay-persistent-continuity-retain";

export type WorkflowCompletionExcludedSideEffect =
  | "object-storage-upload"
  | "provider-api-call"
  | "external-webhook-delivery"
  | "analytics-delivery"
  | "notification-delivery"
  | "media-publishing"
  | "external-queue-acknowledgement";

export type WorkflowCompletionAtomicMutationComponentDescriptor = Readonly<{
  component: WorkflowCompletionAtomicMutationComponent;
  participation: "required" | "optional" | "outside-transaction";
  authority:
    | "workflow-final-result-contract"
    | "workflow-completion-contract"
    | "result-reference-contract"
    | "outbox-contract"
    | "replay-lifecycle-v4"
    | "replay-persistence-contract";
  owner: "workflow-completion-transaction-owner" | "replay-complete-participant";
  order: number;
  failureDisposition: "rollback-entire-transaction";
  reconciliationEvidence:
    | "workflow-final-result"
    | "workflow-completion-state"
    | "result-reference"
    | "outbox-event"
    | "replay-authoritative-row";
}>;

export type WorkflowCompletionAtomicMutationPlan = Readonly<{
  planVersion: WorkflowCompletionAtomicRecoveryContractVersion;
  transactionOwner: "workflow-completion-transaction-owner";
  storeRequirement: "same-postgresql-cluster-and-database";
  sessionRequirement: "same-transaction-session";
  commitBoundary: "single-owner-commit";
  components: readonly WorkflowCompletionAtomicMutationComponentDescriptor[];
  excludedSideEffects: readonly WorkflowCompletionExcludedSideEffect[];
  durableOnlyAfterOwnerCommit: true;
  productionWiringRequiresSameStoreProof: true;
}>;

export type WorkflowCompletionCommitIntent = Readonly<{
  intentVersion: WorkflowCompletionAtomicRecoveryContractVersion;
  workflowIdentity: WorkflowProtectedIdentity;
  replayIdentity: MultiCutReplayAuthoritativeIdentity;
  completionOperationIdentity: WorkflowProtectedIdentity;
  resultReference: MultiCutReplayResultReference;
  resultReferenceVersion: "1.0";
  expectedPreCommitRevision: string;
  expectedPostCommitRevision: string;
  expectedOwnershipEvidence: MultiCutReplayReservationEvidence;
  terminalMetadata: MultiCutReplayCompletionMetadataV4;
  outboxEventIdentity: WorkflowProtectedIdentity;
  workflowFinalResultIdentity: WorkflowProtectedIdentity;
  workflowFinalResultFingerprint: WorkflowProtectedIdentity;
  logicalAttemptIdentity: WorkflowProtectedIdentity;
}>;

export type WorkflowCompletionReconciliationLookup =
  | Readonly<{ status: "found"; identity: WorkflowProtectedIdentity; revision?: string }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{ status: "multiple" }>
  | Readonly<{ status: "unavailable" }>;

export type WorkflowCompletionReplayReconciliationLookup =
  | Readonly<{
      status: "found";
      replayIdentity: MultiCutReplayAuthoritativeIdentity;
      state: "processing" | "completed" | "failed" | "released";
      revision: string;
      resultReference?: MultiCutReplayResultReference;
      terminalMetadataVersion?: "1.0";
    }>
  | Readonly<{ status: "not-found" | "multiple" | "unavailable" }>;

export type WorkflowCompletionCombinedAuthoritativeSnapshot = Readonly<{
  snapshotVersion: WorkflowCompletionAtomicRecoveryContractVersion;
  isolation: "single-read-only-transaction";
  mutationSessionReused: false;
  replay: WorkflowCompletionReplayReconciliationLookup;
  workflowCompletion: WorkflowCompletionReconciliationLookup;
  resultReference: WorkflowCompletionReconciliationLookup;
  outbox: WorkflowCompletionReconciliationLookup;
  workflowFinalResult?: WorkflowCompletionReconciliationLookup;
}>;

export type WorkflowCompletionReconciliationRequest = Readonly<{
  requestVersion: WorkflowCompletionAtomicRecoveryContractVersion;
  trigger: "final-commit-outcome-unknown";
  intent: WorkflowCompletionCommitIntent;
  lookupRequirement: "single-read-only-transaction";
  retryBeforeReconciliation: false;
}>;

export type WorkflowCompletionCombinedReconciliationIssueCode =
  | "lookup-unavailable"
  | "lookup-cardinality-violation"
  | "workflow-state-mismatch"
  | "workflow-final-result-mismatch"
  | "result-reference-mismatch"
  | "replay-state-mismatch"
  | "replay-result-reference-mismatch"
  | "replay-terminal-metadata-mismatch"
  | "replay-revision-mismatch"
  | "outbox-event-mismatch"
  | "ownership-conflict"
  | "competing-attempt-observed"
  | "partial-atomic-observation";

export type WorkflowCompletionReconciliationResult =
  | Readonly<{
      resultVersion: WorkflowCompletionAtomicRecoveryContractVersion;
      status: "reconciled-success";
      snapshot: WorkflowCompletionCombinedAuthoritativeSnapshot;
      retryPermitted: false;
    }>
  | Readonly<{
      resultVersion: WorkflowCompletionAtomicRecoveryContractVersion;
      status: "definite-not-committed";
      snapshot: WorkflowCompletionCombinedAuthoritativeSnapshot;
      retryPermitted: boolean;
      retryAuthority: "workflow-completion-transaction-owner-policy";
      sameLogicalAttemptRequired: true;
    }>
  | Readonly<{
      resultVersion: WorkflowCompletionAtomicRecoveryContractVersion;
      status: "inconsistent-observation";
      snapshot: WorkflowCompletionCombinedAuthoritativeSnapshot;
      issues: readonly WorkflowCompletionCombinedReconciliationIssueCode[];
      retryPermitted: false;
      manualInterventionRequired: true;
    }>
  | Readonly<{
      resultVersion: WorkflowCompletionAtomicRecoveryContractVersion;
      status: "competing-attempt";
      snapshot: WorkflowCompletionCombinedAuthoritativeSnapshot;
      issue: "competing-attempt-observed";
      retryPermitted: false;
      manualInterventionRequired: true;
    }>
  | Readonly<{
      resultVersion: WorkflowCompletionAtomicRecoveryContractVersion;
      status: "unavailable";
      issue: "lookup-unavailable";
      retryPermitted: false;
    }>;

export type WorkflowCompletionAtomicRecoveryOwnership = Readonly<{
  contractVersion: WorkflowCompletionAtomicRecoveryContractVersion;
  mutationOwner: "workflow-completion-transaction-owner";
  commitOwner: "workflow-completion-transaction-owner";
  rollbackOwner: "workflow-completion-transaction-owner";
  commitUnknownOwner: "workflow-completion-transaction-owner";
  participantOwnsCommitUnknown: false;
  zeroRowRequiresRollbackBeforeLookup: true;
  cardinalityRequiresRollbackBeforeLookup: true;
  lookupUsesFailedMutationSession: false;
  participantRetryPermitted: false;
  commitUnknownRetryPermitted: false;
  externalIoInsideTransaction: false;
  outboxDeliveryProvesCommit: false;
  statementTimeoutOwner: "workflow-completion-transaction-owner";
  drainOwner: "workflow-completion-composition-policy";
  observabilityOwner: "workflow-completion-transaction-owner";
}>;
