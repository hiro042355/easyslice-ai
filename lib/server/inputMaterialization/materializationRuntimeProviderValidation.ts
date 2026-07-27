import type {
  MaterializationRuntimeProviderInput,
  MaterializationRuntimeProviderInputFailure,
  MaterializationRuntimeProviderInputValidationCapability,
  MaterializationRuntimeProviderInputValidationResult,
} from "./materializationRuntimeProviderTypes";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const immutableCopy = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => immutableCopy(item))) as T;
  }
  if (isRecord(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, immutableCopy(item)]),
    )) as T;
  }
  return value;
};

export const copyMaterializationRuntimeProviderInput = (
  input: MaterializationRuntimeProviderInput,
): MaterializationRuntimeProviderInput => immutableCopy(input);

const rejected = (
  failure: MaterializationRuntimeProviderInputFailure,
): MaterializationRuntimeProviderInputValidationResult => Object.freeze({
  resultVersion: "1.0",
  status: "rejected",
  failure,
});

export const createMaterializationRuntimeProviderInputValidation =
  (): MaterializationRuntimeProviderInputValidationCapability => Object.freeze({
    validateProviderInput(
      input: unknown,
    ): MaterializationRuntimeProviderInputValidationResult {
      try {
        if (!isRecord(input)) return rejected("invalid-provider-input");
        if (input.providerInputVersion !== "1.0") {
          return rejected("unsupported-provider-version");
        }
        if (input.handoffResult === undefined || input.handoffResult === null) {
          return rejected("missing-handoff");
        }
        if (!isRecord(input.handoffResult)) {
          return rejected("invalid-provider-input");
        }
        if (
          input.handoffResult.resultVersion !== "1.0" ||
          input.handoffResult.status !== "ready"
        ) return rejected("handoff-not-completed");
        if (
          input.handoffResult.workflowMaterializationRequest === undefined ||
          input.handoffResult.workflowMaterializationRequest === null
        ) return rejected("missing-materialization-request");
        if (
          input.handoffResult.executionContext === undefined ||
          input.handoffResult.executionContext === null
        ) return rejected("missing-execution-context");
        if (
          !isRecord(input.handoffResult.workflowMaterializationRequest) ||
          !isRecord(input.handoffResult.executionContext)
        ) return rejected("invalid-provider-input");

        return Object.freeze({
          resultVersion: "1.0",
          status: "valid",
          input: copyMaterializationRuntimeProviderInput(
            input as unknown as MaterializationRuntimeProviderInput,
          ),
        });
      } catch {
        return rejected("internal-failure");
      }
    },
  });
