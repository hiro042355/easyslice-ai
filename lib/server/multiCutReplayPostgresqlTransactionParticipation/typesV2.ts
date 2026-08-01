import type {
  MultiCutReplayCompleteProcessingParameterInputV1,
} from "../multiCutReplayPersistenceParameters";
import type {
  MultiCutReplayPostgresqlPureAdapterMetadata,
  MultiCutReplayPostgresqlPureExecutionRequest,
  MultiCutReplayPostgresqlPureQueryMappingResult,
  MultiCutReplayPostgresqlQueryExecutionResult,
} from "../multiCutReplayPostgresqlAdapter/pureTypes";
import type {
  PostgreSQLQueryConnectionDisposition,
} from "../productionWorkflowRuntime/postgresqlDriver/types";
import type {
  WorkflowCompletionAtomicRecoveryOwnership,
} from "../workflowCompletionAtomicRecovery/types";
import type {
  MultiCutReplayCompletePersistenceProjection,
} from "./types";

export type MultiCutReplayCompleteParticipationContractVersionV2 = "2.0";

export type MultiCutReplayCompleteParticipationRequestV2 = Readonly<{
  schemaVersion: MultiCutReplayCompleteParticipationContractVersionV2;
  contractVersion: MultiCutReplayCompleteParticipationContractVersionV2;
  statementId: "complete-processing-replay";
  operationIdentity: "complete-replay-participation";
  sameSessionRequirement: "workflow-completion-transaction-session";
  transactionOwner: "workflow-completion-transaction-owner";
  parameterInput: MultiCutReplayCompleteProcessingParameterInputV1;
}>;

export type MultiCutReplayCompleteExecutionRequestV2 = Readonly<
  Omit<MultiCutReplayPostgresqlPureExecutionRequest, "statementId"> & {
    statementId: "complete-processing-replay";
  }
>;

export type MultiCutReplayCompleteQueryExecutionPortV2 = Readonly<{
  execute(
    request: MultiCutReplayCompleteExecutionRequestV2,
  ): Promise<MultiCutReplayPostgresqlQueryExecutionResult>;
}>;

export type MultiCutReplayCompleteOwnerActionV2 =
  | "continue-transaction"
  | "do-not-commit"
  | "rollback-required";

export type MultiCutReplayCompleteQueryMetadataV2 = Readonly<
  Pick<
    MultiCutReplayPostgresqlPureAdapterMetadata,
    | "metadataVersion"
    | "retryClassification"
    | "reconciliationClassification"
    | "logicalAttemptReuse"
  >
>;

type PureMappedResult = Extract<
  MultiCutReplayPostgresqlPureQueryMappingResult,
  { status: "mapped" }
>;

type PureZeroRowResult = Extract<
  MultiCutReplayPostgresqlPureQueryMappingResult,
  { status: "zero-row" }
>;

type PureCardinalityResult = Extract<
  MultiCutReplayPostgresqlPureQueryMappingResult,
  { status: "cardinality-failure" }
>;

type PureExecutionFailureResult = Extract<
  MultiCutReplayPostgresqlPureQueryMappingResult,
  { status: "execution-failure" }
>;

export type MultiCutReplayCompleteParticipationResultV2 =
  | Readonly<{
      resultVersion: MultiCutReplayCompleteParticipationContractVersionV2;
      status: "one-row";
      command: PureMappedResult["command"];
      rowCount: 1;
      projection: MultiCutReplayCompletePersistenceProjection;
      queryMetadata: MultiCutReplayCompleteQueryMetadataV2;
      ownerAction: "continue-transaction";
      durableCompletion: false;
    }>
  | Readonly<{
      resultVersion: MultiCutReplayCompleteParticipationContractVersionV2;
      status: "zero-row";
      command: PureZeroRowResult["command"];
      rowCount: 0;
      zeroRowClassification: PureZeroRowResult["classification"];
      lookupRequired: PureZeroRowResult["lookupRequired"];
      reconciliationRequired: PureZeroRowResult["reconciliationRequired"];
      queryMetadata: MultiCutReplayCompleteQueryMetadataV2;
      ownerAction: "do-not-commit";
      rollbackRequired: true;
    }>
  | Readonly<{
      resultVersion: MultiCutReplayCompleteParticipationContractVersionV2;
      status: "cardinality-violation";
      expectedRowCount: 1;
      actualRowCount: PureCardinalityResult["rowCount"];
      classification: PureCardinalityResult["classification"];
      queryMetadata: MultiCutReplayCompleteQueryMetadataV2;
      ownerAction: "rollback-required";
      rollbackRequired: true;
    }>
  | Readonly<{
      resultVersion: MultiCutReplayCompleteParticipationContractVersionV2;
      status: "execution-failure";
      transactionPhase: "query";
      classification: PureExecutionFailureResult["classification"];
      safeReason: PureExecutionFailureResult["safeReason"];
      sqlStateClass?: PureExecutionFailureResult["sqlStateClass"];
      queryConnectionDisposition?: PostgreSQLQueryConnectionDisposition;
      queryMetadata: MultiCutReplayCompleteQueryMetadataV2;
      ownerAction: "rollback-required";
      rollbackRequired: true;
    }>;

export type MultiCutReplayCompleteTransactionParticipantV2 = Readonly<{
  executeComplete(
    query: MultiCutReplayCompleteQueryExecutionPortV2,
    request: MultiCutReplayCompleteParticipationRequestV2,
  ): Promise<MultiCutReplayCompleteParticipationResultV2>;
}>;

export type MultiCutReplayCompleteParticipationOwnershipV2 = Readonly<{
  schemaVersion: MultiCutReplayCompleteParticipationContractVersionV2;
  contractVersion: MultiCutReplayCompleteParticipationContractVersionV2;
  statementScope: readonly ["complete-processing-replay"];
  operationIdentity: "complete-replay-participation";
  transactionOwner: WorkflowCompletionAtomicRecoveryOwnership["commitOwner"];
  sameSessionRequirement: "workflow-completion-transaction-session";
  participantOwnsTransaction: false;
  participantOwnsConnection: false;
  participantOwnsRetry: WorkflowCompletionAtomicRecoveryOwnership["participantRetryPermitted"];
  participantOwnsCommitUnknown: WorkflowCompletionAtomicRecoveryOwnership["participantOwnsCommitUnknown"];
  zeroRowRequiresOwnerRollback: WorkflowCompletionAtomicRecoveryOwnership["zeroRowRequiresRollbackBeforeLookup"];
  cardinalityRequiresOwnerRollback: WorkflowCompletionAtomicRecoveryOwnership["cardinalityRequiresRollbackBeforeLookup"];
  durableOnlyAfterOwnerCommit: true;
}>;
