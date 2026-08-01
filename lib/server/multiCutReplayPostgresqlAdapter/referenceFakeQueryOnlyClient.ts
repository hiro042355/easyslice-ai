import type {
  MultiCutReplayPostgresqlPureExecutionRequest,
  MultiCutReplayPostgresqlQueryExecutionFailure,
  MultiCutReplayPostgresqlQueryExecutionSuccess,
  MultiCutReplayPostgresqlQueryOnlyClient,
} from "./pureTypes";

export type ReferenceMultiCutReplayPostgresqlFakeQueryOnlyClient = Readonly<{
  client: MultiCutReplayPostgresqlQueryOnlyClient;
  capturedRequests: readonly MultiCutReplayPostgresqlPureExecutionRequest[];
}>;

export const createReferenceMultiCutReplayPostgresqlFakeQueryOnlyClient = (
  result:
    | MultiCutReplayPostgresqlQueryExecutionSuccess
    | MultiCutReplayPostgresqlQueryExecutionFailure,
): ReferenceMultiCutReplayPostgresqlFakeQueryOnlyClient => {
  const capturedRequests: MultiCutReplayPostgresqlPureExecutionRequest[] = [];
  const client: MultiCutReplayPostgresqlQueryOnlyClient = Object.freeze({
    async execute(request) {
      capturedRequests.push(request);
      if (result.kind === "execution-failure") return result;
      return Object.freeze({
        kind: "success",
        rows: Object.freeze(
          result.rows.map((row) => Object.freeze({ ...row })),
        ),
        rowCount: result.rowCount,
        command: result.command,
      });
    },
  });
  return Object.freeze({
    client,
    get capturedRequests() {
      return Object.freeze([...capturedRequests]);
    },
  });
};
