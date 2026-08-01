import type {
  MultiCutReplayCompletionMetadataV4,
} from "../multiCutReplayLifecycle/typesV4";
import type {
  MultiCutReplayAuthoritativeIdentity,
  MultiCutReplayReservationEvidence,
  MultiCutReplayResultReference,
} from "../multiCutReplayShared/types";

export type MultiCutReplayCompleteParticipationContractVersion = "1.0";

export type MultiCutReplayCompleteParticipationRequest = Readonly<{
  requestVersion: MultiCutReplayCompleteParticipationContractVersion;
  statementId: "complete-processing-replay";
  replayIdentity: MultiCutReplayAuthoritativeIdentity;
  expectedReservationEvidence: MultiCutReplayReservationEvidence;
  resultReference: MultiCutReplayResultReference;
  terminalMetadata: MultiCutReplayCompletionMetadataV4;
}>;

export type MultiCutReplayCompletePersistenceProjection = Readonly<{
  projectionVersion: "1.0";
  replayIdentity: MultiCutReplayAuthoritativeIdentity;
  state: "completed";
  revision: string;
  lastFencingToken: string;
  lastReservationAttempt: number;
  resultReference: MultiCutReplayResultReference;
  terminalMetadata: MultiCutReplayCompletionMetadataV4;
}>;

export type MultiCutReplayTransactionConnectionDisposition =
  | "reusable"
  | "discard-required"
  | "unknown";

export type MultiCutReplayCompleteRetryMetadata =
  | "not-retryable"
  | "retryable-before-commit"
  | "owner-policy-required";

export type MultiCutReplayCompleteReconciliationMetadata =
  | "not-required"
  | "authoritative-lookup-required"
  | "owner-decision-required";

export type MultiCutReplaySafeSqlStateClass =
  | "08"
  | "23"
  | "25"
  | "40"
  | "42"
  | "57";

export type MultiCutReplayCompleteTransactionQueryResult =
  | Readonly<{
      resultVersion: MultiCutReplayCompleteParticipationContractVersion;
      status: "one-row";
      command: string;
      rowCount: 1;
      projection: MultiCutReplayCompletePersistenceProjection;
      retryMetadata: "not-retryable";
      reconciliationMetadata: "not-required";
      connectionDisposition: "reusable";
      ownerDirective: "continue-transaction";
    }>
  | Readonly<{
      resultVersion: MultiCutReplayCompleteParticipationContractVersion;
      status: "zero-row";
      command: string;
      rowCount: 0;
      zeroRowClassification: "ambiguous-concurrency-miss";
      retryMetadata: "not-retryable";
      reconciliationMetadata: "authoritative-lookup-required";
      connectionDisposition: MultiCutReplayTransactionConnectionDisposition;
      ownerDirective: "do-not-commit";
    }>
  | Readonly<{
      resultVersion: MultiCutReplayCompleteParticipationContractVersion;
      status: "cardinality-violation";
      rowCount: number;
      classification: "invariant-violation";
      retryMetadata: "not-retryable";
      reconciliationMetadata: "owner-decision-required";
      connectionDisposition: MultiCutReplayTransactionConnectionDisposition;
      ownerDirective: "do-not-commit";
    }>
  | Readonly<{
      resultVersion: MultiCutReplayCompleteParticipationContractVersion;
      status: "execution-failure";
      transactionPhase: "query";
      classification:
        | "timeout"
        | "connection-unavailable"
        | "serialization-conflict"
        | "constraint-conflict"
        | "query-rejected"
        | "transaction-failed"
        | "internal-failure";
      retryMetadata: MultiCutReplayCompleteRetryMetadata;
      reconciliationMetadata: MultiCutReplayCompleteReconciliationMetadata;
      safeReason: string;
      sqlStateClass?: MultiCutReplaySafeSqlStateClass;
      connectionDisposition: MultiCutReplayTransactionConnectionDisposition;
      ownerDirective: "do-not-commit";
    }>;

export type MultiCutReplayCompleteTransactionQueryPort = Readonly<{
  executeComplete(
    request: MultiCutReplayCompleteParticipationRequest,
  ): Promise<MultiCutReplayCompleteTransactionQueryResult>;
}>;

export type MultiCutReplayCompleteTransactionParticipant = Readonly<{
  executeComplete(
    transaction: MultiCutReplayCompleteTransactionQueryPort,
    request: MultiCutReplayCompleteParticipationRequest,
  ): Promise<MultiCutReplayCompleteTransactionQueryResult>;
}>;

export type MultiCutReplayCompleteParticipationOwnership = Readonly<{
  contractVersion: MultiCutReplayCompleteParticipationContractVersion;
  statementScope: readonly ["complete-processing-replay"];
  transactionOwner: "workflow-completion-transaction-owner";
  participantOwnsTransaction: false;
  participantOwnsConnection: false;
  participantOwnsRetry: false;
  participantMayEmitDuplicatePersistenceFailure: false;
  commitUnknownOwner: "workflow-completion-transaction-owner";
  timeoutAuthority: "owner-connection-statement-timeout";
  sameSessionRequired: true;
  durableOnlyAfterOwnerCommit: true;
}>;
