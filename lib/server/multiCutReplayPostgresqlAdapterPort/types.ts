import type {
  MultiCutReplayPostgresqlStatementId,
} from "../multiCutReplayPostgresqlStatementCatalog/types";

export type MultiCutReplayPostgresqlTransactionScope =
  | "none"
  | "required"
  | "workflow-completion";

export type MultiCutReplayPostgresqlTransactionContext = Readonly<{
  contextVersion: "1.0";
  scope: MultiCutReplayPostgresqlTransactionScope;
  opaqueContextReference?: string;
}>;

export type MultiCutReplayPostgresqlStatementParameters =
  Readonly<Record<string, unknown>>;

export type MultiCutReplayPostgresqlStatementExecutionRequest = Readonly<{
  requestVersion: "1.0";
  statementId: MultiCutReplayPostgresqlStatementId;
  parameters: MultiCutReplayPostgresqlStatementParameters;
  transactionContext: MultiCutReplayPostgresqlTransactionContext;
}>;

export type MultiCutReplayPostgresqlAffectedRowInterpretation =
  | "exactly-one"
  | "zero"
  | "more-than-one"
  | "not-applicable";

export type MultiCutReplayPostgresqlExecutionMetadata = Readonly<{
  metadataVersion: "1.0";
  transactionScope: MultiCutReplayPostgresqlTransactionScope;
  affectedRowInterpretation:
    MultiCutReplayPostgresqlAffectedRowInterpretation;
}>;

export type MultiCutReplayPostgresqlDatabaseFailureClassification =
  | "retryable"
  | "invariant-violation"
  | "infrastructure"
  | "unavailable";

export type MultiCutReplayPostgresqlCommitUnknownClassification =
  | "not-unknown"
  | "commit-unknown";

export type MultiCutReplayPostgresqlRetryClassification =
  | "retryable"
  | "not-retryable"
  | "reconcile-first";

export type MultiCutReplayPostgresqlStatementExecutionResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "executed";
    statementId: MultiCutReplayPostgresqlStatementId;
    affectedRowInterpretation:
      MultiCutReplayPostgresqlAffectedRowInterpretation;
    opaquePayload: unknown;
    executionMetadata: MultiCutReplayPostgresqlExecutionMetadata;
    commitUnknown: "not-unknown";
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "commit-unknown";
    statementId: MultiCutReplayPostgresqlStatementId;
    affectedRowInterpretation: "not-applicable";
    opaquePayload: undefined;
    executionMetadata: MultiCutReplayPostgresqlExecutionMetadata;
    commitUnknown: "commit-unknown";
    retry: "reconcile-first";
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "failed";
    statementId: MultiCutReplayPostgresqlStatementId;
    affectedRowInterpretation:
      MultiCutReplayPostgresqlAffectedRowInterpretation;
    opaquePayload: undefined;
    executionMetadata: MultiCutReplayPostgresqlExecutionMetadata;
    failure: MultiCutReplayPostgresqlDatabaseFailureClassification;
    commitUnknown: "not-unknown";
    retry: Exclude<
      MultiCutReplayPostgresqlRetryClassification,
      "reconcile-first"
    >;
  }>;

export type MultiCutReplayPostgresqlAdapterPort = Readonly<{
  executeStatement(
    request: MultiCutReplayPostgresqlStatementExecutionRequest,
  ): Promise<MultiCutReplayPostgresqlStatementExecutionResult>;
}>;
