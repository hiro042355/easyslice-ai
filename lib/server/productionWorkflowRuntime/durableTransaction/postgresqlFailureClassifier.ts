import type { PostgreSQLDriverIssueCode } from "../postgresqlDriver/types";
import type { DurableWorkflowTransactionFailureCode } from "./types";

export type DurableWorkflowPostgresqlFailureClassifierVersionV1 = "1.0";

export type DurableWorkflowPostgresqlFailureClassificationInputV1 = Readonly<{
  classificationVersion: DurableWorkflowPostgresqlFailureClassifierVersionV1;
  issue: PostgreSQLDriverIssueCode;
  phase: "query-execution";
  statement: Readonly<{ accessMode: "read" | "write" }>;
}>;

export type DurableWorkflowPostgresqlFailureClassificationV1 = Readonly<{
  classificationVersion: DurableWorkflowPostgresqlFailureClassifierVersionV1;
  failure: DurableWorkflowTransactionFailureCode;
}>;

export const DURABLE_WORKFLOW_POSTGRESQL_FAILURE_CLASSIFICATION_V1 =
  Object.freeze({
    "invalid-request": "internal-failure",
    "query-cancelled": "transaction-aborted",
    timeout: "deadline-exceeded",
    "connection-unavailable": "unavailable",
    "schema-mismatch": "schema-mismatch",
    "constraint-conflict": "transaction-aborted",
    "retryable-conflict": "retryable-conflict",
    "read-only": "read-only-violation",
    "insufficient-privilege": "unavailable",
    "unknown-failure": "internal-failure",
    disposed: "unavailable",
  } as const satisfies Readonly<
    Record<PostgreSQLDriverIssueCode, DurableWorkflowTransactionFailureCode>
  >);

export function classifyDurableWorkflowPostgresqlFailureV1(
  input: DurableWorkflowPostgresqlFailureClassificationInputV1,
): DurableWorkflowPostgresqlFailureClassificationV1 {
  return Object.freeze({
    classificationVersion: input.classificationVersion,
    failure: DURABLE_WORKFLOW_POSTGRESQL_FAILURE_CLASSIFICATION_V1[input.issue],
  });
}
