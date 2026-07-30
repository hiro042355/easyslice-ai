import {
  createMultiCutReplayPostgresqlPureAdapter,
} from "../multiCutReplayPostgresqlAdapter";
import type {
  MultiCutReplayPostgresqlPureAdapterResult,
} from "../multiCutReplayPostgresqlAdapter";
import type {
  MultiCutReplayPostgresqlConnectionProvider,
  MultiCutReplayPostgresqlExecutionRuntime,
  MultiCutReplayPostgresqlExecutionRuntimeFailureClassification,
  MultiCutReplayPostgresqlExecutionRuntimeResult,
  MultiCutReplayPostgresqlTransactionConnection,
} from "./types";

const safeFailure = (
  failure: unknown,
  fallback: string,
): Readonly<{
  classification:
    MultiCutReplayPostgresqlExecutionRuntimeFailureClassification;
  safeReason: string;
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
    ...(adapterResult ? { adapterResult } : {}),
  });
};

export const createMultiCutReplayPostgresqlExecutionRuntime = (
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
