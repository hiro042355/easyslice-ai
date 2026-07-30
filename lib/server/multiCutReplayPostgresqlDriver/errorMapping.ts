import type {
  MultiCutReplayPostgresqlDriverError,
  MultiCutReplayPostgresqlDriverFailure,
} from "./types";

const isDriverError = (
  failure: unknown,
): failure is MultiCutReplayPostgresqlDriverError =>
  typeof failure === "object" &&
  failure !== null &&
  "errorVersion" in failure &&
  failure.errorVersion === "1.0" &&
  "kind" in failure &&
  (failure.kind === "connection-unavailable" ||
    failure.kind === "transaction-rejected" ||
    failure.kind === "query-rejected" ||
    failure.kind === "serialization-conflict" ||
    failure.kind === "commit-outcome-unknown") &&
  "safeReason" in failure &&
  typeof failure.safeReason === "string";

export const mapMultiCutReplayPostgresqlDriverError = (
  failure: unknown,
): MultiCutReplayPostgresqlDriverFailure => {
  if (!isDriverError(failure)) {
    return Object.freeze({
      failureVersion: "1.0",
      classification: "execution-failure",
      retryClassification: "non-retryable",
      safeReason: "unclassified-postgresql-driver-failure",
    });
  }
  if (failure.kind === "commit-outcome-unknown") {
    return Object.freeze({
      failureVersion: "1.0",
      classification: "commit-unknown",
      retryClassification: "commit-unknown",
      safeReason: failure.safeReason,
    });
  }
  return Object.freeze({
    failureVersion: "1.0",
    classification: "execution-failure",
    retryClassification:
      failure.kind === "connection-unavailable" ||
      failure.kind === "serialization-conflict"
        ? "retryable"
        : "non-retryable",
    safeReason: failure.safeReason,
  });
};
