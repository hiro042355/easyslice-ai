import { MULTI_CUT_REPLAY_COMPLETE_PROCESSING_INPUT_BINDINGS_V2 } from "./contractV2";
import { validateMultiCutReplayCompleteProcessingParameterInput } from "./completeProcessingReplayInputContract";
import type { MultiCutReplayCompleteProcessingParameterInputV1 } from "./completeProcessingReplayInputTypes";
import type {
  MultiCutReplayCompleteParameterAuthorityMappingV1,
  MultiCutReplayCompleteParameterInputFactoryInputV1,
  MultiCutReplayCompleteParameterInputFactoryResultV1,
} from "./completeProcessingReplayInputFactoryTypes";

const mappingFor = (
  bindingId: (typeof MULTI_CUT_REPLAY_COMPLETE_PROCESSING_INPUT_BINDINGS_V2)[number],
): MultiCutReplayCompleteParameterAuthorityMappingV1 => {
  const common = Object.freeze({
    bindingId,
    nullability: "required" as const,
    transformation: "forbidden" as const,
    validatorAuthority: "typed-complete-parameter-input-validator" as const,
  });
  switch (bindingId) {
    case "replay_identity": return Object.freeze({ ...common, factoryInputField: "completion.replayIdentity", authority: "multi-cut-replay-authoritative-identity", valueType: "authoritative-replay-identity" });
    case "expected_revision": return Object.freeze({ ...common, factoryInputField: "completion.reservationEvidence.expectedRevision.expectedRevision", authority: "reservation-evidence", valueType: "canonical-decimal-string" });
    case "expected_ownership_evidence": return Object.freeze({ ...common, factoryInputField: "completion.reservationEvidence", authority: "reservation-evidence", valueType: "ownership-evidence" });
    case "expected_fence": return Object.freeze({ ...common, factoryInputField: "completion.reservationEvidence.fencing.fencingToken", authority: "reservation-evidence", valueType: "canonical-decimal-string" });
    case "result_reference_version": return Object.freeze({ ...common, factoryInputField: "completion.resultReference.referenceVersion", authority: "result-reference-contract", valueType: "fixed-literal" });
    case "result_reference_identity": return Object.freeze({ ...common, factoryInputField: "completion.resultReference.resultReferenceIdentity", authority: "result-reference-contract", valueType: "opaque-text" });
    case "terminal_metadata_version": return Object.freeze({ ...common, factoryInputField: "completion.metadata.metadataVersion", authority: "lifecycle-v4-completion-metadata", valueType: "fixed-literal" });
    case "terminal_at": return Object.freeze({ ...common, factoryInputField: "completion.metadata.completedAt", authority: "lifecycle-v4-completion-metadata", valueType: "canonical-utc-timestamp" });
    case "terminal_classification": return Object.freeze({ ...common, factoryInputField: "completion.metadata.completionClassification", authority: "lifecycle-v4-completion-metadata", valueType: "fixed-literal" });
  }
  const unreachable: never = bindingId;
  return unreachable;
};

export const MULTI_CUT_REPLAY_COMPLETE_PARAMETER_AUTHORITY_MAPPING_V1 =
  Object.freeze(
    MULTI_CUT_REPLAY_COMPLETE_PROCESSING_INPUT_BINDINGS_V2.map(mappingFor),
  );

export const createMultiCutReplayCompleteProcessingParameterInput = (
  input: MultiCutReplayCompleteParameterInputFactoryInputV1,
): MultiCutReplayCompleteParameterInputFactoryResultV1 => {
  const completion = input.completion;
  const versions = input.versionAuthority;
  const candidate: MultiCutReplayCompleteProcessingParameterInputV1 = {
    schemaVersion: versions.schemaVersion,
    contractVersion: versions.contractVersion,
    statementId: "complete-processing-replay",
    bindingInventoryVersion: versions.bindingInventoryVersion,
    parameterContractVersion: versions.parameterContractVersion,
    bindings: {
      replay_identity: {
        physical_schema_version: versions.physicalSchemaVersion,
        logical_schema_version: versions.logicalSchemaVersion,
        identity_version: completion.replayIdentity.identityVersion,
        scope_version: completion.replayIdentity.protectedScope.scopeVersion,
        replay_namespace: completion.replayIdentity.protectedScope.replayNamespace,
        tenant_identity_version: completion.replayIdentity.protectedScope.tenant.identityVersion,
        protected_tenant_identity: completion.replayIdentity.protectedScope.tenant.protectedTenantIdentity,
        operation_identity: completion.replayIdentity.protectedScope.operationIdentity,
        key_identity: completion.replayIdentity.resolvedIdentity.keyIdentity,
      },
      expected_revision: completion.reservationEvidence.expectedRevision.expectedRevision,
      expected_ownership_evidence: {
        reservation_identity: completion.reservationEvidence.reservation.reservationIdentity,
        lease_identity: completion.reservationEvidence.lease.leaseIdentity,
        reservation_attempt: completion.reservationEvidence.reservationAttempt,
      },
      expected_fence: completion.reservationEvidence.fencing.fencingToken,
      result_reference_version: completion.resultReference.referenceVersion,
      result_reference_identity: completion.resultReference.resultReferenceIdentity,
      terminal_metadata_version: completion.metadata.metadataVersion,
      terminal_at: completion.metadata.completedAt,
      terminal_classification: completion.metadata.completionClassification,
    },
  };
  const validation = validateMultiCutReplayCompleteProcessingParameterInput(candidate);
  if (validation.status === "invalid") {
    return Object.freeze({
      resultVersion: "1.0",
      status: "invalid",
      reason: "typed-input-validation-failure",
      validationReason: validation.reason,
    });
  }
  return Object.freeze({ resultVersion: "1.0", status: "created", value: validation.value });
};
