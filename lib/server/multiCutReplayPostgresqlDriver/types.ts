import type {
  MultiCutReplayPostgresqlFakeClientResult,
  MultiCutReplayPostgresqlPureExecutionRequest,
} from "../multiCutReplayPostgresqlAdapter";
import type {
  PostgreSQLQueryConnectionDisposition,
} from "../productionWorkflowRuntime/postgresqlDriver";

export type MultiCutReplayPostgresqlDriverErrorKind =
  | "connection-unavailable"
  | "transaction-rejected"
  | "query-rejected"
  | "serialization-conflict"
  | "commit-outcome-unknown";

export type MultiCutReplayPostgresqlDriverError = Readonly<{
  errorVersion: "1.0";
  kind: MultiCutReplayPostgresqlDriverErrorKind;
  safeReason: string;
  queryConnectionDisposition?: PostgreSQLQueryConnectionDisposition;
}>;

export type MultiCutReplayPostgresqlDriverFailure = Readonly<{
  failureVersion: "1.0";
  classification: "execution-failure" | "commit-unknown";
  retryClassification: "retryable" | "non-retryable" | "commit-unknown";
  safeReason: string;
  sqlStateClass?: "08" | "23" | "25" | "40" | "42" | "57";
  queryConnectionDisposition?: PostgreSQLQueryConnectionDisposition;
}>;

export type MultiCutReplayPostgresqlDriverConnection = Readonly<{
  begin(): Promise<void>;
  query(
    request: MultiCutReplayPostgresqlPureExecutionRequest,
  ): Promise<MultiCutReplayPostgresqlFakeClientResult>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}>;

export type MultiCutReplayPostgresqlDriver = Readonly<{
  acquire(): Promise<MultiCutReplayPostgresqlDriverConnection>;
  release(connection: MultiCutReplayPostgresqlDriverConnection): Promise<void>;
}>;
