import type {
  MultiCutReplayPostgresqlStatementExecutionRequest,
  MultiCutReplayPostgresqlStatementExecutionResult,
} from "../multiCutReplayPostgresqlAdapterPort";
import type {
  MultiCutReplayPostgresqlMutationClassification,
  MultiCutReplayPostgresqlOperationKind,
  MultiCutReplayPostgresqlStatementAccessMode,
  MultiCutReplayPostgresqlStatementId,
} from "../multiCutReplayPostgresqlStatementCatalog/types";

export type MultiCutReplayPostgresqlExecutionDriverTransactionScope =
  | "none"
  | "read-consistent"
  | "required"
  | "workflow-completion";

export type MultiCutReplayPostgresqlExecutionDriverCancellationBoundary =
  Readonly<{
    cancellationVersion: "1.0";
    requested: boolean;
    propagated: boolean;
  }>;

export type MultiCutReplayPostgresqlExecutionDriverConnectionBoundary =
  Readonly<{
    connectionVersion: "1.0";
    acquisition: "executor-boundary";
    release: "executor-boundary";
    transactionOwnership:
      | "none"
      | "executor-boundary"
      | "workflow-completion-boundary";
  }>;

export type MultiCutReplayPostgresqlExecutionDriverContext = Readonly<{
  contextVersion: "1.0";
  operationIdentifier: MultiCutReplayPostgresqlOperationKind;
  statementIdentifier: MultiCutReplayPostgresqlStatementId;
  transactionScope:
    MultiCutReplayPostgresqlExecutionDriverTransactionScope;
  accessMode: MultiCutReplayPostgresqlStatementAccessMode;
  mutationKind: MultiCutReplayPostgresqlMutationClassification;
  cancellation:
    MultiCutReplayPostgresqlExecutionDriverCancellationBoundary;
  connection: MultiCutReplayPostgresqlExecutionDriverConnectionBoundary;
  executionMetadata: Readonly<Record<string, unknown>>;
}>;

export type MultiCutReplayPostgresqlExecutionDriverRequest = Readonly<{
  requestVersion: "1.0";
  statementRequest: MultiCutReplayPostgresqlStatementExecutionRequest;
  executionContext: MultiCutReplayPostgresqlExecutionDriverContext;
}>;

export type MultiCutReplayPostgresqlExecutionDriverResult =
  MultiCutReplayPostgresqlStatementExecutionResult;

export type MultiCutReplayPostgresqlExecutionDriverExecutor = Readonly<{
  execute(
    request: MultiCutReplayPostgresqlExecutionDriverRequest,
  ): Promise<MultiCutReplayPostgresqlExecutionDriverResult>;
}>;

export type MultiCutReplayPostgresqlExecutionDriverMetadata = Readonly<{
  driverVersion: "1.0";
  requestBoundary: "passthrough";
  resultBoundary: "passthrough";
  commitBoundary: "executor-owned";
  rollbackBoundary: "executor-owned";
  commitUnknownBoundary: "passthrough";
  cancellationBoundary: "context-only";
  connectionLifetimeBoundary: "executor-owned";
}>;

export type MultiCutReplayPostgresqlExecutionDriverDependencies =
  Readonly<{
    executor: MultiCutReplayPostgresqlExecutionDriverExecutor;
  }>;

export type MultiCutReplayPostgresqlExecutionDriver = Readonly<{
  metadata: MultiCutReplayPostgresqlExecutionDriverMetadata;
  execute(
    request: MultiCutReplayPostgresqlExecutionDriverRequest,
  ): Promise<MultiCutReplayPostgresqlExecutionDriverResult>;
}>;
