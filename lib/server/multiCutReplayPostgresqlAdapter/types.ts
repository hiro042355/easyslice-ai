import type {
  MultiCutReplayLifecycleStatementAdapter,
  MultiCutReplayLifecycleStatementAdapterRequest,
  MultiCutReplayLifecycleStatementAdapterResult,
} from "../multiCutReplayLifecycleStatementAdapter";
import type {
  MultiCutReplayRecoveryStatementAdapter,
  MultiCutReplayRecoveryStatementAdapterRequest,
  MultiCutReplayRecoveryStatementAdapterResult,
} from "../multiCutReplayRecoveryStatementAdapter";
import type {
  MultiCutReplayResolutionStatementAdapter,
  MultiCutReplayResolutionStatementAdapterRequest,
  MultiCutReplayResolutionStatementAdapterResult,
} from "../multiCutReplayResolutionStatementAdapter";

export type MultiCutReplayPostgresqlAdapterOperation =
  | "resolve-new-reservation"
  | "resolve-existing-replay"
  | "renew-processing-reservation"
  | "complete-processing-replay"
  | "fail-processing-replay"
  | "release-processing-replay"
  | "lookup-authoritative-replay"
  | "takeover-stale-processing-replay";

export type MultiCutReplayPostgresqlAdapterRequest =
  | Readonly<{
    operation: "resolve-new-reservation";
    request: MultiCutReplayResolutionStatementAdapterRequest;
  }>
  | Readonly<{
    operation: "resolve-existing-replay";
    request: MultiCutReplayResolutionStatementAdapterRequest;
  }>
  | Readonly<{
    operation: "renew-processing-reservation";
    request: MultiCutReplayLifecycleStatementAdapterRequest<"renew">;
  }>
  | Readonly<{
    operation: "complete-processing-replay";
    request: MultiCutReplayLifecycleStatementAdapterRequest<"complete">;
  }>
  | Readonly<{
    operation: "fail-processing-replay";
    request: MultiCutReplayLifecycleStatementAdapterRequest<"fail">;
  }>
  | Readonly<{
    operation: "release-processing-replay";
    request: MultiCutReplayLifecycleStatementAdapterRequest<"release">;
  }>
  | Readonly<{
    operation: "lookup-authoritative-replay";
    request: MultiCutReplayRecoveryStatementAdapterRequest<"lookup">;
  }>
  | Readonly<{
    operation: "takeover-stale-processing-replay";
    request: MultiCutReplayRecoveryStatementAdapterRequest<"takeover">;
  }>;

export type MultiCutReplayPostgresqlAdapterResult<
  Projection,
  FailureProjection,
  ReconciliationProjection,
> =
  | MultiCutReplayResolutionStatementAdapterResult<
    Projection,
    FailureProjection
  >
  | MultiCutReplayLifecycleStatementAdapterResult<
    Projection,
    FailureProjection
  >
  | MultiCutReplayRecoveryStatementAdapterResult<
    Projection,
    FailureProjection,
    ReconciliationProjection
  >;

export type MultiCutReplayPostgresqlAdapterDependencies<
  Projection,
  FailureProjection,
  ReconciliationProjection,
> = Readonly<{
  resolution: MultiCutReplayResolutionStatementAdapter<
    Projection,
    FailureProjection
  >;
  lifecycle: MultiCutReplayLifecycleStatementAdapter<
    Projection,
    FailureProjection
  >;
  recovery: MultiCutReplayRecoveryStatementAdapter<
    Projection,
    FailureProjection,
    ReconciliationProjection
  >;
}>;

export type MultiCutReplayPostgresqlAdapter<
  Projection,
  FailureProjection,
  ReconciliationProjection,
> = Readonly<{
  resolveNewReservation(
    request: MultiCutReplayResolutionStatementAdapterRequest,
  ): Promise<
    MultiCutReplayResolutionStatementAdapterResult<
      Projection,
      FailureProjection
    >
  >;
  resolveExistingReplay(
    request: MultiCutReplayResolutionStatementAdapterRequest,
  ): Promise<
    MultiCutReplayResolutionStatementAdapterResult<
      Projection,
      FailureProjection
    >
  >;
  renewProcessingReservation(
    request: MultiCutReplayLifecycleStatementAdapterRequest<"renew">,
  ): Promise<
    MultiCutReplayLifecycleStatementAdapterResult<
      Projection,
      FailureProjection
    >
  >;
  completeProcessingReplay(
    request: MultiCutReplayLifecycleStatementAdapterRequest<"complete">,
  ): Promise<
    MultiCutReplayLifecycleStatementAdapterResult<
      Projection,
      FailureProjection
    >
  >;
  failProcessingReplay(
    request: MultiCutReplayLifecycleStatementAdapterRequest<"fail">,
  ): Promise<
    MultiCutReplayLifecycleStatementAdapterResult<
      Projection,
      FailureProjection
    >
  >;
  releaseProcessingReplay(
    request: MultiCutReplayLifecycleStatementAdapterRequest<"release">,
  ): Promise<
    MultiCutReplayLifecycleStatementAdapterResult<
      Projection,
      FailureProjection
    >
  >;
  lookupAuthoritativeReplay(
    request: MultiCutReplayRecoveryStatementAdapterRequest<"lookup">,
  ): Promise<
    MultiCutReplayRecoveryStatementAdapterResult<
      Projection,
      FailureProjection,
      ReconciliationProjection
    >
  >;
  takeoverStaleProcessingReplay(
    request: MultiCutReplayRecoveryStatementAdapterRequest<"takeover">,
  ): Promise<
    MultiCutReplayRecoveryStatementAdapterResult<
      Projection,
      FailureProjection,
      ReconciliationProjection
    >
  >;
  dispatch(
    request: MultiCutReplayPostgresqlAdapterRequest,
  ): Promise<
    MultiCutReplayPostgresqlAdapterResult<
      Projection,
      FailureProjection,
      ReconciliationProjection
    >
  >;
}>;
