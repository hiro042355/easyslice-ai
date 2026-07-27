import type {
  LocatorMaterializationHandoffResult,
} from "../locatorMaterializationHandoff/types";

export type ReadyLocatorMaterializationHandoffResult = Extract<
  LocatorMaterializationHandoffResult,
  { status: "ready" }
>;

export type MaterializationRuntimeProviderInput = Readonly<{
  providerInputVersion: "1.0";
  handoffResult: ReadyLocatorMaterializationHandoffResult;
}>;

export type MaterializationRuntimeProviderInputFailure =
  | "unsupported-provider-version"
  | "invalid-provider-input"
  | "missing-handoff"
  | "handoff-not-completed"
  | "missing-materialization-request"
  | "missing-execution-context"
  | "internal-failure";

export type MaterializationRuntimeProviderInputValidationResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "valid";
    input: MaterializationRuntimeProviderInput;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "rejected";
    failure: MaterializationRuntimeProviderInputFailure;
  }>;

export type MaterializationRuntimeProviderInputValidationCapability =
  Readonly<{
    validateProviderInput(
      input: unknown,
    ): MaterializationRuntimeProviderInputValidationResult;
  }>;
