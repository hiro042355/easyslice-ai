import type { WorkflowUtcTimestamp } from "../types";
import type {
  PostgreSQLDriverIssueCode,
  PostgreSQLQueryConnectionDisposition,
  PostgreSQLQueryFailureSafeReason,
} from "../postgresqlDriver/types";

export type DurableWorkflowTransactionContextState =
  | "active"
  | "callback-completed"
  | "committing"
  | "rolling-back"
  | "expired";

export type DurableWorkflowTransactionManagerState = "ready" | "disposing" | "disposed";

export type DurableWorkflowTransactionFailureCode =
  | "callback-failed"
  | "transaction-aborted"
  | "deadline-exceeded"
  | "retryable-conflict"
  | "read-only-violation"
  | "schema-mismatch"
  | "unavailable"
  | "rollback-failed"
  | "internal-failure";

export type DurableWorkflowTransactionOperationResult<T> =
  | Readonly<{ status: "success"; value: T }>
  | Readonly<{ status: "failure"; failure: DurableWorkflowTransactionFailureCode }>;

export type DurableWorkflowAfterCommitResult =
  | Readonly<{ status: "completed"; hooksRun: number }>
  | Readonly<{ status: "failed"; hooksRun: number; failure: "after-commit-failed" }>;

export type DurableWorkflowTransactionExecutionResult<T> =
  | Readonly<{ status: "committed"; value: T; afterCommit: DurableWorkflowAfterCommitResult }>
  | Readonly<{ status: "rolled-back"; failure: DurableWorkflowTransactionFailureCode }>
  | Readonly<{ status: "commit-unknown"; failure: "unknown-outcome" }>
  | Readonly<{ status: "rejected"; failure: "nested-transaction" | "manager-disposed" | "invalid-options" }>;

export type DurableWorkflowDatabaseScalar = null | string | boolean | number | Uint8Array;

export type DurableWorkflowDatabaseCommand = Readonly<{
  commandVersion: "1.0";
  statementId: string;
  parameters: readonly DurableWorkflowDatabaseScalar[];
  expectedResult: "none" | "single" | "many";
}>;

export type DurableWorkflowDatabaseRow = Readonly<Record<string, DurableWorkflowDatabaseScalar>>;

export type DurableWorkflowDatabaseExecutionResult =
  | Readonly<{ status: "success"; rows: readonly DurableWorkflowDatabaseRow[]; rowCount: number }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{ status: "cardinality-conflict" }>
  | Readonly<{ status: "failure"; failure: DurableWorkflowTransactionFailureCode; retryable: boolean }>;

export type DurableWorkflowDatabaseSafeFailureVersionV2 = "2.0";

export type DurableWorkflowDatabaseSafeExecutionFailureV2 = Readonly<{
  resultVersion: DurableWorkflowDatabaseSafeFailureVersionV2;
  status: "failure";
  kind: "execution-failure";
  failure: DurableWorkflowTransactionFailureCode;
  retryable: boolean;
  issue: PostgreSQLDriverIssueCode;
  safeReason: PostgreSQLQueryFailureSafeReason;
  sqlStateClass?: "08" | "23" | "25" | "40" | "42" | "57";
  queryConnectionDisposition?: PostgreSQLQueryConnectionDisposition;
}>;

export type DurableWorkflowDatabaseNotFoundV2 = Readonly<{
  status: "not-found";
  expectedResult: "single";
  actualRowCount: 0;
  command: string;
}>;

export type DurableWorkflowDatabaseCardinalityConflictV2 = Readonly<{
  status: "cardinality-conflict";
  expectedResult: "single" | "none";
  actualRowCount: number;
  command: string;
}>;

export type DurableWorkflowDatabaseExecutionResultV2 =
  | Extract<DurableWorkflowDatabaseExecutionResult, { status: "success" }>
  | DurableWorkflowDatabaseNotFoundV2
  | DurableWorkflowDatabaseCardinalityConflictV2
  | DurableWorkflowDatabaseSafeExecutionFailureV2;

export type DurableWorkflowDatabaseCapability = Readonly<{
  capabilityVersion: "1.0";
  execute(command: DurableWorkflowDatabaseCommand): Promise<DurableWorkflowDatabaseExecutionResult>;
}>;

export type DurableWorkflowDatabaseCapabilityV2 = Readonly<{
  capabilityVersion: "1.0";
  failureContractVersion: DurableWorkflowDatabaseSafeFailureVersionV2;
  execute(command: DurableWorkflowDatabaseCommand): Promise<DurableWorkflowDatabaseExecutionResultV2>;
}>;

export type DurableWorkflowTransactionContext = Readonly<{
  contextVersion: "2.0";
  scope: "opaque-production-durable-transaction-scope";
  startedAt: WorkflowUtcTimestamp;
  deadlineMonotonicMilliseconds: number;
  externalIoAllowed: false;
  database: DurableWorkflowDatabaseCapability;
  state(): DurableWorkflowTransactionContextState;
  registerAfterCommit(hook: () => void | Promise<void>): "registered" | "context-expired";
}>;

export type DurableWorkflowTransactionOptions = Readonly<{
  isolation: "read-committed" | "serializable";
  accessMode: "read-write" | "read-only";
  deadlineMonotonicMilliseconds: number;
  statementTimeoutMs?: number;
  lockTimeoutMs?: number;
  idleTransactionTimeoutMs?: number;
}>;

export type DurableWorkflowTransactionManagerDescriptor = Readonly<{
  descriptorVersion: "2.0";
  id: "production-workflow-transaction-manager-v2";
  mode: "production-durable";
  durable: true;
  crossInstance: true;
  nestedTransactions: false;
  savepoints: false;
  externalIoInsideTransaction: false;
  commitUnknownSupported: true;
  productionReady: false;
}>;

export type DurableWorkflowDatabaseCapabilityDescriptor = Readonly<{
  descriptorVersion: "1.0";
  id: "durable-workflow-database-capability-v1";
  explicit: true;
  methods: readonly ["execute"];
  sqlTextExposed: false;
  rawClientExposed: false;
  productionReady: false;
}>;

export type DurableWorkflowTransactionClock = Readonly<{
  nowUtc(): WorkflowUtcTimestamp;
  monotonicMilliseconds(): number;
}>;

export type DurableWorkflowTransactionSessionBeginResult =
  | Readonly<{ status: "active" }>
  | Readonly<{ status: "failure"; failure: DurableWorkflowTransactionFailureCode; connectionAction: "release" | "discard" }>;

export type DurableWorkflowTransactionSessionCommitResult =
  | Readonly<{ status: "committed" }>
  | Readonly<{ status: "unknown-outcome" }>
  | Readonly<{ status: "failure"; failure: DurableWorkflowTransactionFailureCode }>;

export type DurableWorkflowTransactionSessionRollbackResult =
  | Readonly<{ status: "rolled-back" }>
  | Readonly<{ status: "rollback-failed" }>
  | Readonly<{ status: "connection-lost" }>;

export type DurableWorkflowTransactionSession = Readonly<{
  begin(options: DurableWorkflowTransactionOptions): Promise<DurableWorkflowTransactionSessionBeginResult>;
  execute(command: DurableWorkflowDatabaseCommand): Promise<DurableWorkflowDatabaseExecutionResult>;
  commit(): Promise<DurableWorkflowTransactionSessionCommitResult>;
  rollback(): Promise<DurableWorkflowTransactionSessionRollbackResult>;
  release(): void;
  discard(): void;
}>;

export type DurableWorkflowTransactionSessionFactory = Readonly<{
  acquire(): Promise<Readonly<{ status: "acquired"; session: DurableWorkflowTransactionSession }> | Readonly<{ status: "unavailable" }>>;
}>;

export type DurableWorkflowTransactionManager = Readonly<{
  descriptor: DurableWorkflowTransactionManagerDescriptor;
  state(): DurableWorkflowTransactionManagerState;
  runInTransaction<T>(
    options: DurableWorkflowTransactionOptions,
    operation: (context: DurableWorkflowTransactionContext) => Promise<DurableWorkflowTransactionOperationResult<T>> | DurableWorkflowTransactionOperationResult<T>,
  ): Promise<DurableWorkflowTransactionExecutionResult<T>>;
  dispose(): "disposed" | "already-disposed";
}>;

export type DurableWorkflowTransactionValidationResult =
  | Readonly<{ status: "valid" }>
  | Readonly<{ status: "invalid"; issues: readonly DurableWorkflowTransactionValidationIssue[] }>;

export type DurableWorkflowTransactionValidationIssue =
  | "not-an-object"
  | "descriptor-invalid"
  | "state-invalid"
  | "run-method-missing"
  | "dispose-method-missing";
