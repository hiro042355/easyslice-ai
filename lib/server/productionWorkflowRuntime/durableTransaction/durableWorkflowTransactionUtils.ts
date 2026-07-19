import type {
  DurableWorkflowDatabaseScalar,
  DurableWorkflowTransactionOperationResult,
  DurableWorkflowTransactionOptions,
} from "./types";

const MAX_TIMEOUT_MS = 2_147_483_647;

export function isValidTimeout(value: number | undefined): boolean {
  return value === undefined || (Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMEOUT_MS);
}

export function validateDurableWorkflowTransactionOptions(options: DurableWorkflowTransactionOptions): boolean {
  return (options.isolation === "read-committed" || options.isolation === "serializable")
    && (options.accessMode === "read-write" || options.accessMode === "read-only")
    && Number.isSafeInteger(options.deadlineMonotonicMilliseconds)
    && options.deadlineMonotonicMilliseconds >= 0
    && isValidTimeout(options.statementTimeoutMs)
    && isValidTimeout(options.lockTimeoutMs)
    && isValidTimeout(options.idleTransactionTimeoutMs);
}

export function isSafeStatementId(value: string): boolean {
  return /^[a-z][a-z0-9.-]{0,127}$/.test(value);
}

export function copyDatabaseScalar(value: DurableWorkflowDatabaseScalar): DurableWorkflowDatabaseScalar {
  return value instanceof Uint8Array ? Uint8Array.from(value) : value;
}

export function durableTransactionSuccess<T>(value: T): DurableWorkflowTransactionOperationResult<T> {
  return Object.freeze({ status: "success", value });
}

export function durableTransactionFailure<T = never>(failure: Exclude<DurableWorkflowTransactionOperationResult<T>, { status: "success" }>["failure"]): DurableWorkflowTransactionOperationResult<T> {
  return Object.freeze({ status: "failure", failure });
}
