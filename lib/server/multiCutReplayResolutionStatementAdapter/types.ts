import type {
  MultiCutReplayResolutionInput,
} from "../multiCutRequestAdmission/types";
import type {
  MultiCutReplayPostgresqlTransactionContext,
} from "../multiCutReplayPostgresqlAdapterPort";
import type {
  MultiCutReplayPostgresqlAdapterRuntimeDependencies,
  MultiCutReplayPostgresqlAdapterRuntimeDispatcher,
  MultiCutReplayPostgresqlAdapterRuntimeFailureHook,
  MultiCutReplayPostgresqlAdapterRuntimeProjectionHook,
  MultiCutReplayPostgresqlAdapterRuntimeRequest,
  MultiCutReplayPostgresqlAdapterRuntimeResult,
} from "../multiCutReplayPostgresqlAdapterRuntime";
import type {
  MultiCutReplayPostgresqlStatementId,
} from "../multiCutReplayPostgresqlStatementCatalog/types";

export type MultiCutReplayResolutionStatementKind =
  | "new-reservation"
  | "existing-replay";

export type MultiCutReplayResolutionStatementAdapterRequest = Readonly<{
  requestVersion: "1.0";
  resolutionInput: MultiCutReplayResolutionInput;
  transactionContext: MultiCutReplayPostgresqlTransactionContext;
}>;

export type MultiCutReplayResolutionStatementBinding = Readonly<{
  bindingVersion: "1.0";
  statementKind: MultiCutReplayResolutionStatementKind;
  statementId: MultiCutReplayPostgresqlStatementId;
  affectedRowBoundary: Readonly<{
    success: "exactly-one";
    absence: "zero";
    invariantFailure: "invariant-violation";
  }>;
  commitUnknownFollowUp: "authoritative-lookup";
}>;

export type MultiCutReplayResolutionStatementBindings = Readonly<{
  newReservation: MultiCutReplayResolutionStatementBinding;
  existingReplay: MultiCutReplayResolutionStatementBinding;
}>;

export type MultiCutReplayResolutionStatementProjectionHook<Projection> =
  MultiCutReplayPostgresqlAdapterRuntimeProjectionHook<Projection>;

export type MultiCutReplayResolutionStatementFailureHook<FailureProjection> =
  MultiCutReplayPostgresqlAdapterRuntimeFailureHook<FailureProjection>;

export type MultiCutReplayResolutionStatementAdapterDependencies<
  Projection,
  FailureProjection,
> = MultiCutReplayPostgresqlAdapterRuntimeDependencies<
  Projection,
  FailureProjection
>;

export type MultiCutReplayResolutionStatementAdapterResult<
  Projection,
  FailureProjection,
> = MultiCutReplayPostgresqlAdapterRuntimeResult<
  Projection,
  FailureProjection
>;

export type MultiCutReplayResolutionStatementAdapter<
  Projection,
  FailureProjection,
> = Readonly<{
  dispatchNewReservation(
    request: MultiCutReplayResolutionStatementAdapterRequest,
  ): Promise<
    MultiCutReplayResolutionStatementAdapterResult<
      Projection,
      FailureProjection
    >
  >;
  dispatchExistingReplay(
    request: MultiCutReplayResolutionStatementAdapterRequest,
  ): Promise<
    MultiCutReplayResolutionStatementAdapterResult<
      Projection,
      FailureProjection
    >
  >;
}>;

export type MultiCutReplayResolutionRuntimeRequestBuilder = Readonly<{
  build(
    statementId: MultiCutReplayPostgresqlStatementId,
    request: MultiCutReplayResolutionStatementAdapterRequest,
  ): MultiCutReplayPostgresqlAdapterRuntimeRequest;
}>;

export type MultiCutReplayResolutionRuntimeDispatcher<
  Projection,
  FailureProjection,
> = MultiCutReplayPostgresqlAdapterRuntimeDispatcher<
  Projection,
  FailureProjection
>;
