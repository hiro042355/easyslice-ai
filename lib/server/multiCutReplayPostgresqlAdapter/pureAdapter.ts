import type {
  MultiCutReplayPostgresqlFakeClient,
  MultiCutReplayPostgresqlFakeClientFailure,
  MultiCutReplayPostgresqlPureAdapter,
} from "./pureTypes";
import {
  createMultiCutReplayPostgresqlQueryMappingCore,
  getMultiCutReplayPostgresqlPureAdapterMetadata,
} from "./queryMappingCore";

const isExecutionFailure = (
  failure: unknown,
): failure is MultiCutReplayPostgresqlFakeClientFailure &
  Readonly<{ classification: "execution-failure" }> =>
  typeof failure === "object" &&
  failure !== null &&
  "failureVersion" in failure &&
  failure.failureVersion === "1.0" &&
  "classification" in failure &&
  failure.classification === "execution-failure" &&
  "safeReason" in failure &&
  typeof failure.safeReason === "string";

const isCommitUnknownFailure = (
  failure: unknown,
): failure is MultiCutReplayPostgresqlFakeClientFailure &
  Readonly<{ classification: "commit-unknown" }> =>
  typeof failure === "object" &&
  failure !== null &&
  "failureVersion" in failure &&
  failure.failureVersion === "1.0" &&
  "classification" in failure &&
  failure.classification === "commit-unknown" &&
  "safeReason" in failure &&
  typeof failure.safeReason === "string" &&
  (!("sqlStateClass" in failure) ||
    failure.sqlStateClass === "08" ||
    failure.sqlStateClass === "23" ||
    failure.sqlStateClass === "25" ||
    failure.sqlStateClass === "40" ||
    failure.sqlStateClass === "42" ||
    failure.sqlStateClass === "57");

export const createMultiCutReplayPostgresqlPureAdapter = (
  client: MultiCutReplayPostgresqlFakeClient,
): MultiCutReplayPostgresqlPureAdapter => {
  const core = createMultiCutReplayPostgresqlQueryMappingCore(Object.freeze({
    async execute(request) {
      try {
        const result = await client.execute(request);
        return Object.freeze({ kind: "success", ...result });
      } catch (failure) {
        if (!isExecutionFailure(failure)) throw failure;
        return Object.freeze({
          kind: "execution-failure",
          failureVersion: "1.0",
          classification: "execution-failure",
          safeReason: failure.safeReason,
          ...(failure.sqlStateClass
            ? { sqlStateClass: failure.sqlStateClass }
            : {}),
          ...(failure.queryConnectionDisposition
            ? {
                queryConnectionDisposition:
                  failure.queryConnectionDisposition,
              }
            : {}),
        });
      }
    },
  }));
  return Object.freeze({
    createExecutionRequest(input) {
      return core.createExecutionRequest(input);
    },
    async execute(input) {
      try {
        return await core.execute(input);
      } catch (failure) {
        if (!isCommitUnknownFailure(failure)) throw failure;
        return Object.freeze({
          resultVersion: "1.0",
          status: "execution-failure",
          statementId: input.statementId,
          classification: "commit-unknown",
          safeReason: failure.safeReason,
          ...(failure.sqlStateClass
            ? { sqlStateClass: failure.sqlStateClass }
            : {}),
          metadata: getMultiCutReplayPostgresqlPureAdapterMetadata(
            input.statementId,
          ),
        });
      }
    },
  });
};
