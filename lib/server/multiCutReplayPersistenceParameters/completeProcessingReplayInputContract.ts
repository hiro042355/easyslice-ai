import { MULTI_CUT_REPLAY_COMPLETE_PROCESSING_INPUT_BINDINGS_V2 } from "./contractV2";
import type {
  MultiCutReplayCompleteProcessingBindingsV2,
  MultiCutReplayCompleteProcessingParameterInputV1,
  MultiCutReplayCompleteProcessingParameterInputValidationResult,
  MultiCutReplayCompleteProcessingParameterValues,
  MultiCutReplayCompleteProcessingOwnershipBindingV2,
  MultiCutReplayCompleteProcessingReplayIdentityBindingV2,
} from "./completeProcessingReplayInputTypes";

const replayIdentityKeys = Object.freeze([
  "physical_schema_version",
  "logical_schema_version",
  "identity_version",
  "scope_version",
  "replay_namespace",
  "tenant_identity_version",
  "protected_tenant_identity",
  "operation_identity",
  "key_identity",
] as const);

const ownershipKeys = Object.freeze([
  "reservation_identity",
  "lease_identity",
  "reservation_attempt",
] as const);

const envelopeKeys = Object.freeze([
  "schemaVersion",
  "contractVersion",
  "statementId",
  "bindingInventoryVersion",
  "parameterContractVersion",
  "bindings",
] as const);

const canonicalDecimal = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/;
const canonicalUtcTimestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

type UnknownObject = { readonly [key: string]: unknown };

const isRecord = (value: unknown): value is UnknownObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: UnknownObject,
  expected: readonly string[],
): boolean => {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => key in value);
};

const isReplayIdentityBinding = (
  value: unknown,
): value is MultiCutReplayCompleteProcessingReplayIdentityBindingV2 =>
  isRecord(value) &&
  hasExactKeys(value, replayIdentityKeys) &&
  value.physical_schema_version === "2.0" &&
  value.logical_schema_version === "2.0" &&
  value.identity_version === "2.0" &&
  value.scope_version === "1.0" &&
  typeof value.replay_namespace === "string" &&
  value.tenant_identity_version === "1.0" &&
  typeof value.protected_tenant_identity === "string" &&
  typeof value.operation_identity === "string" &&
  typeof value.key_identity === "string";

const isOwnershipBinding = (
  value: unknown,
): value is MultiCutReplayCompleteProcessingOwnershipBindingV2 =>
  isRecord(value) &&
  hasExactKeys(value, ownershipKeys) &&
  typeof value.reservation_identity === "string" &&
  typeof value.lease_identity === "string" &&
  typeof value.reservation_attempt === "number" &&
  Number.isSafeInteger(value.reservation_attempt) &&
  value.reservation_attempt >= 1;

const isBindings = (
  value: unknown,
): value is MultiCutReplayCompleteProcessingBindingsV2 =>
  isRecord(value) &&
  hasExactKeys(value, MULTI_CUT_REPLAY_COMPLETE_PROCESSING_INPUT_BINDINGS_V2) &&
  isReplayIdentityBinding(value.replay_identity) &&
  typeof value.expected_revision === "string" &&
  canonicalDecimal.test(value.expected_revision) &&
  isOwnershipBinding(value.expected_ownership_evidence) &&
  typeof value.expected_fence === "string" &&
  canonicalDecimal.test(value.expected_fence) &&
  value.result_reference_version === "1.0" &&
  typeof value.result_reference_identity === "string" &&
  value.terminal_metadata_version === "1.0" &&
  typeof value.terminal_at === "string" &&
  canonicalUtcTimestamp.test(value.terminal_at) &&
  value.terminal_classification === "workflow-completed";

const copyBindings = (
  bindings: MultiCutReplayCompleteProcessingBindingsV2,
): MultiCutReplayCompleteProcessingBindingsV2 =>
  Object.freeze({
    replay_identity: Object.freeze({ ...bindings.replay_identity }),
    expected_revision: bindings.expected_revision,
    expected_ownership_evidence: Object.freeze({
      ...bindings.expected_ownership_evidence,
    }),
    expected_fence: bindings.expected_fence,
    result_reference_version: bindings.result_reference_version,
    result_reference_identity: bindings.result_reference_identity,
    terminal_metadata_version: bindings.terminal_metadata_version,
    terminal_at: bindings.terminal_at,
    terminal_classification: bindings.terminal_classification,
  });

const invalid = (
  reason: Extract<
    MultiCutReplayCompleteProcessingParameterInputValidationResult,
    { status: "invalid" }
  >["reason"],
): MultiCutReplayCompleteProcessingParameterInputValidationResult =>
  Object.freeze({ resultVersion: "1.0", status: "invalid", reason });

export const validateMultiCutReplayCompleteProcessingParameterInput = (
  input: unknown,
): MultiCutReplayCompleteProcessingParameterInputValidationResult => {
  if (!isRecord(input)) return invalid("invalid-input");
  if (!hasExactKeys(input, envelopeKeys)) return invalid("invalid-input");
  if (input.schemaVersion !== "1.0" || input.contractVersion !== "1.0") {
    return invalid("unsupported-version");
  }
  if (input.statementId !== "complete-processing-replay") {
    return invalid("invalid-statement");
  }
  if (
    input.bindingInventoryVersion !== "2.0" ||
    input.parameterContractVersion !== "2.0"
  ) {
    return invalid("invalid-binding-inventory");
  }
  if (!isBindings(input.bindings)) return invalid("invalid-binding-value");
  const value: MultiCutReplayCompleteProcessingParameterInputV1 = Object.freeze({
    schemaVersion: "1.0",
    contractVersion: "1.0",
    statementId: "complete-processing-replay",
    bindingInventoryVersion: "2.0",
    parameterContractVersion: "2.0",
    bindings: copyBindings(input.bindings),
  });
  return Object.freeze({ resultVersion: "1.0", status: "valid", value });
};

export const createCompleteProcessingReplayParameterValues = (
  input: MultiCutReplayCompleteProcessingParameterInputV1,
): MultiCutReplayCompleteProcessingParameterValues => {
  const validation = validateMultiCutReplayCompleteProcessingParameterInput(input);
  if (validation.status === "invalid") {
    throw new Error(`invalid-complete-processing-parameter-input:${validation.reason}`);
  }
  return Object.freeze({
    inputVersion: "1.0",
    statementId: "complete-processing-replay",
    bindings: validation.value.bindings,
  });
};
