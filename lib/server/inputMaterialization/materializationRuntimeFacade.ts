import type {
  MaterializationRuntimeProviderInputValidationResult,
} from "./materializationRuntimeProviderTypes";
import {
  copyMaterializationRuntimeProviderInput,
} from "./materializationRuntimeProviderValidation";
import type {
  MaterializationRuntimeFacade,
  MaterializationRuntimeFacadeDependencies,
  MaterializationRuntimeFacadeFailure,
  MaterializationRuntimeFacadeFailureStage,
  MaterializationRuntimeFacadeInput,
  MaterializationRuntimeFacadeResult,
} from "./materializationRuntimeFacadeTypes";
import type {
  InputMaterializationDecision,
} from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const copyDecision = (
  decision: InputMaterializationDecision,
): InputMaterializationDecision => Object.freeze({
  ...decision,
  ...(decision.materializedArtifact
    ? {
      materializedArtifact: Object.freeze({
        ...decision.materializedArtifact,
      }),
    }
    : {}),
  audit: Object.freeze({
    ...decision.audit,
    entries: Object.freeze(
      decision.audit.entries.map((entry) => Object.freeze({ ...entry })),
    ),
  }),
});

const copyValidationResult = (
  result: MaterializationRuntimeProviderInputValidationResult,
): MaterializationRuntimeProviderInputValidationResult =>
  result.status === "valid"
    ? Object.freeze({
      ...result,
      input: copyMaterializationRuntimeProviderInput(result.input),
    })
    : Object.freeze({ ...result });

const failure = (
  status: "rejected" | "failed",
  stage: MaterializationRuntimeFacadeFailureStage,
  reason: MaterializationRuntimeFacadeFailure,
  details: Readonly<{
    validationResult?: MaterializationRuntimeProviderInputValidationResult;
    providerDecision?: InputMaterializationDecision;
  }> = {},
): MaterializationRuntimeFacadeResult => Object.freeze({
  resultVersion: "1.0",
  status,
  stage,
  failure: reason,
  ...details,
});

export const createMaterializationRuntimeFacade = (
  dependencies: MaterializationRuntimeFacadeDependencies,
): MaterializationRuntimeFacade => Object.freeze({
  async invoke(input: unknown): Promise<MaterializationRuntimeFacadeResult> {
    if (!isRecord(input)) {
      return failure("rejected", "input", "invalid-facade-input");
    }
    if (input.facadeInputVersion !== "1.0") {
      return failure("rejected", "input", "unsupported-facade-version");
    }
    if (input.providerInput === undefined || input.providerInput === null) {
      return failure("rejected", "input", "missing-provider-input");
    }
    if (typeof dependencies?.validation?.validateProviderInput !== "function") {
      return failure("rejected", "internal", "missing-validation-capability");
    }
    if (typeof dependencies?.provider?.materialize !== "function") {
      return failure("rejected", "internal", "missing-provider-capability");
    }

    const facadeInput = input as unknown as MaterializationRuntimeFacadeInput;
    let validationResult: MaterializationRuntimeProviderInputValidationResult;
    try {
      validationResult = dependencies.validation.validateProviderInput(
        facadeInput.providerInput,
      );
    } catch {
      return failure("failed", "validation", "validation-exception");
    }
    const copiedValidationResult = copyValidationResult(validationResult);
    if (validationResult.status === "rejected") {
      return failure("rejected", "validation", "validation-rejected", {
        validationResult: copiedValidationResult,
      });
    }

    let providerDecision: InputMaterializationDecision;
    try {
      providerDecision = await dependencies.provider.materialize(
        copyMaterializationRuntimeProviderInput(validationResult.input),
      );
    } catch {
      return failure("failed", "provider", "provider-exception", {
        validationResult: copiedValidationResult,
      });
    }
    const copiedDecision = copyDecision(providerDecision);
    if (providerDecision.classification !== "materialized") {
      return failure("failed", "provider", "provider-decision", {
        validationResult: copiedValidationResult,
        providerDecision: copiedDecision,
      });
    }

    return Object.freeze({
      resultVersion: "1.0",
      status: "completed",
      providerDecision: copiedDecision,
    });
  },
});
