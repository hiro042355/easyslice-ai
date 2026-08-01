import { createWorkflowCompletionTransitionCandidate } from "../workflowCompletionState";
import type { PostgreSQLParameter } from "../productionWorkflowRuntime/postgresqlDriver/types";
import { WORKFLOW_COMPLETION_STATE_SQL_V1, createWorkflowCompletionPersistenceInput } from "./contractV1";
import type { WorkflowCompletionStatePostgresqlExecutorInputV1, WorkflowCompletionStatePostgresqlExecutorResultV1 } from "./types";

export const executeWorkflowCompletionStateTransition = async (
  input: WorkflowCompletionStatePostgresqlExecutorInputV1,
): Promise<WorkflowCompletionStatePostgresqlExecutorResultV1> => {
  const projected = createWorkflowCompletionPersistenceInput(input.transitionRequest);
  if (projected.status === "invalid") return Object.freeze({ resultVersion: "1.0", status: "internal-invariant-violation", expectedRowCount: 1, actualRowCount: 0, ownerAction: "rollback-required" });
  const b = projected.input.bindings;
  const values: readonly PostgreSQLParameter[] = Object.freeze([
    { kind: "string", value: b.workflow_identity_version },
    { kind: "string", value: b.workflow_identity_namespace },
    { kind: "string", value: b.workflow_identity_value },
    { kind: "string", value: b.target_state },
    { kind: "string", value: b.logical_attempt_identity_version },
    { kind: "string", value: b.logical_attempt_identity_namespace },
    { kind: "string", value: b.logical_attempt_identity_value },
    { kind: "string", value: b.expected_state },
    { kind: "utc-timestamp", value: b.completion_timestamp },
    { kind: "string", value: b.result_reference_identity },
    { kind: "string", value: b.result_reference_version },
    { kind: "bigint", value: b.expected_revision },
  ]);
  const queryResult = await input.query.executeQuery(Object.freeze({
    statementId: WORKFLOW_COMPLETION_STATE_SQL_V1.statementId,
    text: WORKFLOW_COMPLETION_STATE_SQL_V1.text,
    values,
    expectedResult: "many",
  }));
  if (queryResult.status === "execution-failure") return Object.freeze({
    resultVersion: "1.0", status: "execution-failure", issue: queryResult.classification,
    safeReason: queryResult.safeReason,
    ...(queryResult.sqlStateClass === undefined ? {} : { sqlStateClass: queryResult.sqlStateClass }),
    ...(queryResult.queryConnectionDisposition === undefined ? {} : { queryConnectionDisposition: queryResult.queryConnectionDisposition }),
    ownerAction: "rollback-required",
  });
  if (queryResult.command !== "UPDATE") return Object.freeze({ resultVersion: "1.0", status: "internal-invariant-violation", expectedRowCount: 1, actualRowCount: queryResult.rowCount, ownerAction: "rollback-required" });
  if (queryResult.rowCount === 0) return Object.freeze({ resultVersion: "1.0", status: "not-applied", rowCount: 0, command: "UPDATE", cause: "unresolved", ownerAction: "rollback-required", commitAllowed: false, authoritativeLookupRequired: true });
  if (queryResult.rowCount !== 1) return Object.freeze({ resultVersion: "1.0", status: "internal-invariant-violation", expectedRowCount: 1, actualRowCount: queryResult.rowCount, ownerAction: "rollback-required" });
  const row = queryResult.rows[0];
  if (!row || row.state !== "completed" || row.revision !== "1") return Object.freeze({ resultVersion: "1.0", status: "internal-invariant-violation", expectedRowCount: 1, actualRowCount: queryResult.rowCount, ownerAction: "rollback-required" });
  return Object.freeze({ resultVersion: "1.0", status: "transitioned", rowCount: 1, command: "UPDATE", transition: createWorkflowCompletionTransitionCandidate(input.transitionRequest) });
};
