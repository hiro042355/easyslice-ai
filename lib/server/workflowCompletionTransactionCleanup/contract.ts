import type { PostgreSQLQueryConnectionDisposition } from "../productionWorkflowRuntime/postgresqlDriver";
import type {
  WorkflowCompletionTransactionCleanupActionV1,
  WorkflowCompletionTransactionCleanupDecisionInputV1,
  WorkflowCompletionTransactionCleanupDecisionV1,
} from "./types";

const decideQueryFailure = (
  disposition: PostgreSQLQueryConnectionDisposition,
): WorkflowCompletionTransactionCleanupActionV1 => {
  switch (disposition) {
    case "safe-to-reuse":
      return "rollback-then-release";
    case "must-rollback-before-reuse":
      return "rollback-then-discard-on-failure";
    case "must-discard":
    case "unknown":
      return "discard";
  }
  const unreachable: never = disposition;
  return unreachable;
};

const decideCompletedLifecycle = (
  disposition: PostgreSQLQueryConnectionDisposition,
): WorkflowCompletionTransactionCleanupActionV1 => {
  switch (disposition) {
    case "safe-to-reuse":
      return "release";
    case "must-rollback-before-reuse":
    case "must-discard":
    case "unknown":
      return "discard";
  }
  const unreachable: never = disposition;
  return unreachable;
};

export const decideWorkflowCompletionTransactionCleanupV1 = (
  input: WorkflowCompletionTransactionCleanupDecisionInputV1,
): WorkflowCompletionTransactionCleanupDecisionV1 => {
  switch (input.phase) {
    case "query-failure":
      return Object.freeze({
        decisionVersion: "1.0",
        phase: input.phase,
        action: decideQueryFailure(input.queryConnectionDisposition),
        connectionDisposition: input.queryConnectionDisposition,
        reconciliationRequired: false,
        decisionOwnsExecution: false,
        retryPermitted: false,
        recoveryExecuted: false,
      });
    case "commit-result":
      return Object.freeze({
        decisionVersion: "1.0",
        phase: input.phase,
        action: input.result.status === "unknown-outcome"
          ? "discard"
          : decideCompletedLifecycle(input.result.connectionDisposition),
        connectionDisposition: input.result.connectionDisposition,
        reconciliationRequired: input.result.status === "unknown-outcome",
        decisionOwnsExecution: false,
        retryPermitted: false,
        recoveryExecuted: false,
      });
    case "rollback-result":
      return Object.freeze({
        decisionVersion: "1.0",
        phase: input.phase,
        action: decideCompletedLifecycle(input.result.connectionDisposition),
        connectionDisposition: input.result.connectionDisposition,
        reconciliationRequired: false,
        decisionOwnsExecution: false,
        retryPermitted: false,
        recoveryExecuted: false,
      });
  }
  const unreachable: never = input;
  return unreachable;
};
