import type {
  MultiCutReplayCompleteParticipationOwnership,
} from "./types";

export const MULTI_CUT_REPLAY_COMPLETE_PARTICIPATION_OWNERSHIP:
  MultiCutReplayCompleteParticipationOwnership = Object.freeze({
    contractVersion: "1.0",
    statementScope: Object.freeze(["complete-processing-replay"] as const),
    transactionOwner: "workflow-completion-transaction-owner",
    participantOwnsTransaction: false,
    participantOwnsConnection: false,
    participantOwnsRetry: false,
    participantMayEmitDuplicatePersistenceFailure: false,
    commitUnknownOwner: "workflow-completion-transaction-owner",
    timeoutAuthority: "owner-connection-statement-timeout",
    sameSessionRequired: true,
    durableOnlyAfterOwnerCommit: true,
  });
