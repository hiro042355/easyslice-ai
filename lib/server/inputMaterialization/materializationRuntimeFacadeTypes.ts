import type {
  MaterializationRuntimeProviderCapability,
} from "./materializationRuntimeProviderCapability";
import type {
  MaterializationRuntimeProviderInput,
  MaterializationRuntimeProviderInputValidationCapability,
  MaterializationRuntimeProviderInputValidationResult,
} from "./materializationRuntimeProviderTypes";
import type {
  InputMaterializationDecision,
} from "./types";

export type MaterializationRuntimeFacadeInput = Readonly<{
  facadeInputVersion: "1.0";
  providerInput: MaterializationRuntimeProviderInput;
}>;

export type MaterializationRuntimeFacadeFailure =
  | "invalid-facade-input"
  | "unsupported-facade-version"
  | "missing-provider-input"
  | "missing-validation-capability"
  | "missing-provider-capability"
  | "validation-rejected"
  | "validation-exception"
  | "provider-decision"
  | "provider-exception"
  | "internal-failure";

export type MaterializationRuntimeFacadeFailureStage =
  | "input"
  | "validation"
  | "provider"
  | "internal";

export type MaterializationRuntimeFacadeResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "completed";
    providerDecision: InputMaterializationDecision;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "rejected" | "failed";
    stage: MaterializationRuntimeFacadeFailureStage;
    failure: MaterializationRuntimeFacadeFailure;
    validationResult?: MaterializationRuntimeProviderInputValidationResult;
    providerDecision?: InputMaterializationDecision;
  }>;

export type MaterializationRuntimeFacadeDependencies = Readonly<{
  validation: MaterializationRuntimeProviderInputValidationCapability;
  provider: MaterializationRuntimeProviderCapability;
}>;

export type MaterializationRuntimeFacade = Readonly<{
  invoke(input: unknown): Promise<MaterializationRuntimeFacadeResult>;
}>;
