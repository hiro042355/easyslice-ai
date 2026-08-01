import { createWorkflowCompletionTransitionRequest } from "../workflowCompletionState";
import type { WorkflowCompletionTransitionRequestV1 } from "../workflowCompletionState";
import { WORKFLOW_COMPLETION_BINDING_KEYS_V1 } from "./types";
import type { WorkflowCompletionParameterFactoryResultV1, WorkflowCompletionPersistenceInputV1 } from "./types";

export const WORKFLOW_COMPLETION_STATE_SQL_V1 = Object.freeze({
  definitionVersion: "1.0" as const,
  statementId: "workflow-completion-state.complete-v1" as const,
  command: "UPDATE" as const,
  text: `UPDATE workflow.workflow_completion_states
SET state = $4::text,
    logical_attempt_identity_version = $5::text,
    logical_attempt_identity_namespace = $6::text,
    logical_attempt_identity_value = $7::text,
    completion_timestamp = $9::timestamptz,
    result_reference_identity = $10::text,
    result_reference_version = $11::text,
    revision = revision + 1,
    updated_at = transaction_timestamp()
WHERE workflow_identity_version = $1::text
  AND workflow_identity_namespace = $2::text
  AND workflow_identity_value = $3::text
  AND state = $8::text
  AND revision = $12::bigint
  AND revision < 9223372036854775807
RETURNING workflow_identity_version, workflow_identity_namespace, workflow_identity_value,
  state, revision::text AS revision, logical_attempt_identity_version,
  logical_attempt_identity_namespace, logical_attempt_identity_value,
  completion_timestamp, result_reference_identity, result_reference_version`,
  bindingKeys: WORKFLOW_COMPLETION_BINDING_KEYS_V1,
});

export const createWorkflowCompletionPersistenceInput = (
  request: WorkflowCompletionTransitionRequestV1,
): WorkflowCompletionParameterFactoryResultV1 => {
  const validation = createWorkflowCompletionTransitionRequest(request);
  if (validation.status === "invalid") return Object.freeze({ status: "invalid", reason: "invalid-transition-request" });
  const value = validation.request;
  const bindings: WorkflowCompletionPersistenceInputV1["bindings"] = Object.freeze({
    workflow_identity_version: value.workflowIdentity.identityVersion,
    workflow_identity_namespace: value.workflowIdentity.namespace,
    workflow_identity_value: value.workflowIdentity.protectedValue,
    expected_state: value.expectedState,
    target_state: value.targetState,
    logical_attempt_identity_version: value.logicalAttemptIdentity.identityVersion,
    logical_attempt_identity_namespace: value.logicalAttemptIdentity.namespace,
    logical_attempt_identity_value: value.logicalAttemptIdentity.protectedValue,
    expected_revision: value.expectedRevision,
    completion_timestamp: value.completionTimestamp,
    result_reference_identity: value.resultReference.resultReferenceIdentity,
    result_reference_version: value.resultReference.referenceVersion,
  });
  return Object.freeze({ status: "valid", input: Object.freeze({ inputVersion: "1.0", bindings }) });
};

export const hasExactWorkflowCompletionBindings = (value: unknown): value is WorkflowCompletionPersistenceInputV1["bindings"] => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [...WORKFLOW_COMPLETION_BINDING_KEYS_V1].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]) && keys.every((key) => typeof record[key] === "string");
};
