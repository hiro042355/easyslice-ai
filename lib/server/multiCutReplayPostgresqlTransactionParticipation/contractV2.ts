import {
  WORKFLOW_COMPLETION_ATOMIC_MUTATION_PLAN,
  WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP,
} from "../workflowCompletionAtomicRecovery";
import type {
  MultiCutReplayCompleteParticipationOwnershipV2,
} from "./typesV2";

export const MULTI_CUT_REPLAY_COMPLETE_PARTICIPATION_OWNERSHIP_V2:
  MultiCutReplayCompleteParticipationOwnershipV2 = Object.freeze({
  schemaVersion: "2.0",
  contractVersion: "2.0",
  statementScope: Object.freeze(["complete-processing-replay"] as const),
  operationIdentity: "complete-replay-participation",
  transactionOwner: WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP.commitOwner,
  sameSessionRequirement: "workflow-completion-transaction-session",
  participantOwnsTransaction: false,
  participantOwnsConnection: false,
  participantOwnsRetry:
    WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP.participantRetryPermitted,
  participantOwnsCommitUnknown:
    WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP.participantOwnsCommitUnknown,
  zeroRowRequiresOwnerRollback:
    WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP.zeroRowRequiresRollbackBeforeLookup,
  cardinalityRequiresOwnerRollback:
    WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP.cardinalityRequiresRollbackBeforeLookup,
  durableOnlyAfterOwnerCommit:
    WORKFLOW_COMPLETION_ATOMIC_MUTATION_PLAN.durableOnlyAfterOwnerCommit,
});
