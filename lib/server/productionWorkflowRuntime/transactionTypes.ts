import type { WorkflowUtcTimestamp } from "./types";

export type WorkflowTransactionFailureCode =
  | "callback-failed"
  | "serialization-conflict"
  | "timeout"
  | "unavailable"
  | "unknown-outcome";

export type WorkflowTransactionOperationResult<T> =
  | Readonly<{ status: "success"; value: T }>
  | Readonly<{ status: "failure"; failure: WorkflowTransactionFailureCode }>;

export type WorkflowAfterCommitResult =
  | Readonly<{ status: "completed"; hooksRun: number }>
  | Readonly<{ status: "failed"; hooksRun: number; failure: "after-commit-failed" }>;

export type WorkflowTransactionExecutionResult<T> =
  | Readonly<{
      status: "committed";
      value: T;
      afterCommit: WorkflowAfterCommitResult;
    }>
  | Readonly<{
      status: "rolled-back";
      failure: WorkflowTransactionFailureCode;
    }>
  | Readonly<{
      status: "rejected";
      failure: "nested-transaction" | "manager-stopped";
    }>;

export type WorkflowTransactionContext = Readonly<{
  transactionVersion: "1.0";
  scope: "opaque-reference-transaction-scope";
  startedAt: WorkflowUtcTimestamp;
  deadlineClass: "injected-policy";
  externalIoAllowed: false;
  registerAfterCommit(hook: () => void | Promise<void>): "registered" | "context-closed";
}>;

export type WorkflowTransactionManagerDescriptor = Readonly<{
  descriptorVersion: "1.0";
  id: string;
  mode: "reference-contract-only" | "production";
  durable: boolean;
  crossInstance: boolean;
  productionReady: boolean;
  externalIoInsideTransaction: false;
}>;

export type WorkflowTransactionManager = Readonly<{
  descriptor: WorkflowTransactionManagerDescriptor;
  runInTransaction<T>(
    operation: (
      context: WorkflowTransactionContext,
    ) => Promise<WorkflowTransactionOperationResult<T>> | WorkflowTransactionOperationResult<T>,
  ): Promise<WorkflowTransactionExecutionResult<T>>;
  stop(): "stopped" | "already-stopped";
}>;

export function transactionSuccess<T>(value: T): WorkflowTransactionOperationResult<T> {
  return { status: "success", value };
}

export function transactionFailure<T = never>(
  failure: WorkflowTransactionFailureCode,
): WorkflowTransactionOperationResult<T> {
  return { status: "failure", failure };
}
