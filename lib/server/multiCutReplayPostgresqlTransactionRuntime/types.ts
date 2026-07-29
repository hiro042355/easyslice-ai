import type {
  MultiCutReplayPostgresqlClientCancellationBoundary,
} from "../multiCutReplayPostgresqlClient";
import type {
  MultiCutReplayPostgresqlExecutionDriver,
  MultiCutReplayPostgresqlExecutionDriverRequest,
  MultiCutReplayPostgresqlExecutionDriverResult,
  MultiCutReplayPostgresqlExecutionDriverTransactionScope,
} from "../multiCutReplayPostgresqlExecutionDriver";

export type MultiCutReplayPostgresqlTransactionRuntimeOwnership =
  | "none"
  | "runtime-boundary"
  | "workflow-completion-boundary";

export type MultiCutReplayPostgresqlTransactionRuntimeCommitBoundary =
  | "not-applicable"
  | "dependency-owned"
  | "workflow-completion-owned";

export type MultiCutReplayPostgresqlTransactionRuntimeRollbackBoundary =
  | "not-applicable"
  | "dependency-owned"
  | "workflow-completion-owned";

export type MultiCutReplayPostgresqlTransactionRuntimeConnectionLifetime =
  Readonly<{
    lifetimeVersion: "1.0";
    acquisition: "dependency-boundary";
    release: "dependency-boundary";
    ownership: "dependency";
  }>;

export type MultiCutReplayPostgresqlTransactionRuntimeContext = Readonly<{
  contextVersion: "1.0";
  transactionScope:
    MultiCutReplayPostgresqlExecutionDriverTransactionScope;
  transactionOwnership:
    MultiCutReplayPostgresqlTransactionRuntimeOwnership;
  commitBoundary:
    MultiCutReplayPostgresqlTransactionRuntimeCommitBoundary;
  rollbackBoundary:
    MultiCutReplayPostgresqlTransactionRuntimeRollbackBoundary;
  cancellation:
    MultiCutReplayPostgresqlClientCancellationBoundary;
  connectionLifetime:
    MultiCutReplayPostgresqlTransactionRuntimeConnectionLifetime;
  executionMetadata: Readonly<Record<string, unknown>>;
}>;

export type MultiCutReplayPostgresqlTransactionRuntimeRequest = Readonly<{
  requestVersion: "1.0";
  driverRequest: MultiCutReplayPostgresqlExecutionDriverRequest;
  runtimeContext: MultiCutReplayPostgresqlTransactionRuntimeContext;
}>;

export type MultiCutReplayPostgresqlTransactionRuntimeResult =
  MultiCutReplayPostgresqlExecutionDriverResult;

export type MultiCutReplayPostgresqlTransactionRuntimeDependencies =
  Readonly<{
    driver: MultiCutReplayPostgresqlExecutionDriver;
  }>;

export type MultiCutReplayPostgresqlTransactionRuntimeMetadata =
  Readonly<{
    runtimeVersion: "1.0";
    requestBoundary: "passthrough";
    resultBoundary: "passthrough";
    transactionBoundary: "context-only";
    commitBoundary: "metadata-only";
    rollbackBoundary: "metadata-only";
    commitUnknownBoundary: "passthrough";
    cancellationBoundary: "context-only";
    connectionLifetimeBoundary: "metadata-only";
  }>;

export type MultiCutReplayPostgresqlTransactionRuntime = Readonly<{
  metadata: MultiCutReplayPostgresqlTransactionRuntimeMetadata;
  execute(
    request: MultiCutReplayPostgresqlTransactionRuntimeRequest,
  ): Promise<MultiCutReplayPostgresqlTransactionRuntimeResult>;
}>;

export type MultiCutReplayPostgresqlTransactionRuntimeFactory = Readonly<{
  create(
    dependencies:
      MultiCutReplayPostgresqlTransactionRuntimeDependencies,
  ): MultiCutReplayPostgresqlTransactionRuntime;
}>;
