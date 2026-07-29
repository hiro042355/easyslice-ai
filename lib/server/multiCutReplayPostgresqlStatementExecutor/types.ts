import type {
  MultiCutReplayPostgresqlStatementExecutionRequest,
  MultiCutReplayPostgresqlStatementExecutionResult,
  MultiCutReplayPostgresqlStatementParameters,
} from "../multiCutReplayPostgresqlAdapterPort";
import type {
  MultiCutReplayPostgresqlClientCancellationBoundary,
  MultiCutReplayPostgresqlClientTransaction,
  MultiCutReplayPostgresqlConnection,
  MultiCutReplayPostgresqlPreparedStatement,
  MultiCutReplayPostgresqlPreparedStatementExpectedResultMetadata,
  MultiCutReplayPostgresqlQueryResult,
} from "../multiCutReplayPostgresqlClient";
import type {
  MultiCutReplayPostgresqlExecutionDriverExecutor,
  MultiCutReplayPostgresqlExecutionDriverRequest,
  MultiCutReplayPostgresqlExecutionDriverResult,
} from "../multiCutReplayPostgresqlExecutionDriver";
import type {
  MultiCutReplayPostgresqlMutationClassification,
  MultiCutReplayPostgresqlStatementAccessMode,
  MultiCutReplayPostgresqlStatementCatalogEntry,
  MultiCutReplayPostgresqlStatementId,
  MultiCutReplayPostgresqlTransactionRequirement,
} from "../multiCutReplayPostgresqlStatementCatalog/types";

export type MultiCutReplayPostgresqlParameterProjectionHook = Readonly<{
  project(
    request: MultiCutReplayPostgresqlStatementExecutionRequest,
  ): MultiCutReplayPostgresqlStatementParameters;
}>;

export type MultiCutReplayPostgresqlResultProjectionHook = Readonly<{
  project(
    result: MultiCutReplayPostgresqlQueryResult,
    request: MultiCutReplayPostgresqlExecutionDriverRequest,
  ): MultiCutReplayPostgresqlStatementExecutionResult;
}>;

export type MultiCutReplayPostgresqlFailureClassificationHook = Readonly<{
  classify(
    failure: unknown,
    request: MultiCutReplayPostgresqlExecutionDriverRequest,
  ): MultiCutReplayPostgresqlStatementExecutionResult;
}>;

export type MultiCutReplayPostgresqlStatementExecutorBinding<
  StatementId extends MultiCutReplayPostgresqlStatementId =
    MultiCutReplayPostgresqlStatementId,
> = Readonly<{
  statementIdentifier: StatementId;
  accessMode: MultiCutReplayPostgresqlStatementAccessMode;
  mutationKind: MultiCutReplayPostgresqlMutationClassification;
  transactionRequirement: MultiCutReplayPostgresqlTransactionRequirement;
  expectedResult:
    MultiCutReplayPostgresqlPreparedStatementExpectedResultMetadata;
  parameterProjection: MultiCutReplayPostgresqlParameterProjectionHook;
  resultProjection: MultiCutReplayPostgresqlResultProjectionHook;
  failureClassification: MultiCutReplayPostgresqlFailureClassificationHook;
}>;

export type MultiCutReplayPostgresqlStatementExecutorBindings = Readonly<{
  readonly [StatementId in MultiCutReplayPostgresqlStatementId]:
    MultiCutReplayPostgresqlStatementExecutorBinding<StatementId>;
}>;

export type MultiCutReplayPostgresqlStatementExecutorHooks = Readonly<{
  readonly [StatementId in MultiCutReplayPostgresqlStatementId]: Readonly<{
    expectedResult:
      MultiCutReplayPostgresqlPreparedStatementExpectedResultMetadata;
    parameterProjection: MultiCutReplayPostgresqlParameterProjectionHook;
    resultProjection: MultiCutReplayPostgresqlResultProjectionHook;
    failureClassification: MultiCutReplayPostgresqlFailureClassificationHook;
  }>;
}>;

export type MultiCutReplayPostgresqlStatementExecutorRequest =
  MultiCutReplayPostgresqlExecutionDriverRequest;

export type MultiCutReplayPostgresqlStatementExecutorResult =
  MultiCutReplayPostgresqlExecutionDriverResult;

export type MultiCutReplayPostgresqlStatementExecutorDependencies =
  Readonly<{
    connection: MultiCutReplayPostgresqlConnection;
    transaction?: MultiCutReplayPostgresqlClientTransaction;
    cancellation:
      MultiCutReplayPostgresqlClientCancellationBoundary;
    hooks: MultiCutReplayPostgresqlStatementExecutorHooks;
  }>;

export type MultiCutReplayPostgresqlStatementExecutor =
  MultiCutReplayPostgresqlExecutionDriverExecutor &
    Readonly<{
      bindings: MultiCutReplayPostgresqlStatementExecutorBindings;
      describe(
        request: MultiCutReplayPostgresqlStatementExecutorRequest,
      ): MultiCutReplayPostgresqlPreparedStatement;
    }>;

export type MultiCutReplayPostgresqlCatalogBindingSource = Readonly<{
  entry:
    MultiCutReplayPostgresqlStatementCatalogEntry<MultiCutReplayPostgresqlStatementId>;
}>;
