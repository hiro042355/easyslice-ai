import { isCanonicalWorkflowUtcTimestamp } from "../productionWorkflowRuntime/productionWorkflowRuntimeUtils";
import type { WorkflowProtectedIdentity } from "../productionWorkflowRuntime/types";
import { classifyWorkflowCompletionAttemptRelation } from "../workflowCompletionAtomicRecovery";
import type {
  WorkflowCompletionAtomicComponentConsistencyV1,
  WorkflowCompletionAtomicRecoveryEvidenceProjectionV1,
  WorkflowCompletionAuthoritativeObservationV1,
  WorkflowCompletionLifecycleContractV1,
  WorkflowCompletionObservationClassificationV1,
  WorkflowCompletionRevisionV1,
  WorkflowCompletionTransactionParticipationV1,
  WorkflowCompletionTransitionRequestFactoryInputV1,
  WorkflowCompletionTransitionRequestV1,
  WorkflowCompletionTransitionRequestValidationResultV1,
  WorkflowCompletionTransitionResultV1,
} from "./types";

const MAX_REVISION = BigInt("9223372036854775807");

export const WORKFLOW_COMPLETION_LIFECYCLE_CONTRACT_V1:
  WorkflowCompletionLifecycleContractV1 = Object.freeze({
    schemaVersion: "1.0",
    contractVersion: "1.0",
    owner: "workflow-completion-state",
    eligibleState: "eligible-for-completion",
    completedState: "completed",
    completedTerminal: true,
    completedAbsorbing: true,
    transitionAllowedAfterCompletion: false,
    attemptComparison: "equality-only",
    attemptOrderingAuthority: "none",
    revisionAuthority: "workflow-completion-state",
  });

export const WORKFLOW_COMPLETION_TRANSACTION_PARTICIPATION_V1:
  WorkflowCompletionTransactionParticipationV1 = Object.freeze({
    contractVersion: "1.0",
    transactionOwnership: "workflow-owner",
    ownsStandaloneTransaction: false,
    successBeforeCommit: "pending-owner-commit",
    commitUnknownOwner: "workflow-owner",
  });

const validIdentity = (value: WorkflowProtectedIdentity): boolean =>
  value.identityVersion === "1.0" &&
  value.namespace.length > 0 &&
  value.protectedValue.length > 0;

const copyIdentity = (value: WorkflowProtectedIdentity): WorkflowProtectedIdentity =>
  Object.freeze({
    identityVersion: "1.0",
    namespace: value.namespace,
    protectedValue: value.protectedValue,
  });

const copyReference = (value: WorkflowCompletionTransitionRequestFactoryInputV1["resultReference"]) =>
  Object.freeze({
    referenceVersion: "1.0" as const,
    resultReferenceIdentity: value.resultReferenceIdentity,
  });

export const validateWorkflowCompletionRevision = (
  value: string,
): value is WorkflowCompletionRevisionV1 => {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) return false;
  return BigInt(value) <= MAX_REVISION;
};

export const createWorkflowCompletionTransitionRequest = (
  input: WorkflowCompletionTransitionRequestFactoryInputV1,
): WorkflowCompletionTransitionRequestValidationResultV1 => {
  if (!validIdentity(input.workflowIdentity)) return Object.freeze({ status: "invalid", reason: "invalid-workflow-identity" });
  if (!validIdentity(input.logicalAttemptIdentity)) return Object.freeze({ status: "invalid", reason: "invalid-attempt-identity" });
  if (input.expectedRevision !== "0") return Object.freeze({ status: "invalid", reason: "invalid-expected-revision" });
  if (!isCanonicalWorkflowUtcTimestamp(input.completionTimestamp)) return Object.freeze({ status: "invalid", reason: "invalid-completion-timestamp" });
  if (input.resultReference.referenceVersion !== "1.0" || input.resultReference.resultReferenceIdentity.length === 0) {
    return Object.freeze({ status: "invalid", reason: "invalid-result-reference" });
  }
  return Object.freeze({
    status: "valid",
    request: Object.freeze({
      schemaVersion: "1.0",
      contractVersion: "1.0",
      workflowIdentity: copyIdentity(input.workflowIdentity),
      expectedState: "eligible-for-completion",
      targetState: "completed",
      logicalAttemptIdentity: copyIdentity(input.logicalAttemptIdentity),
      expectedRevision: "0",
      completionTimestamp: input.completionTimestamp,
      resultReference: copyReference(input.resultReference),
    }),
  });
};

export const createWorkflowCompletionTransitionCandidate = (
  request: WorkflowCompletionTransitionRequestV1,
): Extract<WorkflowCompletionTransitionResultV1, { status: "transitioned" }> =>
  Object.freeze({
    resultVersion: "1.0",
    status: "transitioned",
    workflowIdentity: copyIdentity(request.workflowIdentity),
    previousState: "eligible-for-completion",
    currentState: "completed",
    logicalAttemptIdentity: copyIdentity(request.logicalAttemptIdentity),
    previousRevision: request.expectedRevision,
    currentRevision: "1",
    completionTimestamp: request.completionTimestamp,
    resultReference: copyReference(request.resultReference),
    durability: "pending-owner-commit",
    ownsStandaloneTransaction: false,
    ownerAction: "continue-transaction",
  });

export const createWorkflowCompletionNotAppliedResult = (): Extract<WorkflowCompletionTransitionResultV1, { status: "not-applied" }> =>
  Object.freeze({
    resultVersion: "1.0",
    status: "not-applied",
    cause: "unresolved",
    ownerAction: "rollback-required",
    commitAllowed: false,
    authoritativeLookupRequired: true,
    retryAttempted: false,
  });

const result = <T extends WorkflowCompletionObservationClassificationV1>(value: T): T => Object.freeze(value);

export const classifyWorkflowCompletionObservation = (
  request: WorkflowCompletionTransitionRequestV1,
  observation: WorkflowCompletionAuthoritativeObservationV1,
  atomicComponents: WorkflowCompletionAtomicComponentConsistencyV1,
): WorkflowCompletionObservationClassificationV1 => {
  if (observation.status === "missing") return result({ resultVersion: "1.0", status: "missing-workflow", retryPermitted: false, mutationRepeatPermitted: false, manualInterventionRequired: true });
  if (observation.status === "multiple") return result({ resultVersion: "1.0", status: "inconsistent-observation", retryPermitted: false, mutationRepeatPermitted: false, manualInterventionRequired: true });
  if (
    observation.invariantStatus === "inconsistent" ||
    observation.evidenceCompleteness === "incomplete" ||
    atomicComponents.status === "inconsistent" ||
    !validateWorkflowCompletionRevision(observation.revision) ||
    observation.workflowIdentity.identityVersion !== request.workflowIdentity.identityVersion ||
    observation.workflowIdentity.namespace !== request.workflowIdentity.namespace ||
    observation.workflowIdentity.protectedValue !== request.workflowIdentity.protectedValue
  ) return result({ resultVersion: "1.0", status: "inconsistent-observation", retryPermitted: false, mutationRepeatPermitted: false, manualInterventionRequired: true });

  if (observation.state === "eligible-for-completion") {
    if (observation.revision !== request.expectedRevision) return result({ resultVersion: "1.0", status: "stale-evidence", retryPermitted: false, mutationRepeatPermitted: false, manualInterventionRequired: false });
    return result({ resultVersion: "1.0", status: "inconsistent-observation", retryPermitted: false, mutationRepeatPermitted: false, manualInterventionRequired: true });
  }

  if (!observation.logicalAttemptIdentity || !observation.resultReference || !observation.completionTimestamp || observation.revision !== "1") {
    return result({ resultVersion: "1.0", status: "inconsistent-observation", retryPermitted: false, mutationRepeatPermitted: false, manualInterventionRequired: true });
  }
  const relation = classifyWorkflowCompletionAttemptRelation({
    requestAttempt: request.logicalAttemptIdentity,
    observedAttempt: observation.logicalAttemptIdentity,
  });
  if (relation.relation !== "same-attempt") {
    if (relation.relation === "different-attempt") return result({ resultVersion: "1.0", status: "competing-attempt", retryPermitted: false, mutationRepeatPermitted: false, manualInterventionRequired: true });
    return result({ resultVersion: "1.0", status: "inconsistent-observation", retryPermitted: false, mutationRepeatPermitted: false, manualInterventionRequired: true });
  }
  if (
    observation.resultReference.referenceVersion !== request.resultReference.referenceVersion ||
    observation.resultReference.resultReferenceIdentity !== request.resultReference.resultReferenceIdentity
  ) return result({ resultVersion: "1.0", status: "reference-conflict", retryPermitted: false, mutationRepeatPermitted: false, manualInterventionRequired: true });
  if (observation.completionTimestamp !== request.completionTimestamp) {
    return result({ resultVersion: "1.0", status: "inconsistent-observation", retryPermitted: false, mutationRepeatPermitted: false, manualInterventionRequired: true });
  }
  return result({ resultVersion: "1.0", status: "idempotent-completion", durableSuccessCandidate: true, retryPermitted: false, mutationRepeatPermitted: false, manualInterventionRequired: false });
};

export const projectWorkflowCompletionEvidenceForAtomicRecovery = (
  classification: WorkflowCompletionObservationClassificationV1,
): WorkflowCompletionAtomicRecoveryEvidenceProjectionV1 => {
  let projected: WorkflowCompletionAtomicRecoveryEvidenceProjectionV1["classification"];
  switch (classification.status) {
    case "idempotent-completion": projected = "reconciled-success-candidate"; break;
    case "competing-attempt": projected = "competing-attempt"; break;
    case "missing-workflow": projected = "definite-not-committed-candidate"; break;
    case "reference-conflict":
    case "inconsistent-observation": projected = "inconsistent-observation"; break;
    case "stale-evidence": projected = "stale-evidence"; break;
  }
  return Object.freeze({
    projectionVersion: "1.0",
    classification: projected,
    finalCommitUnknownDecisionOwnedBy: "workflow-completion-transaction-owner",
  });
};
