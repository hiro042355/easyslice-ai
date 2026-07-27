import type {
  InputMaterializationDecision,
} from "../inputMaterialization/types";
import {
  createDeterministicMaterializationRuntimeCompositionFixture,
} from "../inputMaterialization/referenceDeterministicMaterializationRuntimeComposition";
import type {
  DeterministicMaterializationRuntimeCompositionFixture,
} from "../inputMaterialization/referenceDeterministicMaterializationRuntimeComposition";
import {
  createLocatorMaterializationRuntimeBinding,
} from "./locatorMaterializationRuntimeBinding";
import type {
  LocatorMaterializationRuntimeBindingCapability,
} from "./types";

export type DeterministicLocatorMaterializationRuntimeBindingFixture =
  Readonly<{
    binding: LocatorMaterializationRuntimeBindingCapability;
    runtimeCompositionFixture:
      DeterministicMaterializationRuntimeCompositionFixture;
  }>;

export const createDeterministicLocatorMaterializationRuntimeBindingFixture = (
  decision: InputMaterializationDecision,
): DeterministicLocatorMaterializationRuntimeBindingFixture => Object.freeze({
  binding: createLocatorMaterializationRuntimeBinding(),
  runtimeCompositionFixture:
    createDeterministicMaterializationRuntimeCompositionFixture(decision),
});
