import type { WorkflowProtectedIdentity } from "../productionWorkflowRuntime/types";
import type {
  WorkflowCompletionAttemptRelationInput,
  WorkflowCompletionAttemptRelationResult,
  WorkflowCompletionAttemptSemantics,
} from "./types";

export const WORKFLOW_COMPLETION_ATTEMPT_SEMANTICS:
  WorkflowCompletionAttemptSemantics = Object.freeze({
    contractVersion: "1.0",
    identityAuthority: "logical-attempt-identity",
    comparisonAuthority: "equality-only",
    orderingAuthority: "none",
    differentAttemptClassification: "competing-attempt",
    automaticRetryForDifferentAttempt: false,
    orderingInferencePermitted: false,
  });

const isConsistentAttemptIdentity = (
  identity: WorkflowProtectedIdentity,
): boolean =>
  identity.identityVersion === "1.0" &&
  typeof identity.namespace === "string" &&
  identity.namespace.length > 0 &&
  typeof identity.protectedValue === "string" &&
  identity.protectedValue.length > 0;

export const classifyWorkflowCompletionAttemptRelation = (
  input: WorkflowCompletionAttemptRelationInput,
): WorkflowCompletionAttemptRelationResult => {
  const request = input.requestAttempt;
  const observed = input.observedAttempt;
  if (request === undefined || observed === undefined) {
    return Object.freeze({
      resultVersion: "1.0",
      relation: "missing-attempt-evidence",
    });
  }
  if (
    !isConsistentAttemptIdentity(request) ||
    !isConsistentAttemptIdentity(observed)
  ) {
    return Object.freeze({
      resultVersion: "1.0",
      relation: "inconsistent-attempt-evidence",
    });
  }
  const same =
    request.identityVersion === observed.identityVersion &&
    request.namespace === observed.namespace &&
    request.protectedValue === observed.protectedValue;
  return Object.freeze({
    resultVersion: "1.0",
    relation: same ? "same-attempt" : "different-attempt",
  });
};
