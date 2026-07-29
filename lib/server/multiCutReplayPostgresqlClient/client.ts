import type {
  MultiCutReplayPostgresqlClient,
  MultiCutReplayPostgresqlClientFactory,
  MultiCutReplayPostgresqlClientFactoryDependencies,
  MultiCutReplayPostgresqlClientMetadata,
} from "./types";

export const MULTI_CUT_REPLAY_POSTGRESQL_CLIENT_METADATA:
  MultiCutReplayPostgresqlClientMetadata = Object.freeze({
    clientVersion: "1.0",
    connectionBoundary: "capability-only",
    transactionBoundary: "context-only",
    preparedStatementBoundary: "identifier-and-parameters-only",
    cancellationBoundary: "metadata-only",
    queryTextBoundary: "not-exposed",
  });

export const createMultiCutReplayPostgresqlClient = (
  dependencies: MultiCutReplayPostgresqlClientFactoryDependencies,
): MultiCutReplayPostgresqlClient =>
  Object.freeze({
    metadata: MULTI_CUT_REPLAY_POSTGRESQL_CLIENT_METADATA,
    acquire(request) {
      return dependencies.connectionLifetime.acquire(request);
    },
    release(request) {
      return dependencies.connectionLifetime.release(request);
    },
  });

export const MULTI_CUT_REPLAY_POSTGRESQL_CLIENT_FACTORY:
  MultiCutReplayPostgresqlClientFactory = Object.freeze({
    create: createMultiCutReplayPostgresqlClient,
  });
