import type {
  WorkflowCompletionAtomicMutationComponentDescriptor,
  WorkflowCompletionAtomicMutationPlan,
  WorkflowCompletionAtomicRecoveryOwnership,
} from "./types";

const component = (
  value: WorkflowCompletionAtomicMutationComponentDescriptor,
): WorkflowCompletionAtomicMutationComponentDescriptor => Object.freeze(value);

export const WORKFLOW_COMPLETION_ATOMIC_MUTATION_PLAN:
  WorkflowCompletionAtomicMutationPlan = Object.freeze({
    planVersion: "1.0",
    transactionOwner: "workflow-completion-transaction-owner",
    storeRequirement: "same-postgresql-cluster-and-database",
    sessionRequirement: "same-transaction-session",
    commitBoundary: "single-owner-commit",
    components: Object.freeze([
      component({ component: "workflow-final-result-persistence", participation: "required", authority: "workflow-final-result-contract", owner: "workflow-completion-transaction-owner", order: 1, failureDisposition: "rollback-entire-transaction", reconciliationEvidence: "workflow-final-result" }),
      component({ component: "workflow-completion-state", participation: "required", authority: "workflow-completion-contract", owner: "workflow-completion-transaction-owner", order: 2, failureDisposition: "rollback-entire-transaction", reconciliationEvidence: "workflow-completion-state" }),
      component({ component: "result-reference-linkage", participation: "required", authority: "result-reference-contract", owner: "workflow-completion-transaction-owner", order: 3, failureDisposition: "rollback-entire-transaction", reconciliationEvidence: "result-reference" }),
      component({ component: "replay-completed-state", participation: "required", authority: "replay-lifecycle-v4", owner: "replay-complete-participant", order: 4, failureDisposition: "rollback-entire-transaction", reconciliationEvidence: "replay-authoritative-row" }),
      component({ component: "replay-result-reference-version", participation: "required", authority: "replay-persistence-contract", owner: "replay-complete-participant", order: 4, failureDisposition: "rollback-entire-transaction", reconciliationEvidence: "replay-authoritative-row" }),
      component({ component: "replay-result-reference-identity", participation: "required", authority: "replay-lifecycle-v4", owner: "replay-complete-participant", order: 4, failureDisposition: "rollback-entire-transaction", reconciliationEvidence: "replay-authoritative-row" }),
      component({ component: "replay-terminal-metadata", participation: "required", authority: "replay-lifecycle-v4", owner: "replay-complete-participant", order: 4, failureDisposition: "rollback-entire-transaction", reconciliationEvidence: "replay-authoritative-row" }),
      component({ component: "replay-completion-timestamp", participation: "required", authority: "replay-lifecycle-v4", owner: "replay-complete-participant", order: 4, failureDisposition: "rollback-entire-transaction", reconciliationEvidence: "replay-authoritative-row" }),
      component({ component: "replay-revision-successor", participation: "required", authority: "replay-persistence-contract", owner: "replay-complete-participant", order: 4, failureDisposition: "rollback-entire-transaction", reconciliationEvidence: "replay-authoritative-row" }),
      component({ component: "replay-active-processing-evidence-clear", participation: "required", authority: "replay-persistence-contract", owner: "replay-complete-participant", order: 4, failureDisposition: "rollback-entire-transaction", reconciliationEvidence: "replay-authoritative-row" }),
      component({ component: "replay-persistent-continuity-retain", participation: "required", authority: "replay-persistence-contract", owner: "replay-complete-participant", order: 4, failureDisposition: "rollback-entire-transaction", reconciliationEvidence: "replay-authoritative-row" }),
      component({ component: "workflow-completion-outbox", participation: "required", authority: "outbox-contract", owner: "workflow-completion-transaction-owner", order: 5, failureDisposition: "rollback-entire-transaction", reconciliationEvidence: "outbox-event" }),
    ]),
    excludedSideEffects: Object.freeze([
      "object-storage-upload",
      "provider-api-call",
      "external-webhook-delivery",
      "analytics-delivery",
      "notification-delivery",
      "media-publishing",
      "external-queue-acknowledgement",
    ] as const),
    durableOnlyAfterOwnerCommit: true,
    productionWiringRequiresSameStoreProof: true,
  });

export const WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP:
  WorkflowCompletionAtomicRecoveryOwnership = Object.freeze({
    contractVersion: "1.0",
    mutationOwner: "workflow-completion-transaction-owner",
    commitOwner: "workflow-completion-transaction-owner",
    rollbackOwner: "workflow-completion-transaction-owner",
    commitUnknownOwner: "workflow-completion-transaction-owner",
    participantOwnsCommitUnknown: false,
    zeroRowRequiresRollbackBeforeLookup: true,
    cardinalityRequiresRollbackBeforeLookup: true,
    lookupUsesFailedMutationSession: false,
    participantRetryPermitted: false,
    commitUnknownRetryPermitted: false,
    externalIoInsideTransaction: false,
    outboxDeliveryProvesCommit: false,
    statementTimeoutOwner: "workflow-completion-transaction-owner",
    drainOwner: "workflow-completion-composition-policy",
    observabilityOwner: "workflow-completion-transaction-owner",
  });
