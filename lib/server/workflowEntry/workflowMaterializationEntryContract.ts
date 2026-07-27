import type {
  WorkflowMaterializationEntryInput,
  WorkflowMaterializationEntryResult,
} from "./workflowMaterializationEntryContractTypes";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isWorkflowMaterializationEntryInput = (
  value: unknown,
): value is WorkflowMaterializationEntryInput =>
  isRecord(value) &&
  value.workflowMaterializationEntryInputVersion === "1.0" &&
  isRecord(value.authorityLocatorBindingInput) &&
  isRecord(value.materializationRequest) &&
  isRecord(value.materializationExecutionContext);

export const isWorkflowMaterializationEntryResult = (
  value: unknown,
): value is WorkflowMaterializationEntryResult =>
  isRecord(value) &&
  value.workflowMaterializationEntryResultVersion === "1.0" &&
  isRecord(value.authorityLocatorBindingResult) &&
  (
    value.handoffResult === undefined ||
    isRecord(value.handoffResult)
  ) &&
  (
    value.materializationRuntimeBindingResult === undefined ||
    isRecord(value.materializationRuntimeBindingResult)
  );
