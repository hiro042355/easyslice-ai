import type {
  MultiCutReplayPostgresqlAdapter,
  MultiCutReplayPostgresqlAdapterDependencies,
  MultiCutReplayPostgresqlAdapterOperation,
} from "./types";

export const MULTI_CUT_REPLAY_POSTGRESQL_ADAPTER_OPERATIONS =
  Object.freeze([
    "resolve-new-reservation",
    "resolve-existing-replay",
    "renew-processing-reservation",
    "complete-processing-replay",
    "fail-processing-replay",
    "release-processing-replay",
    "lookup-authoritative-replay",
    "takeover-stale-processing-replay",
  ] as const satisfies readonly MultiCutReplayPostgresqlAdapterOperation[]);

export const createMultiCutReplayPostgresqlAdapter = <
  Projection,
  FailureProjection,
  ReconciliationProjection,
>(
  dependencies: MultiCutReplayPostgresqlAdapterDependencies<
    Projection,
    FailureProjection,
    ReconciliationProjection
  >,
): MultiCutReplayPostgresqlAdapter<
  Projection,
  FailureProjection,
  ReconciliationProjection
> => {
  const adapter: MultiCutReplayPostgresqlAdapter<
    Projection,
    FailureProjection,
    ReconciliationProjection
  > = Object.freeze({
    resolveNewReservation(request) {
      return dependencies.resolution.dispatchNewReservation(request);
    },
    resolveExistingReplay(request) {
      return dependencies.resolution.dispatchExistingReplay(request);
    },
    renewProcessingReservation(request) {
      return dependencies.lifecycle.dispatchRenew(request);
    },
    completeProcessingReplay(request) {
      return dependencies.lifecycle.dispatchComplete(request);
    },
    failProcessingReplay(request) {
      return dependencies.lifecycle.dispatchFail(request);
    },
    releaseProcessingReplay(request) {
      return dependencies.lifecycle.dispatchRelease(request);
    },
    lookupAuthoritativeReplay(request) {
      return dependencies.recovery.dispatchLookup(request);
    },
    takeoverStaleProcessingReplay(request) {
      return dependencies.recovery.dispatchTakeover(request);
    },
    dispatch(request) {
      switch (request.operation) {
        case "resolve-new-reservation":
          return adapter.resolveNewReservation(request.request);
        case "resolve-existing-replay":
          return adapter.resolveExistingReplay(request.request);
        case "renew-processing-reservation":
          return adapter.renewProcessingReservation(request.request);
        case "complete-processing-replay":
          return adapter.completeProcessingReplay(request.request);
        case "fail-processing-replay":
          return adapter.failProcessingReplay(request.request);
        case "release-processing-replay":
          return adapter.releaseProcessingReplay(request.request);
        case "lookup-authoritative-replay":
          return adapter.lookupAuthoritativeReplay(request.request);
        case "takeover-stale-processing-replay":
          return adapter.takeoverStaleProcessingReplay(request.request);
        default: {
          const exhaustive: never = request;
          return exhaustive;
        }
      }
    },
  });

  return adapter;
};
