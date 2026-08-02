export type PostgreSQLDriverIssueCode =
  | "invalid-request" | "query-cancelled" | "timeout" | "connection-unavailable"
  | "schema-mismatch" | "constraint-conflict" | "retryable-conflict"
  | "read-only" | "insufficient-privilege" | "unknown-failure" | "disposed";

export type PostgreSQLConstraintClass =
  | "identity-conflict" | "foreign-reference-conflict" | "shape-constraint-failed"
  | "schema-contract-mismatch" | "unknown-constraint";

export type PostgreSQLParameter =
  | Readonly<{ kind: "null" }>
  | Readonly<{ kind: "string"; value: string }>
  | Readonly<{ kind: "boolean"; value: boolean }>
  | Readonly<{ kind: "safe-integer"; value: number }>
  | Readonly<{ kind: "bigint"; value: string }>
  | Readonly<{ kind: "uuid"; value: string }>
  | Readonly<{ kind: "utc-timestamp"; value: string }>
  | Readonly<{ kind: "bytea"; value: Uint8Array }>
  | Readonly<{ kind: "json"; value: unknown }>;

export type PostgreSQLValue = null | string | boolean | number | Uint8Array | PostgreSQLJsonValue;
export type PostgreSQLJsonValue = null | string | boolean | number | readonly PostgreSQLJsonValue[] | Readonly<{ [key: string]: PostgreSQLJsonValue }>;
export type PostgreSQLRow = Readonly<Record<string, PostgreSQLValue>>;

export type PostgreSQLQueryRequest = Readonly<{
  statementId: string;
  text: string;
  values: readonly PostgreSQLParameter[];
  expectedResult: "none" | "single" | "many";
}>;

export type PostgreSQLSafeDiagnostic = Readonly<{
  stage: "pool" | "checkout" | "query" | "begin" | "commit" | "rollback";
  statementId?: string;
  issue: PostgreSQLDriverIssueCode;
  sqlStateClass?: "08" | "23" | "25" | "40" | "42" | "57";
  connectionState?: PostgreSQLConnectionState;
  transactionState?: PostgreSQLTransactionState;
  retryable: boolean;
  queryConnectionDisposition?: PostgreSQLQueryConnectionDisposition;
}>;

export type PostgreSQLExecutionFailure = Readonly<{
  status: "failure";
  issue: PostgreSQLDriverIssueCode;
  constraintClass?: PostgreSQLConstraintClass;
  diagnostic: PostgreSQLSafeDiagnostic;
}>;

export type PostgreSQLQueryFailureSafeReason =
  `postgresql-${PostgreSQLDriverIssueCode}`;

export type PostgreSQLQueryExecutionFailure = PostgreSQLExecutionFailure &
  Readonly<{
    safeReason: PostgreSQLQueryFailureSafeReason;
  }>;

export type PostgreSQLQueryResult =
  | Readonly<{ status: "success"; rows: readonly PostgreSQLRow[]; rowCount: number; command: string }>
  | Readonly<{
      status: "not-found";
      expectedResult: "single";
      actualRowCount: 0;
      command: string;
    }>
  | Readonly<{
      status: "cardinality-conflict";
      expectedResult: "single" | "none";
      actualRowCount: number;
      command: string;
    }>
  | PostgreSQLQueryExecutionFailure;

export type PostgreSQLPoolState = "created" | "starting" | "ready" | "draining" | "closed" | "failed";
export type PostgreSQLConnectionState = "checked-out" | "transaction-active" | "released" | "discarded" | "unknown";
export type PostgreSQLTransactionState = "idle" | "active" | "failed" | "committing" | "committed" | "rolling-back" | "rolled-back" | "unknown" | "released";
export type PostgreSQLQueryConnectionDisposition =
  | "safe-to-reuse"
  | "must-rollback-before-reuse"
  | "must-discard"
  | "unknown";

export type PostgreSQLConnectionReuse =
  PostgreSQLQueryConnectionDisposition;

export type PostgreSQLCommitResult =
  | Readonly<{ status: "committed" }>
  | Readonly<{ status: "definitely-rolled-back" }>
  | Readonly<{ status: "unknown-outcome" }>
  | Readonly<{ status: "invalid-state" }>
  | Readonly<{ status: "connection-unavailable" }>;

export type PostgreSQLRollbackResult =
  | Readonly<{ status: "rolled-back" }>
  | Readonly<{ status: "not-required" }>
  | Readonly<{ status: "rollback-failed" }>
  | Readonly<{ status: "connection-lost" }>
  | Readonly<{ status: "invalid-state" }>;

export type PostgreSQLConnectionConfig = Readonly<{
  host: string; port: number; database: string; user: string; password: string;
  maxConnections: number; connectionTimeoutMs: number; idleTimeoutMs: number;
  queryTimeoutMs?: number;
  applicationName: string; tls: Readonly<{ mode: "disabled" | "verify-full" }>;
}>;

export type PostgreSQLDriverDescriptor = Readonly<{
  descriptorVersion: "1.0"; id: "postgresql-driver-adapter-v1"; driver: "pg";
  driverMajor: 8; sqlStyle: "parameterized-explicit"; namedPreparedStatements: false;
  abortSignal: "unsupported-pg-8.22.0";
  capabilities: PostgreSQLProductionCapabilities;
  readinessBlockers: readonly PostgreSQLReadinessBlocker[];
  productionReady: boolean;
}>;

export type PostgreSQLConnection = Readonly<{
  state(): PostgreSQLConnectionState;
  query(request: PostgreSQLQueryRequest): Promise<PostgreSQLQueryResult>;
  begin(): Promise<PostgreSQLTransactionConnection | PostgreSQLExecutionFailure>;
  release(): "released" | "already-released" | "transaction-active";
  discard(): "discarded" | "already-released";
}>;

export type PostgreSQLTransactionConnection = Readonly<{
  state(): PostgreSQLTransactionState;
  query(request: PostgreSQLQueryRequest): Promise<PostgreSQLQueryResult>;
  commit(): Promise<PostgreSQLCommitResult>;
  rollback(): Promise<PostgreSQLRollbackResult>;
  release(): "released" | "already-released" | "transaction-active";
}>;

export type PostgreSQLConnectionPool = Readonly<{
  state(): PostgreSQLPoolState;
  start(): Promise<"ready" | "already-started" | PostgreSQLExecutionFailure>;
  checkout(): Promise<PostgreSQLConnection | PostgreSQLExecutionFailure>;
  close(options?: Readonly<{ timeoutMs: number }>): Promise<
    "closed" | "already-closed" | "drain-timeout"
  >;
}>;
import type {
  PostgreSQLProductionCapabilities,
  PostgreSQLReadinessBlocker,
} from "./postgresqlProductionReadiness";
