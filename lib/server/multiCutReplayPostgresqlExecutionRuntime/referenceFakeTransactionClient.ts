import type {
  MultiCutReplayPostgresqlFakeClientFailure,
  MultiCutReplayPostgresqlFakeClientResult,
  MultiCutReplayPostgresqlPureExecutionRequest,
} from "../multiCutReplayPostgresqlAdapter";
import type {
  MultiCutReplayPostgresqlConnectionProvider,
  MultiCutReplayPostgresqlTransactionConnection,
} from "./types";

export type MultiCutReplayPostgresqlFakeTransactionStage =
  | "acquire"
  | "begin"
  | "execute"
  | "commit"
  | "rollback"
  | "release";

export type MultiCutReplayPostgresqlFakeTransactionFailure = Readonly<{
  failureVersion: "1.0";
  stage: MultiCutReplayPostgresqlFakeTransactionStage;
  classification: "execution-failure" | "commit-unknown";
  safeReason: string;
}>;

export type ReferenceMultiCutReplayPostgresqlFakeTransactionClient =
  Readonly<{
    provider: MultiCutReplayPostgresqlConnectionProvider;
    connection: MultiCutReplayPostgresqlTransactionConnection;
    executionLog: readonly string[];
    capturedRequests:
      readonly MultiCutReplayPostgresqlPureExecutionRequest[];
  }>;

export const createReferenceMultiCutReplayPostgresqlFakeTransactionClient = (
  executionResult: MultiCutReplayPostgresqlFakeClientResult,
  failure?: MultiCutReplayPostgresqlFakeTransactionFailure,
): ReferenceMultiCutReplayPostgresqlFakeTransactionClient => {
  const executionLog: string[] = [];
  const capturedRequests: MultiCutReplayPostgresqlPureExecutionRequest[] = [];
  const fail = (stage: MultiCutReplayPostgresqlFakeTransactionStage): void => {
    if (failure?.stage !== stage) return;
    const projected: MultiCutReplayPostgresqlFakeClientFailure =
      Object.freeze({
        failureVersion: "1.0",
        classification: failure.classification,
        safeReason: failure.safeReason,
      });
    throw projected;
  };
  const connection: MultiCutReplayPostgresqlTransactionConnection =
    Object.freeze({
      async begin() {
        executionLog.push("begin");
        fail("begin");
      },
      async execute(request) {
        executionLog.push(`execute:${request.statementId}`);
        capturedRequests.push(request);
        fail("execute");
        return Object.freeze({
          rows: Object.freeze(
            executionResult.rows.map((row) => Object.freeze({ ...row })),
          ),
          rowCount: executionResult.rowCount,
          command: executionResult.command,
        });
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
  const provider: MultiCutReplayPostgresqlConnectionProvider =
    Object.freeze({
      async acquire() {
        executionLog.push("acquire");
        fail("acquire");
        return connection;
      },
      async release(released) {
        executionLog.push("release");
        if (released !== connection) {
          throw new Error("unexpected-connection-release");
        }
        fail("release");
      },
    });
  return Object.freeze({
    provider,
    connection,
    get executionLog() {
      return Object.freeze([...executionLog]);
    },
    get capturedRequests() {
      return Object.freeze([...capturedRequests]);
    },
  });
};
