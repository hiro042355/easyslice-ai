import type {
  MultiCutReplayPostgresqlFakeClient,
  MultiCutReplayPostgresqlFakeClientFailure,
  MultiCutReplayPostgresqlFakeClientResult,
  MultiCutReplayPostgresqlPureExecutionRequest,
} from "./pureTypes";

export type ReferenceMultiCutReplayPostgresqlFakeClient = Readonly<{
  client: MultiCutReplayPostgresqlFakeClient;
  capturedRequests:
    readonly MultiCutReplayPostgresqlPureExecutionRequest[];
}>;

export const createReferenceMultiCutReplayPostgresqlFakeClient = (
  result:
    | MultiCutReplayPostgresqlFakeClientResult
    | MultiCutReplayPostgresqlFakeClientFailure,
): ReferenceMultiCutReplayPostgresqlFakeClient => {
  const capturedRequests: MultiCutReplayPostgresqlPureExecutionRequest[] = [];
  const client: MultiCutReplayPostgresqlFakeClient = Object.freeze({
    async execute(request) {
      capturedRequests.push(request);
      if ("failureVersion" in result) {
        throw result;
      }
      return Object.freeze({
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
