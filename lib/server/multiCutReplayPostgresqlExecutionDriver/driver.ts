import type {
  MultiCutReplayPostgresqlExecutionDriver,
  MultiCutReplayPostgresqlExecutionDriverDependencies,
  MultiCutReplayPostgresqlExecutionDriverMetadata,
} from "./types";

export const MULTI_CUT_REPLAY_POSTGRESQL_EXECUTION_DRIVER_METADATA:
  MultiCutReplayPostgresqlExecutionDriverMetadata = Object.freeze({
    driverVersion: "1.0",
    requestBoundary: "passthrough",
    resultBoundary: "passthrough",
    commitBoundary: "executor-owned",
    rollbackBoundary: "executor-owned",
    commitUnknownBoundary: "passthrough",
    cancellationBoundary: "context-only",
    connectionLifetimeBoundary: "executor-owned",
  });

export const createMultiCutReplayPostgresqlExecutionDriver = (
  dependencies: MultiCutReplayPostgresqlExecutionDriverDependencies,
): MultiCutReplayPostgresqlExecutionDriver =>
  Object.freeze({
    metadata: MULTI_CUT_REPLAY_POSTGRESQL_EXECUTION_DRIVER_METADATA,
    execute(request) {
      return dependencies.executor.execute(request);
    },
  });
