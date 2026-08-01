import type { PostgreSQLConnectionReuse, PostgreSQLConstraintClass, PostgreSQLDriverIssueCode, PostgreSQLExecutionFailure, PostgreSQLSafeDiagnostic, PostgreSQLTransactionState } from "./types";

type ErrorShape = Readonly<{ code?: unknown; constraint?: unknown }>;
export type PostgreSQLTimeoutMechanismContext = Readonly<{
  statementTimeoutAuthority: boolean;
}>;
const hasErrorShape = (value: unknown): value is ErrorShape => typeof value === "object" && value !== null;

const constraintClasses: Readonly<Record<string, PostgreSQLConstraintClass>> = Object.freeze({
  workflow_final_results_result_identity_uq: "identity-conflict",
  workflow_result_references_token_identity_uq: "identity-conflict",
  workflow_result_references_result_kind_uq: "identity-conflict",
  workflow_outbox_events_identity_uq: "identity-conflict",
  workflow_result_references_result_fk: "foreign-reference-conflict",
  workflow_outbox_events_result_fk: "foreign-reference-conflict",
});

export function classifyPostgreSQLConstraint(name: unknown, code: string): PostgreSQLConstraintClass {
  if (typeof name === "string" && constraintClasses[name]) return constraintClasses[name];
  if (code === "23514") return "shape-constraint-failed";
  if (code === "42P01" || code === "42703") return "schema-contract-mismatch";
  return "unknown-constraint";
}

export function classifyPostgreSQLIssue(
  code: unknown,
  timeoutContext?: PostgreSQLTimeoutMechanismContext,
): PostgreSQLDriverIssueCode {
  if (typeof code !== "string") return "unknown-failure";
  if (code === "23505" || code === "23503" || code === "23514") return "constraint-conflict";
  if (code === "40001" || code === "40P01") return "retryable-conflict";
  if (code.startsWith("08") || code === "57P01" || code === "57P02" || code === "57P03") return "connection-unavailable";
  if (code === "57014") {
    return timeoutContext?.statementTimeoutAuthority === true
      ? "timeout"
      : "query-cancelled";
  }
  if (code === "25006") return "read-only";
  if (code === "42501") return "insufficient-privilege";
  if (code === "42P01" || code === "42703") return "schema-mismatch";
  return "unknown-failure";
}

export function classifyConnectionReuse(issue: PostgreSQLDriverIssueCode, transactionState?: PostgreSQLTransactionState): PostgreSQLConnectionReuse {
  if (issue === "connection-unavailable" || transactionState === "unknown") return "must-discard";
  if (transactionState === "failed" || issue === "timeout" || issue === "retryable-conflict") return "must-rollback-before-reuse";
  if (issue === "query-cancelled") return transactionState ? "must-rollback-before-reuse" : "safe-to-reuse";
  if (transactionState === "active" || transactionState === "committing") return "unknown";
  return "safe-to-reuse";
}

export function mapPostgreSQLError(
  error: unknown,
  diagnostic: Omit<PostgreSQLSafeDiagnostic, "issue" | "retryable" | "sqlStateClass">,
  timeoutContext?: PostgreSQLTimeoutMechanismContext,
): PostgreSQLExecutionFailure {
  const code = hasErrorShape(error) && typeof error.code === "string" ? error.code : undefined;
  const issue = classifyPostgreSQLIssue(code, timeoutContext);
  const safe: PostgreSQLSafeDiagnostic = {
    ...diagnostic,
    issue,
    retryable: issue === "retryable-conflict",
    ...(diagnostic.stage === "query"
      ? {
          queryConnectionDisposition: classifyConnectionReuse(
            issue,
            diagnostic.transactionState === "active"
              ? "failed"
              : diagnostic.transactionState,
          ),
        }
      : {}),
    ...(code && ["08", "23", "25", "40", "42", "57"].includes(code.slice(0, 2))
      ? { sqlStateClass: code.slice(0, 2) as "08" | "23" | "25" | "40" | "42" | "57" }
      : {}),
  };
  return {
    status: "failure",
    issue,
    ...(issue === "constraint-conflict" || issue === "schema-mismatch"
      ? { constraintClass: classifyPostgreSQLConstraint(hasErrorShape(error) ? error.constraint : undefined, code ?? "") }
      : {}),
    diagnostic: Object.freeze(safe),
  };
}
