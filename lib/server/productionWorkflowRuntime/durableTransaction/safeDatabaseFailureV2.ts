import type { PostgreSQLQueryExecutionFailure } from "../postgresqlDriver/types";
import type {
  DurableWorkflowDatabaseCardinalityConflictV2,
  DurableWorkflowDatabaseNotFoundV2,
  DurableWorkflowDatabaseSafeExecutionFailureV2,
  DurableWorkflowTransactionFailureCode,
} from "./types";
import type {
  DurableWorkflowGeneralSameSessionQueryCardinalityConflictV1,
  DurableWorkflowGeneralSameSessionQueryExecutionFailureV1,
  DurableWorkflowGeneralSameSessionQueryNotFoundV1,
} from "./sameSessionQueryTypes";

export type DurableWorkflowDatabaseSafeFailureProjectionInputV2 = Readonly<{
  source: PostgreSQLQueryExecutionFailure;
  failure: DurableWorkflowTransactionFailureCode;
}>;

export function projectDurableWorkflowDatabaseSafeFailureV2(
  input: DurableWorkflowDatabaseSafeFailureProjectionInputV2,
): DurableWorkflowDatabaseSafeExecutionFailureV2 {
  const source = input.source;
  return Object.freeze({
    resultVersion: "2.0",
    status: "failure",
    kind: "execution-failure",
    failure: input.failure,
    retryable: source.diagnostic.retryable,
    issue: source.issue,
    safeReason: source.safeReason,
    ...(source.diagnostic.sqlStateClass === undefined
      ? {}
      : { sqlStateClass: source.diagnostic.sqlStateClass }),
    ...(source.diagnostic.queryConnectionDisposition === undefined
      ? {}
      : {
          queryConnectionDisposition:
            source.diagnostic.queryConnectionDisposition,
        }),
  });
}

export function isDurableWorkflowDatabaseSafeExecutionFailureV2(
  value: unknown,
): value is DurableWorkflowDatabaseSafeExecutionFailureV2 {
  if (typeof value !== "object" || value === null) return false;
  const safeReason = Reflect.get(value, "safeReason");
  return Reflect.get(value, "resultVersion") === "2.0"
    && Reflect.get(value, "status") === "failure"
    && Reflect.get(value, "kind") === "execution-failure"
    && typeof Reflect.get(value, "failure") === "string"
    && typeof Reflect.get(value, "retryable") === "boolean"
    && typeof Reflect.get(value, "issue") === "string"
    && typeof safeReason === "string"
    && safeReason.length > 0;
}

export function projectDurableWorkflowGeneralQueryFailureV2(
  source: DurableWorkflowGeneralSameSessionQueryExecutionFailureV1,
  failure: DurableWorkflowTransactionFailureCode,
): DurableWorkflowDatabaseSafeExecutionFailureV2 {
  return Object.freeze({
    resultVersion: "2.0",
    status: "failure",
    kind: "execution-failure",
    failure,
    retryable: source.retryable,
    issue: source.classification,
    safeReason: source.safeReason,
    ...(source.sqlStateClass === undefined ? {} : { sqlStateClass: source.sqlStateClass }),
    ...(source.queryConnectionDisposition === undefined
      ? {}
      : { queryConnectionDisposition: source.queryConnectionDisposition }),
  });
}

export function projectDurableWorkflowDatabaseNotFoundV2(
  source: DurableWorkflowGeneralSameSessionQueryNotFoundV1,
): DurableWorkflowDatabaseNotFoundV2 {
  return Object.freeze({
    status: source.status,
    expectedResult: source.expectedResult,
    actualRowCount: source.actualRowCount,
    command: source.command,
  });
}

export function projectDurableWorkflowDatabaseCardinalityConflictV2(
  source: DurableWorkflowGeneralSameSessionQueryCardinalityConflictV1,
): DurableWorkflowDatabaseCardinalityConflictV2 {
  return Object.freeze({
    status: source.status,
    expectedResult: source.expectedResult,
    actualRowCount: source.actualRowCount,
    command: source.command,
  });
}
