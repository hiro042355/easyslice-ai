import type {
  PostgreSQLCommitResultV2,
  PostgreSQLQueryConnectionDisposition,
  PostgreSQLRollbackResultV2,
} from "../productionWorkflowRuntime/postgresqlDriver";

export type WorkflowCompletionTransactionCleanupActionV1 =
  | "rollback-then-release"
  | "rollback-then-discard-on-failure"
  | "discard"
  | "release"
  | "no-action";

export type WorkflowCompletionTransactionCleanupDecisionInputV1 =
  | Readonly<{
      inputVersion: "1.0";
      phase: "query-failure";
      queryConnectionDisposition: PostgreSQLQueryConnectionDisposition;
    }>
  | Readonly<{
      inputVersion: "1.0";
      phase: "commit-result";
      result: PostgreSQLCommitResultV2;
    }>
  | Readonly<{
      inputVersion: "1.0";
      phase: "rollback-result";
      result: PostgreSQLRollbackResultV2;
    }>;

export type WorkflowCompletionTransactionCleanupDecisionV1 = Readonly<{
  decisionVersion: "1.0";
  phase: WorkflowCompletionTransactionCleanupDecisionInputV1["phase"];
  action: WorkflowCompletionTransactionCleanupActionV1;
  connectionDisposition: PostgreSQLQueryConnectionDisposition;
  reconciliationRequired: boolean;
  decisionOwnsExecution: false;
  retryPermitted: false;
  recoveryExecuted: false;
}>;
