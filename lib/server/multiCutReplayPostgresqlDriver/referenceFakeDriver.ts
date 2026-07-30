import type {
  MultiCutReplayPostgresqlFakeClientResult,
  MultiCutReplayPostgresqlPureExecutionRequest,
} from "../multiCutReplayPostgresqlAdapter";
import type {
  MultiCutReplayPostgresqlDriver,
  MultiCutReplayPostgresqlDriverConnection,
  MultiCutReplayPostgresqlDriverError,
} from "./types";

export type MultiCutReplayPostgresqlFakeDriverStage =
  | "acquire"
  | "begin"
  | "query"
  | "commit"
  | "rollback"
  | "release";

export type MultiCutReplayPostgresqlFakeDriverFailure = Readonly<{
  stage: MultiCutReplayPostgresqlFakeDriverStage;
  error: MultiCutReplayPostgresqlDriverError;
}>;

export type ReferenceMultiCutReplayPostgresqlFakeDriver = Readonly<{
  driver: MultiCutReplayPostgresqlDriver;
  connection: MultiCutReplayPostgresqlDriverConnection;
  executionLog: readonly string[];
  capturedRequests: readonly MultiCutReplayPostgresqlPureExecutionRequest[];
}>;

const copyResult = (
  result: MultiCutReplayPostgresqlFakeClientResult,
): MultiCutReplayPostgresqlFakeClientResult =>
  Object.freeze({
    rows: Object.freeze(
      result.rows.map((row) => Object.freeze({ ...row })),
    ),
    rowCount: result.rowCount,
    command: result.command,
  });

export const createReferenceMultiCutReplayPostgresqlFakeDriver = (
  queryResult: MultiCutReplayPostgresqlFakeClientResult,
  failure?: MultiCutReplayPostgresqlFakeDriverFailure,
): ReferenceMultiCutReplayPostgresqlFakeDriver => {
  const executionLog: string[] = [];
  const capturedRequests: MultiCutReplayPostgresqlPureExecutionRequest[] = [];
  const fail = (stage: MultiCutReplayPostgresqlFakeDriverStage): void => {
    if (failure?.stage === stage) throw Object.freeze({ ...failure.error });
  };
  const connection: MultiCutReplayPostgresqlDriverConnection = Object.freeze({
    async begin() {
      executionLog.push("begin");
      fail("begin");
    },
    async query(request) {
      executionLog.push(`query:${request.statementId}`);
      capturedRequests.push(request);
      fail("query");
      return copyResult(queryResult);
    },
    async commit() {
      executionLog.push("commit");
      fail("commit");
    },
    async rollback() {
      executionLog.push("rollback");
      fail("rollback");
    },
  });
  const driver: MultiCutReplayPostgresqlDriver = Object.freeze({
    async acquire() {
      executionLog.push("acquire");
      fail("acquire");
      return connection;
    },
    async release(released) {
      executionLog.push("release");
      if (released !== connection) {
        throw new Error("unexpected-driver-connection");
      }
      fail("release");
    },
  });
  return Object.freeze({
    driver,
    connection,
    get executionLog() {
      return Object.freeze([...executionLog]);
    },
    get capturedRequests() {
      return Object.freeze([...capturedRequests]);
    },
  });
};
