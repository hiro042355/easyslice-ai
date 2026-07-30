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
  MultiCutReplayPostgresqlProductionCompositionShutdownResult,
  MultiCutReplayPostgresqlProductionCompositionState,
} from "./types";
import {
  emitReplayPostgresqlEvent,
  NO_OP_REPLAY_POSTGRESQL_OBSERVABILITY_PORT,
} from "../multiCutReplayPostgresqlObservability";

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
  if (
    !isValidConfiguration(config) ||
    (dependencies.drainTimeoutMs !== undefined &&
      (!Number.isFinite(dependencies.drainTimeoutMs) ||
        !Number.isInteger(dependencies.drainTimeoutMs) ||
        dependencies.drainTimeoutMs < 0))
  ) {
    return failure("configuration-failure", "invalid-postgresql-configuration");
  }
  const observability =
    dependencies.observability ?? NO_OP_REPLAY_POSTGRESQL_OBSERVABILITY_PORT;
  const drainTimeoutMs = dependencies.drainTimeoutMs ?? 5_000;

  let pool: PostgreSQLConnectionPool | undefined;
  try {
    pool = (dependencies.poolFactory ?? defaultPoolFactory).create(config);
    const started = await pool.start();
    if (started !== "ready" && started !== "already-started") {
      await pool.close();
      return failure("startup-failure", `pool-start-${started.issue}`);
    }
    const readyPool = pool;

    const bridge = createMultiCutReplayPostgresqlProductionBridge({
      pool: readyPool,
      ...(dependencies.observability
        ? { observability: dependencies.observability }
        : {}),
    });
    const provider =
      createMultiCutReplayPostgresqlDriverConnectionProvider(bridge);
    const runtime = createMultiCutReplayPostgresqlExecutionRuntime(provider, {
      ...(dependencies.observability
        ? { observability: dependencies.observability }
        : {}),
    });
    let state: MultiCutReplayPostgresqlProductionCompositionState = "ready";
    let shutdownPromise:
      Promise<MultiCutReplayPostgresqlProductionCompositionShutdownResult>
      | undefined;

    const composition: MultiCutReplayPostgresqlProductionComposition =
      Object.freeze({
        compositionVersion: "1.0",
        runtime,
        state: () => state,
        shutdown() {
          if (state === "closed") {
            return Promise.resolve(
              Object.freeze({ status: "already-closed" as const }),
            );
          }
          if (shutdownPromise) return shutdownPromise;
          state = "shutting-down";
          emitReplayPostgresqlEvent(observability, Object.freeze({
            schemaVersion: "1.0",
            eventType: "replay-postgresql-pool-draining",
            operation: "shutdown",
            lifecyclePhase: "pool",
            outcome: "started",
            safeReason: "pool-drain-started",
          }));
          shutdownPromise = (async () => {
            try {
              const closed = await readyPool.close({ timeoutMs: drainTimeoutMs });
              if (closed === "drain-timeout") {
                state = "failed";
                emitReplayPostgresqlEvent(observability, Object.freeze({
                  schemaVersion: "1.0",
                  eventType: "replay-postgresql-pool-drain-timeout",
                  operation: "shutdown",
                  lifecyclePhase: "pool",
                  outcome: "failed",
                  safeReason: "pool-close-drain-timeout",
                  connectionDisposition: "discarded",
                }));
                emitReplayPostgresqlEvent(observability, Object.freeze({
                  schemaVersion: "1.0",
                  eventType: "replay-postgresql-pool-closed",
                  operation: "shutdown",
                  lifecyclePhase: "pool",
                  outcome: "completed",
                  safeReason: "pool-closed-after-forced-discard",
                  connectionDisposition: "discarded",
                }));
                return Object.freeze({
                  status: "failed" as const,
                  classification: "shutdown-failure" as const,
                  safeReason: "pool-close-drain-timeout",
                });
              }
              state = "closed";
              emitReplayPostgresqlEvent(observability, Object.freeze({
                schemaVersion: "1.0",
                eventType: "replay-postgresql-pool-drained",
                operation: "shutdown",
                lifecyclePhase: "pool",
                outcome: "completed",
                safeReason: "pool-drain-completed",
                connectionDisposition: "released",
              }));
              emitReplayPostgresqlEvent(observability, Object.freeze({
                schemaVersion: "1.0",
                eventType: "replay-postgresql-pool-closed",
                operation: "shutdown",
                lifecyclePhase: "pool",
                outcome: "completed",
                safeReason: "pool-closed",
                connectionDisposition: "released",
              }));
              return Object.freeze({ status: "closed" as const });
            } catch {
              state = "failed";
              return Object.freeze({
                status: "failed" as const,
                classification: "shutdown-failure" as const,
                safeReason: "pool-close-failed",
              });
            }
          })();
          return shutdownPromise;
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
