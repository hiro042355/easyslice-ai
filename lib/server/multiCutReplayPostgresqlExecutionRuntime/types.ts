import type {
  MultiCutReplayPostgresqlFakeClient,
  MultiCutReplayPostgresqlPureAdapterInput,
  MultiCutReplayPostgresqlPureAdapterResult,
} from "../multiCutReplayPostgresqlAdapter";

export type MultiCutReplayPostgresqlExecutionRuntimeFailureClassification =
  | "retryable"
  | "non-retryable"
  | "commit-unknown";

export type MultiCutReplayPostgresqlTransactionConnection =
  MultiCutReplayPostgresqlFakeClient &
    Readonly<{
      begin(): Promise<void>;
      commit(): Promise<void>;
      rollback(): Promise<void>;
    }>;

export type MultiCutReplayPostgresqlConnectionProvider = Readonly<{
  acquire(): Promise<MultiCutReplayPostgresqlTransactionConnection>;
  release(
    connection: MultiCutReplayPostgresqlTransactionConnection,
  ): Promise<void>;
}>;

export type MultiCutReplayPostgresqlExecutionRuntimeInput =
  MultiCutReplayPostgresqlPureAdapterInput;

export type MultiCutReplayPostgresqlExecutionRuntimeResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "completed";
    adapterResult: MultiCutReplayPostgresqlPureAdapterResult;
    retryClassification: "not-applicable";
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "failed";
    phase: "acquire" | "begin" | "execute" | "commit" | "rollback" | "release";
    classification:
      MultiCutReplayPostgresqlExecutionRuntimeFailureClassification;
    safeReason: string;
    adapterResult?: MultiCutReplayPostgresqlPureAdapterResult;
  }>;

export type MultiCutReplayPostgresqlExecutionRuntime = Readonly<{
  execute(
    input: MultiCutReplayPostgresqlExecutionRuntimeInput,
  ): Promise<MultiCutReplayPostgresqlExecutionRuntimeResult>;
}>;
