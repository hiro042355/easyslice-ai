import {
  WORKFLOW_COMPLETION_ATOMIC_MUTATION_PLAN,
  WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP,
} from "../workflowCompletionAtomicRecovery";
import { validateMultiCutReplayCompleteProcessingParameterInput } from "../multiCutReplayPersistenceParameters";
import type {
  MultiCutReplayCompleteParticipationOwnershipV2,
  MultiCutReplayCompleteParticipationRequestFactoryInputV2,
  MultiCutReplayCompleteParticipationRequestValidationResultV2,
} from "./typesV2";

const copyAuthoritativeIdentity = (
  identity: MultiCutReplayCompleteParticipationRequestFactoryInputV2["authoritativeReplayIdentity"],
) => Object.freeze({
  identityVersion: "2.0" as const,
  protectedScope: Object.freeze({
    scopeVersion: "1.0" as const,
    replayNamespace: identity.protectedScope.replayNamespace,
    tenant: Object.freeze({
      identityVersion: "1.0" as const,
      protectedTenantIdentity:
        identity.protectedScope.tenant.protectedTenantIdentity,
    }),
    operationIdentity: identity.protectedScope.operationIdentity,
  }),
  resolvedIdentity: Object.freeze({
    identityVersion: "1.0" as const,
    keyIdentity: identity.resolvedIdentity.keyIdentity,
    requestFingerprintIdentity:
      identity.resolvedIdentity.requestFingerprintIdentity,
  }),
});

const hasValidIdentityShape = (
  identity: MultiCutReplayCompleteParticipationRequestFactoryInputV2["authoritativeReplayIdentity"],
): boolean =>
  identity.identityVersion === "2.0" &&
  identity.protectedScope.scopeVersion === "1.0" &&
  typeof identity.protectedScope.replayNamespace === "string" &&
  identity.protectedScope.tenant.identityVersion === "1.0" &&
  typeof identity.protectedScope.tenant.protectedTenantIdentity === "string" &&
  typeof identity.protectedScope.operationIdentity === "string" &&
  identity.resolvedIdentity.identityVersion === "1.0" &&
  typeof identity.resolvedIdentity.keyIdentity === "string" &&
  typeof identity.resolvedIdentity.requestFingerprintIdentity === "string";

const isIdentityConsistent = (
  input: MultiCutReplayCompleteParticipationRequestFactoryInputV2,
): boolean => {
  const identity = input.authoritativeReplayIdentity;
  const binding = input.parameterInput.bindings.replay_identity;
  return (
    identity.identityVersion === binding.identity_version &&
    identity.protectedScope.scopeVersion === binding.scope_version &&
    identity.protectedScope.replayNamespace === binding.replay_namespace &&
    identity.protectedScope.tenant.identityVersion ===
      binding.tenant_identity_version &&
    identity.protectedScope.tenant.protectedTenantIdentity ===
      binding.protected_tenant_identity &&
    identity.protectedScope.operationIdentity === binding.operation_identity &&
    identity.resolvedIdentity.keyIdentity === binding.key_identity
  );
};

const invalidRequest = (
  reason: Extract<
    MultiCutReplayCompleteParticipationRequestValidationResultV2,
    { status: "invalid" }
  >["reason"],
): MultiCutReplayCompleteParticipationRequestValidationResultV2 =>
  Object.freeze({ resultVersion: "2.0", status: "invalid", reason });

export const createMultiCutReplayCompleteParticipationRequestV2 = (
  input: MultiCutReplayCompleteParticipationRequestFactoryInputV2,
): MultiCutReplayCompleteParticipationRequestValidationResultV2 => {
  if (!hasValidIdentityShape(input.authoritativeReplayIdentity)) {
    return invalidRequest("invalid-authoritative-identity");
  }
  const parameterValidation =
    validateMultiCutReplayCompleteProcessingParameterInput(input.parameterInput);
  if (parameterValidation.status === "invalid") {
    return invalidRequest("invalid-parameter-input");
  }
  if (!isIdentityConsistent(input)) return invalidRequest("identity-mismatch");
  return Object.freeze({
    resultVersion: "2.0",
    status: "valid",
    request: Object.freeze({
      schemaVersion: "2.0",
      contractVersion: "2.0",
      statementId: "complete-processing-replay",
      operationIdentity: "complete-replay-participation",
      sameSessionRequirement: "workflow-completion-transaction-session",
      transactionOwner: "workflow-completion-transaction-owner",
      authoritativeReplayIdentity: copyAuthoritativeIdentity(
        input.authoritativeReplayIdentity,
      ),
      parameterInput: parameterValidation.value,
    }),
  });
};

export const MULTI_CUT_REPLAY_COMPLETE_PARTICIPATION_OWNERSHIP_V2:
  MultiCutReplayCompleteParticipationOwnershipV2 = Object.freeze({
  schemaVersion: "2.0",
  contractVersion: "2.0",
  statementScope: Object.freeze(["complete-processing-replay"] as const),
  operationIdentity: "complete-replay-participation",
  transactionOwner: WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP.commitOwner,
  sameSessionRequirement: "workflow-completion-transaction-session",
  participantOwnsTransaction: false,
  participantOwnsConnection: false,
  participantOwnsRetry:
    WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP.participantRetryPermitted,
  participantOwnsCommitUnknown:
    WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP.participantOwnsCommitUnknown,
  zeroRowRequiresOwnerRollback:
    WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP.zeroRowRequiresRollbackBeforeLookup,
  cardinalityRequiresOwnerRollback:
    WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP.cardinalityRequiresRollbackBeforeLookup,
  durableOnlyAfterOwnerCommit:
    WORKFLOW_COMPLETION_ATOMIC_MUTATION_PLAN.durableOnlyAfterOwnerCommit,
});
