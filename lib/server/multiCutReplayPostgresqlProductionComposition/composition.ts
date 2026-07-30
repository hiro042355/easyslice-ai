import {
  createMultiCutReplayPostgresqlExecutionRuntime,
} from "../multiCutReplayPostgresqlExecutionRuntime";
import {
  createMultiCutReplayPostgresqlDriverConnectionProvider,
} from "../multiCutReplayPostgresqlDriver";
import {
  createMultiCutReplayPostgresqlProductionBridge,
} from "../multiCutReplayPostgresqlProductionBridge";
import {
  PostgreSQLConnectionPoolAdapter,
} from "../productionWorkflowRuntime/postgresqlDriver";
import type {
  PostgreSQLConnectionConfig,
  PostgreSQLConnectionPool,
} from "../productionWorkflowRuntime/postgresqlDriver";
import type {
  MultiCutReplayPostgresqlProductionComposition,
  MultiCutReplayPostgresqlProductionCompositionDependencies,
  MultiCutReplayPostgresqlProductionCompositionResult,
  MultiCutReplayPostgresqlProductionCompositionState,
} from "./types";

const isNonEmpty = (value: string): boolean => value.trim().length > 0;

const isValidConfiguration = (
  config: PostgreSQLConnectionConfig,
): boolean =>
  isNonEmpty(config.host) &&
  Number.isInteger(config.port) &&
  config.port > 0 &&
  config.port <= 65_535 &&
  isNonEmpty(config.database) &&
  isNonEmpty(config.user) &&
  typeof config.password === "string" &&
  Number.isInteger(config.maxConnections) &&
  config.maxConnections > 0 &&
  Number.isInteger(config.connectionTimeoutMs) &&
  config.connectionTimeoutMs > 0 &&
  Number.isInteger(config.idleTimeoutMs) &&
  config.idleTimeoutMs > 0 &&
  isNonEmpty(config.applicationName) &&
  (config.tls.mode === "disabled" || config.tls.mode === "verify-full");

const defaultPoolFactory = Object.freeze({
  create: (config: PostgreSQLConnectionConfig): PostgreSQLConnectionPool =>
    new PostgreSQLConnectionPoolAdapter(config),
});

const failure = (
  classification: "configuration-failure" | "startup-failure",
  safeReason: string,
): MultiCutReplayPostgresqlProductionCompositionResult =>
  Object.freeze({ status: "failed", classification, safeReason });

export const createMultiCutReplayPostgresqlProductionComposition = async (
  config: PostgreSQLConnectionConfig,
  dependencies: MultiCutReplayPostgresqlProductionCompositionDependencies = {},
): Promise<MultiCutReplayPostgresqlProductionCompositionResult> => {
  if (!isValidConfiguration(config)) {
    return failure("configuration-failure", "invalid-postgresql-configuration");
  }

  let pool: PostgreSQLConnectionPool | undefined;
  try {
    pool = (dependencies.poolFactory ?? defaultPoolFactory).create(config);
    const started = await pool.start();
    if (started !== "ready" && started !== "already-started") {
      await pool.close();
      return failure("startup-failure", `pool-start-${started.issue}`);
    }

    const bridge = createMultiCutReplayPostgresqlProductionBridge({ pool });
    const provider =
      createMultiCutReplayPostgresqlDriverConnectionProvider(bridge);
    const runtime = createMultiCutReplayPostgresqlExecutionRuntime(provider);
    let state: MultiCutReplayPostgresqlProductionCompositionState = "ready";

    const composition: MultiCutReplayPostgresqlProductionComposition =
      Object.freeze({
        compositionVersion: "1.0",
        runtime,
        state: () => state,
        async shutdown() {
          if (state === "closed") {
            return Object.freeze({ status: "already-closed" as const });
          }
          if (state === "shutting-down") {
            return Object.freeze({
              status: "failed" as const,
              classification: "shutdown-failure" as const,
              safeReason: "shutdown-already-in-progress",
            });
          }
          state = "shutting-down";
          try {
            const closed = await pool.close();
            if (closed === "drain-timeout") {
              state = "failed";
              return Object.freeze({
                status: "failed" as const,
                classification: "shutdown-failure" as const,
                safeReason: "pool-close-drain-timeout",
              });
            }
            state = "closed";
            return Object.freeze({ status: "closed" as const });
          } catch {
            state = "failed";
            return Object.freeze({
              status: "failed" as const,
              classification: "shutdown-failure" as const,
              safeReason: "pool-close-failed",
            });
          }
        },
      });

    return Object.freeze({ status: "ready", composition });
  } catch {
    if (pool) {
      try {
        await pool.close();
      } catch {
        // Startup failure remains authoritative; cleanup is best effort here.
      }
    }
    return failure("startup-failure", "composition-startup-failed");
  }
};
