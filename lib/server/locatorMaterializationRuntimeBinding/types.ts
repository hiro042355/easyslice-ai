import type {
  ReadyLocatorMaterializationHandoffResult,
} from "../inputMaterialization/materializationRuntimeProviderTypes";
import type {
  LocatorMaterializationHandoffResult,
} from "../locatorMaterializationHandoff/types";
import type {
  MaterializationRuntimeComposition,
} from "../inputMaterialization/materializationRuntimeCompositionTypes";
import type {
  MaterializationRuntimeFacadeResult,
} from "../inputMaterialization/materializationRuntimeFacadeTypes";

export type LocatorMaterializationRuntimeBindingInput = Readonly<{
  bindingInputVersion: "1.0";
  handoffResult: LocatorMaterializationHandoffResult;
  runtimeComposition: MaterializationRuntimeComposition;
}>;

export type LocatorMaterializationRuntimeBindingFailure =
  | "invalid-binding-input"
  | "unsupported-binding-version"
  | "missing-handoff"
  | "handoff-not-ready"
  | "missing-runtime-composition"
  | "missing-runtime-facade"
  | "facade-exception"
  | "internal-failure";

export type LocatorMaterializationRuntimeBindingFailureStage =
  | "input"
  | "handoff"
  | "runtime"
  | "internal";

export type LocatorMaterializationRuntimeBindingResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "completed";
    handoffResult: ReadyLocatorMaterializationHandoffResult;
    facadeResult: MaterializationRuntimeFacadeResult;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "rejected";
    stage: LocatorMaterializationRuntimeBindingFailureStage;
    failure: LocatorMaterializationRuntimeBindingFailure;
    handoffResult?: LocatorMaterializationHandoffResult;
    facadeResult?: MaterializationRuntimeFacadeResult;
  }>;

export type LocatorMaterializationRuntimeBindingCapability = Readonly<{
  bind(
    input: unknown,
  ): Promise<LocatorMaterializationRuntimeBindingResult>;
}>;
