import type { ReplayPostgresqlObservabilityPort } from "./types";

export const NO_OP_REPLAY_POSTGRESQL_OBSERVABILITY_PORT:
  ReplayPostgresqlObservabilityPort = Object.freeze({
    emit: () => undefined,
  });
