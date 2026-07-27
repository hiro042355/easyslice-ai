import type {
  ReadyLocatorMaterializationHandoffResult,
} from "../inputMaterialization/materializationRuntimeProviderTypes";
import type {
  LocatorMaterializationHandoffResult,
} from "../locatorMaterializationHandoff/types";
import {
  copyInputMaterializationDecision,
} from "../inputMaterialization/productionMaterializationProvider";
import {
  copyMaterializationRuntimeProviderInput,
} from "../inputMaterialization/materializationRuntimeProviderValidation";
import type {
  MaterializationRuntimeFacadeResult,
} from "../inputMaterialization/materializationRuntimeFacadeTypes";
import type {
  LocatorMaterializationRuntimeBindingCapability,
  LocatorMaterializationRuntimeBindingFailure,
  LocatorMaterializationRuntimeBindingFailureStage,
  LocatorMaterializationRuntimeBindingInput,
  LocatorMaterializationRuntimeBindingResult,
} from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const copyHandoff = (
  handoffResult: ReadyLocatorMaterializationHandoffResult,
): ReadyLocatorMaterializationHandoffResult =>
  copyMaterializationRuntimeProviderInput({
    providerInputVersion: "1.0",
    handoffResult,
  }).handoffResult;

const copyFacadeResult = (
  result: MaterializationRuntimeFacadeResult,
): MaterializationRuntimeFacadeResult => {
  if (result.status === "completed") {
    return Object.freeze({
      ...result,
      providerDecision: copyInputMaterializationDecision(
        result.providerDecision,
      ),
    });
  }

  return Object.freeze({
    ...result,
    ...(result.validationResult
      ? {
        validationResult: result.validationResult.status === "valid"
          ? Object.freeze({
            ...result.validationResult,
            input: copyMaterializationRuntimeProviderInput(
              result.validationResult.input,
            ),
          })
          : Object.freeze({ ...result.validationResult }),
      }
      : {}),
    ...(result.providerDecision
      ? {
        providerDecision: copyInputMaterializationDecision(
          result.providerDecision,
        ),
      }
      : {}),
  });
};

const rejected = (
  stage: LocatorMaterializationRuntimeBindingFailureStage,
  failure: LocatorMaterializationRuntimeBindingFailure,
  handoffResult?: LocatorMaterializationHandoffResult,
): LocatorMaterializationRuntimeBindingResult => Object.freeze({
  resultVersion: "1.0",
  status: "rejected",
  stage,
  failure,
  ...(handoffResult ? { handoffResult } : {}),
});

export const createLocatorMaterializationRuntimeBinding =
  (): LocatorMaterializationRuntimeBindingCapability => Object.freeze({
    async bind(
      input: unknown,
    ): Promise<LocatorMaterializationRuntimeBindingResult> {
      if (!isRecord(input)) {
        return rejected("input", "invalid-binding-input");
      }
      if (input.bindingInputVersion !== "1.0") {
        return rejected("input", "unsupported-binding-version");
      }
      if (!isRecord(input.handoffResult)) {
        return rejected("input", "missing-handoff");
      }
      const handoffResult =
        input.handoffResult as unknown as LocatorMaterializationHandoffResult;
      if (
        handoffResult.resultVersion !== "1.0" ||
        handoffResult.status !== "ready"
      ) {
        return rejected("handoff", "handoff-not-ready");
      }
      if (!isRecord(input.runtimeComposition)) {
        return rejected("input", "missing-runtime-composition");
      }
      const bindingInput =
        input as unknown as LocatorMaterializationRuntimeBindingInput;
      if (
        typeof bindingInput.runtimeComposition.facade?.invoke !== "function"
      ) {
        return rejected(
          "input",
          "missing-runtime-facade",
          copyHandoff(handoffResult),
        );
      }

      const copiedHandoff = copyHandoff(handoffResult);
      let facadeResult: MaterializationRuntimeFacadeResult;
      try {
        facadeResult = await bindingInput.runtimeComposition.facade.invoke({
          facadeInputVersion: "1.0",
          providerInput: {
            providerInputVersion: "1.0",
            handoffResult: copiedHandoff,
          },
        });
      } catch {
        return rejected("runtime", "facade-exception", copiedHandoff);
      }

      return Object.freeze({
        resultVersion: "1.0",
        status: "completed",
        handoffResult: copiedHandoff,
        facadeResult: copyFacadeResult(facadeResult),
      });
    },
  });
