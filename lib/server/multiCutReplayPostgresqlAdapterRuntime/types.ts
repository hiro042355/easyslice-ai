import type {
  MultiCutReplayPostgresqlAdapterPort,
  MultiCutReplayPostgresqlStatementExecutionRequest,
  MultiCutReplayPostgresqlStatementExecutionResult,
  MultiCutReplayPostgresqlStatementParameters,
  MultiCutReplayPostgresqlTransactionContext,
} from "../multiCutReplayPostgresqlAdapterPort";
import type {
  MultiCutReplayPostgresqlStatementCatalogEntry,
  MultiCutReplayPostgresqlStatementId,
} from "../multiCutReplayPostgresqlStatementCatalog/types";

export type MultiCutReplayPostgresqlAdapterRuntimeRequest = Readonly<{
  requestVersion: "1.0";
  statementId: MultiCutReplayPostgresqlStatementId;
  parameters: MultiCutReplayPostgresqlStatementParameters;
  transactionContext: MultiCutReplayPostgresqlTransactionContext;
}>;

export type MultiCutReplayPostgresqlAdapterRuntimeMetadata = Readonly<{
  metadataVersion: "1.0";
  statement: MultiCutReplayPostgresqlStatementCatalogEntry;
}>;

export type MultiCutReplayPostgresqlAdapterRuntimeProjectionContext =
  Readonly<{
    runtimeRequest: MultiCutReplayPostgresqlAdapterRuntimeRequest;
    portRequest: MultiCutReplayPostgresqlStatementExecutionRequest;
    executionResult: Extract<
      MultiCutReplayPostgresqlStatementExecutionResult,
      { readonly status: "executed" }
    >;
    runtimeMetadata: MultiCutReplayPostgresqlAdapterRuntimeMetadata;
  }>;

export type MultiCutReplayPostgresqlAdapterRuntimeFailureContext =
  Readonly<{
    runtimeRequest: MultiCutReplayPostgresqlAdapterRuntimeRequest;
    portRequest: MultiCutReplayPostgresqlStatementExecutionRequest;
    executionResult: Exclude<
      MultiCutReplayPostgresqlStatementExecutionResult,
      { readonly status: "executed" }
    >;
    runtimeMetadata: MultiCutReplayPostgresqlAdapterRuntimeMetadata;
  }>;

export type MultiCutReplayPostgresqlAdapterRuntimeProjectionHook<
  Projection,
> = Readonly<{
  project(
    context: MultiCutReplayPostgresqlAdapterRuntimeProjectionContext,
  ): Projection | Promise<Projection>;
}>;

export type MultiCutReplayPostgresqlAdapterRuntimeFailureHook<
  FailureProjection,
> = Readonly<{
  projectFailure(
    context: MultiCutReplayPostgresqlAdapterRuntimeFailureContext,
  ): FailureProjection | Promise<FailureProjection>;
}>;

export type MultiCutReplayPostgresqlAdapterRuntimeExecutor =
  MultiCutReplayPostgresqlAdapterPort;

export type MultiCutReplayPostgresqlAdapterRuntimeDependencies<
  Projection,
  FailureProjection,
> = Readonly<{
  executor: MultiCutReplayPostgresqlAdapterRuntimeExecutor;
  projectionHook:
    MultiCutReplayPostgresqlAdapterRuntimeProjectionHook<Projection>;
  failureHook:
    MultiCutReplayPostgresqlAdapterRuntimeFailureHook<FailureProjection>;
}>;

export type MultiCutReplayPostgresqlAdapterRuntimeResult<
  Projection,
  FailureProjection,
> =
  | Readonly<{
    resultVersion: "1.0";
    status: "projected";
    projection: Projection;
    executionResult: Extract<
      MultiCutReplayPostgresqlStatementExecutionResult,
      { readonly status: "executed" }
    >;
    runtimeMetadata: MultiCutReplayPostgresqlAdapterRuntimeMetadata;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "failure-projected";
    failureProjection: FailureProjection;
    executionResult: Exclude<
      MultiCutReplayPostgresqlStatementExecutionResult,
      { readonly status: "executed" }
    >;
    runtimeMetadata: MultiCutReplayPostgresqlAdapterRuntimeMetadata;
  }>;

export type MultiCutReplayPostgresqlAdapterRuntimeDispatcher<
  Projection,
  FailureProjection,
> = Readonly<{
  dispatch(
    request: MultiCutReplayPostgresqlAdapterRuntimeRequest,
  ): Promise<
    MultiCutReplayPostgresqlAdapterRuntimeResult<
      Projection,
      FailureProjection
    >
  >;
}>;
