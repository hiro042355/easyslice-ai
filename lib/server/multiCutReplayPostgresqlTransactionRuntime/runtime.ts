import type {
  MultiCutReplayPostgresqlTransactionRuntime,
  MultiCutReplayPostgresqlTransactionRuntimeDependencies,
  MultiCutReplayPostgresqlTransactionRuntimeFactory,
  MultiCutReplayPostgresqlTransactionRuntimeMetadata,
} from "./types";

export const MULTI_CUT_REPLAY_POSTGRESQL_TRANSACTION_RUNTIME_METADATA:
  MultiCutReplayPostgresqlTransactionRuntimeMetadata = Object.freeze({
    runtimeVersion: "1.0",
    requestBoundary: "passthrough",
    resultBoundary: "passthrough",
    transactionBoundary: "context-only",
    commitBoundary: "metadata-only",
    rollbackBoundary: "metadata-only",
    commitUnknownBoundary: "passthrough",
    cancellationBoundary: "context-only",
    connectionLifetimeBoundary: "metadata-only",
  });

export const createMultiCutReplayPostgresqlTransactionRuntime = (
  dependencies: MultiCutReplayPostgresqlTransactionRuntimeDependencies,
): MultiCutReplayPostgresqlTransactionRuntime =>
  Object.freeze({
    metadata:
      MULTI_CUT_REPLAY_POSTGRESQL_TRANSACTION_RUNTIME_METADATA,
    execute(request) {
      return dependencies.driver.execute(request.driverRequest);
    },
  });

export const MULTI_CUT_REPLAY_POSTGRESQL_TRANSACTION_RUNTIME_FACTORY:
  MultiCutReplayPostgresqlTransactionRuntimeFactory = Object.freeze({
    create: createMultiCutReplayPostgresqlTransactionRuntime,
  });
