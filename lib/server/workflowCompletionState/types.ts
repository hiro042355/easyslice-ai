import type { MultiCutReplayResultReference } from "../multiCutReplayShared/types";
import type {
  WorkflowProtectedIdentity,
  WorkflowUtcTimestamp,
} from "../productionWorkflowRuntime/types";

export type WorkflowCompletionStateContractVersionV1 = "1.0";
export type WorkflowCompletionLifecycleStateV1 =
  | "eligible-for-completion"
  | "completed";
export type WorkflowCompletionRevisionV1 = string;

export type WorkflowCompletionLifecycleContractV1 = Readonly<{
  schemaVersion: "1.0";
  contractVersion: "1.0";
  owner: "workflow-completion-state";
  eligibleState: "eligible-for-completion";
  completedState: "completed";
  completedTerminal: true;
  completedAbsorbing: true;
  transitionAllowedAfterCompletion: false;
  attemptComparison: "equality-only";
  attemptOrderingAuthority: "none";
  revisionAuthority: "workflow-completion-state";
}>;

export type WorkflowCompletionTransitionRequestFactoryInputV1 = Readonly<{
  workflowIdentity: WorkflowProtectedIdentity;
  logicalAttemptIdentity: WorkflowProtectedIdentity;
  expectedRevision: WorkflowCompletionRevisionV1;
  completionTimestamp: WorkflowUtcTimestamp;
  resultReference: MultiCutReplayResultReference;
}>;

export type WorkflowCompletionTransitionRequestV1 = Readonly<{
  schemaVersion: "1.0";
  contractVersion: "1.0";
  workflowIdentity: WorkflowProtectedIdentity;
  expectedState: "eligible-for-completion";
  targetState: "completed";
  logicalAttemptIdentity: WorkflowProtectedIdentity;
  expectedRevision: WorkflowCompletionRevisionV1;
  completionTimestamp: WorkflowUtcTimestamp;
  resultReference: MultiCutReplayResultReference;
}>;

export type WorkflowCompletionTransitionRequestValidationResultV1 =
  | Readonly<{ status: "valid"; request: WorkflowCompletionTransitionRequestV1 }>
  | Readonly<{
      status: "invalid";
      reason:
        | "invalid-workflow-identity"
        | "invalid-attempt-identity"
        | "invalid-expected-revision"
        | "invalid-completion-timestamp"
        | "invalid-result-reference";
    }>;

export type WorkflowCompletionTransitionResultV1 =
  | Readonly<{
      resultVersion: "1.0";
      status: "transitioned";
      workflowIdentity: WorkflowProtectedIdentity;
      previousState: "eligible-for-completion";
      currentState: "completed";
      logicalAttemptIdentity: WorkflowProtectedIdentity;
      previousRevision: WorkflowCompletionRevisionV1;
      currentRevision: WorkflowCompletionRevisionV1;
      completionTimestamp: WorkflowUtcTimestamp;
      resultReference: MultiCutReplayResultReference;
      durability: "pending-owner-commit";
      ownsStandaloneTransaction: false;
      ownerAction: "continue-transaction";
    }>
  | Readonly<{
      resultVersion: "1.0";
      status: "not-applied";
      cause: "unresolved";
      ownerAction: "rollback-required";
      commitAllowed: false;
      authoritativeLookupRequired: true;
      retryAttempted: false;
    }>;

export type WorkflowCompletionAuthoritativeObservationV1 =
  | Readonly<{ observationVersion: "1.0"; status: "missing" }>
  | Readonly<{ observationVersion: "1.0"; status: "multiple" }>
  | Readonly<{
      observationVersion: "1.0";
      status: "found";
      workflowIdentity: WorkflowProtectedIdentity;
      state: WorkflowCompletionLifecycleStateV1;
      revision: WorkflowCompletionRevisionV1;
      logicalAttemptIdentity?: WorkflowProtectedIdentity;
      completionTimestamp?: WorkflowUtcTimestamp;
      resultReference?: MultiCutReplayResultReference;
      evidenceCompleteness: "complete" | "incomplete";
      invariantStatus: "consistent" | "inconsistent";
    }>;

export type WorkflowCompletionAtomicComponentConsistencyV1 = Readonly<{
  evidenceVersion: "1.0";
  status: "consistent" | "inconsistent";
}>;

export type WorkflowCompletionObservationClassificationV1 =
  | Readonly<{ resultVersion: "1.0"; status: "idempotent-completion"; durableSuccessCandidate: true; retryPermitted: false; mutationRepeatPermitted: false; manualInterventionRequired: false }>
  | Readonly<{ resultVersion: "1.0"; status: "reference-conflict"; retryPermitted: false; mutationRepeatPermitted: false; manualInterventionRequired: true }>
  | Readonly<{ resultVersion: "1.0"; status: "competing-attempt"; retryPermitted: false; mutationRepeatPermitted: false; manualInterventionRequired: true }>
  | Readonly<{ resultVersion: "1.0"; status: "stale-evidence"; retryPermitted: false; mutationRepeatPermitted: false; manualInterventionRequired: false }>
  | Readonly<{ resultVersion: "1.0"; status: "missing-workflow"; retryPermitted: false; mutationRepeatPermitted: false; manualInterventionRequired: true }>
  | Readonly<{ resultVersion: "1.0"; status: "inconsistent-observation"; retryPermitted: false; mutationRepeatPermitted: false; manualInterventionRequired: true }>;

export type WorkflowCompletionAtomicRecoveryEvidenceProjectionV1 = Readonly<{
  projectionVersion: "1.0";
  classification:
    | "reconciled-success-candidate"
    | "competing-attempt"
    | "inconsistent-observation"
    | "definite-not-committed-candidate"
    | "stale-evidence";
  finalCommitUnknownDecisionOwnedBy: "workflow-completion-transaction-owner";
}>;

export type WorkflowCompletionTransactionParticipationV1 = Readonly<{
  contractVersion: "1.0";
  transactionOwnership: "workflow-owner";
  ownsStandaloneTransaction: false;
  successBeforeCommit: "pending-owner-commit";
  commitUnknownOwner: "workflow-owner";
}>;
