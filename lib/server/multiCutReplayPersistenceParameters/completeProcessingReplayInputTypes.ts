import type { MULTI_CUT_REPLAY_COMPLETE_PROCESSING_INPUT_BINDINGS_V2 } from "./contractV2";

export type MultiCutReplayCompleteProcessingBindingIdV2 =
  (typeof MULTI_CUT_REPLAY_COMPLETE_PROCESSING_INPUT_BINDINGS_V2)[number];

export type MultiCutReplayCompleteProcessingReplayIdentityBindingV2 = Readonly<{
  physical_schema_version: "2.0";
  logical_schema_version: "2.0";
  identity_version: "2.0";
  scope_version: "1.0";
  replay_namespace: string;
  tenant_identity_version: "1.0";
  protected_tenant_identity: string;
  operation_identity: string;
  key_identity: string;
}>;

export type MultiCutReplayCompleteProcessingOwnershipBindingV2 = Readonly<{
  reservation_identity: string;
  lease_identity: string;
  reservation_attempt: number;
}>;

export type MultiCutReplayCompleteProcessingBindingValueByIdV2 = Readonly<{
  replay_identity: MultiCutReplayCompleteProcessingReplayIdentityBindingV2;
  expected_revision: string;
  expected_ownership_evidence: MultiCutReplayCompleteProcessingOwnershipBindingV2;
  expected_fence: string;
  result_reference_version: "1.0";
  result_reference_identity: string;
  terminal_metadata_version: "1.0";
  terminal_at: string;
  terminal_classification: "workflow-completed";
}>;

export type MultiCutReplayCompleteProcessingBindingsV2 = Readonly<{
  [BindingId in MultiCutReplayCompleteProcessingBindingIdV2]:
    MultiCutReplayCompleteProcessingBindingValueByIdV2[BindingId];
}>;

export type MultiCutReplayCompleteProcessingParameterInputV1 = Readonly<{
  schemaVersion: "1.0";
  contractVersion: "1.0";
  statementId: "complete-processing-replay";
  bindingInventoryVersion: "2.0";
  parameterContractVersion: "2.0";
  bindings: MultiCutReplayCompleteProcessingBindingsV2;
}>;

export type MultiCutReplayCompleteProcessingParameterInputValidationResult =
  | Readonly<{
      resultVersion: "1.0";
      status: "valid";
      value: MultiCutReplayCompleteProcessingParameterInputV1;
    }>
  | Readonly<{
      resultVersion: "1.0";
      status: "invalid";
      reason:
        | "invalid-input"
        | "unsupported-version"
        | "invalid-statement"
        | "invalid-binding-inventory"
        | "invalid-binding-value";
    }>;

export type MultiCutReplayCompleteProcessingParameterValues =
  Readonly<{
    inputVersion: "1.0";
    statementId: "complete-processing-replay";
    bindings: MultiCutReplayCompleteProcessingBindingsV2;
  }>;
