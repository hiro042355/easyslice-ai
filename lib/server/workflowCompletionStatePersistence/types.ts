import type { PostgreSQLDriverIssueCode, PostgreSQLQueryConnectionDisposition } from "../productionWorkflowRuntime/postgresqlDriver/types";
import type { DurableWorkflowSameSessionQueryCapability } from "../productionWorkflowRuntime/durableTransaction/sameSessionQueryTypes";
import type { WorkflowCompletionTransitionRequestV1 } from "../workflowCompletionState";

export type WorkflowCompletionStatePersistenceVersionV1 = "1.0";
export const WORKFLOW_COMPLETION_BINDING_KEYS_V1 = Object.freeze([
  "workflow_identity_version", "workflow_identity_namespace", "workflow_identity_value",
  "expected_state", "target_state", "logical_attempt_identity_version",
  "logical_attempt_identity_namespace", "logical_attempt_identity_value",
  "expected_revision", "completion_timestamp", "result_reference_identity",
  "result_reference_version",
] as const);
export type WorkflowCompletionBindingKeyV1 = (typeof WORKFLOW_COMPLETION_BINDING_KEYS_V1)[number];
export type WorkflowCompletionPersistenceInputV1 = Readonly<{
  inputVersion: "1.0";
  bindings: Readonly<Record<WorkflowCompletionBindingKeyV1, string>>;
}>;
export type WorkflowCompletionParameterFactoryResultV1 =
  | Readonly<{ status: "valid"; input: WorkflowCompletionPersistenceInputV1 }>
  | Readonly<{ status: "invalid"; reason: "invalid-transition-request" }>;

export type WorkflowCompletionStatePostgresqlExecutorInputV1 = Readonly<{
  inputVersion: "1.0";
  query: DurableWorkflowSameSessionQueryCapability;
  transitionRequest: WorkflowCompletionTransitionRequestV1;
}>;

export type WorkflowCompletionStatePostgresqlExecutorResultV1 =
  | Readonly<{ resultVersion: "1.0"; status: "transitioned"; rowCount: 1; command: "UPDATE"; transition: ReturnType<typeof import("../workflowCompletionState").createWorkflowCompletionTransitionCandidate> }>
  | Readonly<{ resultVersion: "1.0"; status: "not-applied"; rowCount: 0; command: "UPDATE"; cause: "unresolved"; ownerAction: "rollback-required"; commitAllowed: false; authoritativeLookupRequired: true }>
  | Readonly<{ resultVersion: "1.0"; status: "internal-invariant-violation"; expectedRowCount: 1; actualRowCount: number; ownerAction: "rollback-required" }>
  | Readonly<{ resultVersion: "1.0"; status: "execution-failure"; issue: PostgreSQLDriverIssueCode; safeReason: string; sqlStateClass?: "08" | "23" | "25" | "40" | "42" | "57"; queryConnectionDisposition?: PostgreSQLQueryConnectionDisposition; ownerAction: "rollback-required" }>;
