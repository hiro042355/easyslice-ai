import type { MultiCutReplayAuthoritativeIdentity, MultiCutReplayResultReference } from "../multiCutReplayShared/types";
import type { PostgreSQLQueryConnectionDisposition } from "../productionWorkflowRuntime/postgresqlDriver/types";
import type { DurableWorkflowTransactionSessionV3CompleteLifecycle } from "../productionWorkflowRuntime/durableTransaction/productionTransactionSessionV3";
import type { WorkflowCompletionCommitIntent } from "../workflowCompletionAtomicRecovery/types";
import type { WorkflowCompletionTransactionCleanupDecisionV1 } from "../workflowCompletionTransactionCleanup/types";
import type { WorkflowProtectedIdentity } from "../productionWorkflowRuntime/types";

export type WorkflowCompletionAtomicOwnerStage = "input-validation" | "session" | "final-result" | "workflow-completion-state" | "result-reference" | "replay-completion" | "outbox" | "commit" | "rollback" | "release" | "discard";
export type WorkflowCompletionAtomicMutationStage = Exclude<WorkflowCompletionAtomicOwnerStage, "input-validation" | "session" | "commit" | "rollback" | "release" | "discard">;
export type WorkflowCompletionAtomicOwnerSafeValue = null | boolean | number | string | Uint8Array | readonly WorkflowCompletionAtomicOwnerSafeValue[] | Readonly<{ [key: string]: WorkflowCompletionAtomicOwnerSafeValue }>;

export type WorkflowCompletionAtomicOwnerConsistencyEvidenceV1 = Readonly<{
  workflowIdentity: WorkflowProtectedIdentity;
  protectedScopeIdentity: string;
  logicalAttemptIdentity: WorkflowProtectedIdentity;
  completionTimestamp: string;
  resultReference: MultiCutReplayResultReference;
  replayIdentity: MultiCutReplayAuthoritativeIdentity;
  operationIdentity: WorkflowProtectedIdentity;
  outboxIdentity: WorkflowProtectedIdentity;
  commitIntentIdentity: WorkflowProtectedIdentity;
  completionRevisionEvidence: string;
}>;

export type WorkflowCompletionAtomicOwnerInputV1 = Readonly<{
  inputVersion: "1.0";
  consistency: WorkflowCompletionAtomicOwnerConsistencyEvidenceV1;
  componentConsistency: Readonly<Record<WorkflowCompletionAtomicMutationStage, WorkflowCompletionAtomicOwnerConsistencyEvidenceV1>>;
  stageInputs: Readonly<Record<WorkflowCompletionAtomicMutationStage, WorkflowCompletionAtomicOwnerSafeValue>>;
  commitIntent: WorkflowCompletionCommitIntent;
}>;

export type WorkflowCompletionAtomicComponentResultV1 =
  | Readonly<{ resultVersion: "1.0"; status: "success"; classification: string; evidence?: WorkflowCompletionAtomicOwnerSafeValue }>
  | Readonly<{ resultVersion: "1.0"; status: "not-committed"; classification: string; lookupRequired: boolean; evidence?: WorkflowCompletionAtomicOwnerSafeValue; queryConnectionDisposition: PostgreSQLQueryConnectionDisposition }>
  | Readonly<{ resultVersion: "1.0"; status: "execution-failure"; classification: string; issue: string; safeReason: string; retryable: boolean; sqlStateClass?: "08" | "23" | "25" | "40" | "42" | "57"; queryConnectionDisposition: PostgreSQLQueryConnectionDisposition; evidence?: WorkflowCompletionAtomicOwnerSafeValue }>;

export type WorkflowCompletionAtomicOwnerComponentEvidenceV1 = Readonly<{ evidenceVersion: "1.0"; stage: WorkflowCompletionAtomicMutationStage; invoked: true; classification: string; success: boolean; evidence?: WorkflowCompletionAtomicOwnerSafeValue }>;

export type WorkflowCompletionAtomicOwnerDependenciesV1 = Readonly<{
  dependencyVersion: "1.0";
  acquireSession(): Promise<DurableWorkflowTransactionSessionV3CompleteLifecycle>;
  executeFinalResult(session: DurableWorkflowTransactionSessionV3CompleteLifecycle, input: WorkflowCompletionAtomicOwnerSafeValue): Promise<WorkflowCompletionAtomicComponentResultV1>;
  executeWorkflowState(session: DurableWorkflowTransactionSessionV3CompleteLifecycle, input: WorkflowCompletionAtomicOwnerSafeValue): Promise<WorkflowCompletionAtomicComponentResultV1>;
  executeResultReference(session: DurableWorkflowTransactionSessionV3CompleteLifecycle, input: WorkflowCompletionAtomicOwnerSafeValue): Promise<WorkflowCompletionAtomicComponentResultV1>;
  executeReplayCompletion(session: DurableWorkflowTransactionSessionV3CompleteLifecycle, input: WorkflowCompletionAtomicOwnerSafeValue): Promise<WorkflowCompletionAtomicComponentResultV1>;
  executeOutbox(session: DurableWorkflowTransactionSessionV3CompleteLifecycle, input: WorkflowCompletionAtomicOwnerSafeValue): Promise<WorkflowCompletionAtomicComponentResultV1>;
}>;

type OwnerBase = Readonly<{ resultVersion: "1.0"; retryAttempted: false; componentEvidence: readonly WorkflowCompletionAtomicOwnerComponentEvidenceV1[] }>;
export type WorkflowCompletionAtomicOwnerResultV1 =
  | (OwnerBase & Readonly<{ status: "committed"; workflowIdentity: WorkflowProtectedIdentity; logicalAttemptIdentity: WorkflowProtectedIdentity; completionTimestamp: string; resultReference: MultiCutReplayResultReference; commitIntent: WorkflowCompletionCommitIntent; cleanupDecision: WorkflowCompletionTransactionCleanupDecisionV1 }>)
  | (OwnerBase & Readonly<{ status: "validation-failure"; failedStage: "input-validation"; reason: "cross-component-consistency-mismatch"; mutationAttempted: false; commitAttempted: false }>)
  | (OwnerBase & Readonly<{ status: "not-committed"; failedStage: WorkflowCompletionAtomicOwnerStage; componentClassification: string; cleanupDecision?: WorkflowCompletionTransactionCleanupDecisionV1; rollbackAttempted: boolean; cleanupResult?: string; lookupRequired: boolean }>)
  | (OwnerBase & Readonly<{ status: "execution-failure"; failedStage: WorkflowCompletionAtomicOwnerStage; issue: string; safeReason: string; retryable: boolean; sqlStateClass?: "08" | "23" | "25" | "40" | "42" | "57"; connectionDisposition: PostgreSQLQueryConnectionDisposition; cleanupDecision?: WorkflowCompletionTransactionCleanupDecisionV1; cleanupResult?: string }>)
  | (OwnerBase & Readonly<{ status: "commit-unknown"; failedStage: "commit"; rollbackAttempted: false; automaticRetryAllowed: false; reconciliationRequired: true; reconciliationIdentity: WorkflowCompletionCommitIntent; commitIntent: WorkflowCompletionCommitIntent; cleanupDecision: WorkflowCompletionTransactionCleanupDecisionV1; discardResult: string }>);

export type WorkflowCompletionAtomicMutationOwnerV1 = Readonly<{ ownerVersion: "1.0"; execute(input: WorkflowCompletionAtomicOwnerInputV1): Promise<WorkflowCompletionAtomicOwnerResultV1> }>;
