import {
  createMaterializationRuntimeFacade,
} from "./materializationRuntimeFacade";
import type {
  MaterializationRuntimeComposition,
  MaterializationRuntimeCompositionDependencies,
} from "./materializationRuntimeCompositionTypes";

export const createMaterializationRuntimeComposition = (
  dependencies: MaterializationRuntimeCompositionDependencies,
): MaterializationRuntimeComposition => {
  const provider = dependencies.providerComposition.provider;
  const validation = dependencies.validation;

  return Object.freeze({
    facade: createMaterializationRuntimeFacade({
      provider,
      validation,
    }),
    provider,
    validation,
  });
};
