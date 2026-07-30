import {
  createMultiCutReplayPostgresqlPureAdapter,
} from "../multiCutReplayPostgresqlAdapter";
import type {
  MultiCutReplayPostgresqlPureAdapterResult,
} from "../multiCutReplayPostgresqlAdapter";
import type {
  MultiCutReplayPostgresqlConnectionProvider,
  MultiCutReplayPostgresqlExecutionRuntime,
  MultiCutReplayPostgresqlExecutionRuntimeDependencies,
  MultiCutReplayPostgresqlExecutionRuntimeFailureClassification,
  MultiCutReplayPostgresqlExecutionRuntimeResult,
  MultiCutReplayPostgresqlTransactionConnection,
} from "./types";
import {
  emitReplayPostgresqlEvent,
  NO_OP_REPLAY_POSTGRESQL_OBSERVABILITY_PORT,
} from "../multiCutReplayPostgresqlObservability";
import type {
  ReplayPostgresqlOperation,
} from "../multiCutReplayPostgresqlObservability";

const operationByStatement = Object.freeze({
  "resolve-new-reservation": "reserve",
  "resolve-existing-replay": "reserve",
  "lookup-authoritative-replay": "lookup",
  "renew-processing-reservation": "renew",
  "complete-processing-replay": "complete",
  "fail-processing-replay": "fail",
  "release-processing-replay": "release",
  "takeover-stale-processing-replay": "takeover",
} satisfies Readonly<Record<string, ReplayPostgresqlOperation>>);

const safeFailure = (
  failure: unknown,
  fallback: string,
): Readonly<{
  classification:
    MultiCutReplayPostgresqlExecutionRuntimeFailureClassification;
  safeReason: string;
  sqlStateClass?: "08" | "23" | "25" | "40" | "42" | "57";
}> => {
  if (
    typeof failure === "object" &&
    failure !== null &&
    "classification" in failure &&
    failure.classification === "commit-unknown"
  ) {
    return Object.freeze({
      classification: "commit-unknown",
      safeReason:
        "safeReason" in failure && typeof failure.safeReason === "string"
          ? failure.safeReason
          : "commit-outcome-unknown",
      ...("sqlStateClass" in failure &&
      (failure.sqlStateClass === "08" ||
        failure.sqlStateClass === "23" ||
        failure.sqlStateClass === "25" ||
        failure.sqlStateClass === "40" ||
        failure.sqlStateClass === "42" ||
        failure.sqlStateClass === "57")
        ? { sqlStateClass: failure.sqlStateClass }
        : {}),
    });
  }
  if (
    typeof failure === "object" &&
    failure !== null &&
    "classification" in failure &&
    failure.classification === "execution-failure" &&
    "retryClassification" in failure
  ) {
    return Object.freeze({
      classification: "non-retryable",
      safeReason: fallback,
      ...("sqlStateClass" in failure &&
      (failure.sqlStateClass === "08" ||
        failure.sqlStateClass === "23" ||
        failure.sqlStateClass === "25" ||
        failure.sqlStateClass === "40" ||
        failure.sqlStateClass === "42" ||
        failure.sqlStateClass === "57")
        ? { sqlStateClass: failure.sqlStateClass }
        : {}),
    });
  }
  return Object.freeze({
    classification: "non-retryable",
    safeReason: fallback,
  });
};

const adapterFailureClassification = (
  result: MultiCutReplayPostgresqlPureAdapterResult,
): MultiCutReplayPostgresqlExecutionRuntimeFailureClassification => {
  if (
    result.status === "execution-failure" &&
    result.classification === "commit-unknown"
  ) {
    return "commit-unknown";
  }
  if (
    result.status === "execution-failure" &&
    result.metadata.retryClassification === "repeat-read"
  ) {
    return "retryable";
  }
  return "non-retryable";
};

const rollbackAndRelease = async (
  connection: MultiCutReplayPostgresqlTransactionConnection,
  provider: MultiCutReplayPostgresqlConnectionProvider,
  phase: "execute" | "commit",
  classification: MultiCutReplayPostgresqlExecutionRuntimeFailureClassification,
  safeReason: string,
  adapterResult?: MultiCutReplayPostgresqlPureAdapterResult,
  sqlStateClass?: "08" | "23" | "25" | "40" | "42" | "57",
): Promise<MultiCutReplayPostgresqlExecutionRuntimeResult> => {
  try {
    await connection.rollback();
  } catch {
    try {
      await provider.release(connection);
    } catch {
      return Object.freeze({
        resultVersion: "1.0",
        status: "failed",
        phase: "release",
        classification: "non-retryable",
        safeReason: "connection-release-failed-after-rollback-failure",
        ...(adapterResult ? { adapterResult } : {}),
      });
    }
    return Object.freeze({
      resultVersion: "1.0",
      status: "failed",
      phase: "rollback",
      classification: "non-retryable",
      safeReason: "transaction-rollback-failed",
      ...(adapterResult ? { adapterResult } : {}),
    });
  }
  try {
    await provider.release(connection);
  } catch {
    return Object.freeze({
      resultVersion: "1.0",
      status: "failed",
      phase: "release",
      classification: "non-retryable",
      safeReason: "connection-release-failed",
      ...(adapterResult ? { adapterResult } : {}),
    });
  }
  return Object.freeze({
    resultVersion: "1.0",
    status: "failed",
    phase,
    classification,
    safeReason,
    ...(sqlStateClass ? { sqlStateClass } : {}),
    ...(adapterResult ? { adapterResult } : {}),
  });
};

const createUnobservedRuntime = (
  provider: MultiCutReplayPostgresqlConnectionProvider,
): MultiCutReplayPostgresqlExecutionRuntime =>
  Object.freeze({
    async execute(input) {
      let connection: MultiCutReplayPostgresqlTransactionConnection;
      try {
        connection = await provider.acquire();
      } catch (failure) {
        const classified = safeFailure(failure, "connection-acquire-failed");
        return Object.freeze({
          resultVersion: "1.0",
          status: "failed",
          phase: "acquire",
          ...classified,
        });
      }

      try {
        await connection.begin();
      } catch (failure) {
        const classified = safeFailure(failure, "transaction-begin-failed");
        try {
          await provider.release(connection);
        } catch {
          return Object.freeze({
            resultVersion: "1.0",
            status: "failed",
            phase: "release",
            classification: "non-retryable",
            safeReason: "connection-release-failed-after-begin-failure",
          });
        }
        return Object.freeze({
          resultVersion: "1.0",
          status: "failed",
          phase: "begin",
          ...classified,
        });
      }

      let adapterResult: MultiCutReplayPostgresqlPureAdapterResult;
      try {
        adapterResult =
          await createMultiCutReplayPostgresqlPureAdapter(connection).execute(
            input,
          );
      } catch {
        return rollbackAndRelease(
          connection,
          provider,
          "execute",
          "non-retryable",
          "adapter-execution-failed",
        );
      }

      if (
        adapterResult.status === "execution-failure" &&
        adapterResult.classification === "commit-unknown"
      ) {
        try {
          await provider.release(connection);
        } catch {
          return Object.freeze({
            resultVersion: "1.0",
            status: "failed",
            phase: "release",
            classification: "commit-unknown",
            safeReason: "connection-release-failed-after-commit-unknown",
            adapterResult,
          });
        }
        return Object.freeze({
          resultVersion: "1.0",
          status: "failed",
          phase: "execute",
          classification: "commit-unknown",
          safeReason: adapterResult.safeReason,
          adapterResult,
        });
      }

      if (
        adapterResult.status === "execution-failure" ||
        adapterResult.status === "cardinality-failure"
      ) {
        return rollbackAndRelease(
          connection,
          provider,
          "execute",
          adapterFailureClassification(adapterResult),
          "adapter-result-failed",
          adapterResult,
          adapterResult.status === "execution-failure"
            ? adapterResult.sqlStateClass
            : undefined,
        );
      }

      try {
        await connection.commit();
      } catch (failure) {
        const classified = safeFailure(failure, "transaction-commit-failed");
        if (classified.classification === "commit-unknown") {
          try {
            await provider.release(connection);
          } catch {
            return Object.freeze({
              resultVersion: "1.0",
              status: "failed",
              phase: "release",
              classification: "commit-unknown",
              safeReason: "connection-release-failed-after-commit-unknown",
              adapterResult,
            });
          }
          return Object.freeze({
            resultVersion: "1.0",
            status: "failed",
            phase: "commit",
            ...classified,
            adapterResult,
          });
        }
        return rollbackAndRelease(
          connection,
          provider,
          "commit",
          classified.classification,
          classified.safeReason,
          adapterResult,
        );
      }

      try {
        await provider.release(connection);
      } catch {
        return Object.freeze({
          resultVersion: "1.0",
          status: "failed",
          phase: "release",
          classification: "non-retryable",
          safeReason: "connection-release-failed-after-commit",
          adapterResult,
        });
      }
      return Object.freeze({
        resultVersion: "1.0",
        status: "completed",
        adapterResult,
        retryClassification: "not-applicable",
      });
    },
  });

export const createMultiCutReplayPostgresqlExecutionRuntime = (
  provider: MultiCutReplayPostgresqlConnectionProvider,
  dependencies: MultiCutReplayPostgresqlExecutionRuntimeDependencies = {},
): MultiCutReplayPostgresqlExecutionRuntime => {
  const runtime = createUnobservedRuntime(provider);
  const observability =
    dependencies.observability ?? NO_OP_REPLAY_POSTGRESQL_OBSERVABILITY_PORT;
  return Object.freeze({
    async execute(input) {
      const result = await runtime.execute(input);
      if (result.status !== "failed") return result;
      const operation = operationByStatement[input.statementId];
      if (result.phase === "rollback") {
        emitReplayPostgresqlEvent(observability, Object.freeze({
          schemaVersion: "1.0",
          eventType: "replay-postgresql-rollback-failed",
          operation,
          lifecyclePhase: "transaction",
          transactionPhase: "rollback",
          classification: "non-retryable",
          retryMetadata: "non-retryable",
          safeReason: result.safeReason,
          ...(result.sqlStateClass
            ? { sqlStateClass: result.sqlStateClass }
            : {}),
          connectionDisposition: "released",
          outcome: "failed",
        }));
        return result;
      }
      emitReplayPostgresqlEvent(observability, Object.freeze({
        schemaVersion: "1.0",
        eventType: "replay-postgresql-execution-failed",
        operation,
        lifecyclePhase: "execution",
        classification: result.classification,
        retryMetadata: result.classification,
        safeReason: result.safeReason,
        ...(result.sqlStateClass ? { sqlStateClass: result.sqlStateClass } : {}),
        outcome: "failed",
      }));
      return result;
    },
  });
};
