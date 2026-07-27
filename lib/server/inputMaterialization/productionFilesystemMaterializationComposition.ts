import {
  createFilesystemMaterializationStrategyAdapter,
} from "./filesystemMaterializationStrategyAdapter";
import {
  createMaterializationRuntimeComposition,
} from "./materializationRuntimeComposition";
import type {
  MaterializationRuntimeComposition,
} from "./materializationRuntimeCompositionTypes";
import {
  createMaterializationRuntimeProviderInputValidation,
} from "./materializationRuntimeProviderValidation";
import {
  createProductionMaterializationProviderComposition,
} from "./productionMaterializationProviderComposition";
import {
  ReferenceFilesystemInputMaterializationAdapter,
} from "./referenceFilesystemInputMaterializationAdapter";
import type {
  InputMaterializationDependencies,
} from "./referenceFilesystemInputMaterializationAdapter";

export const createProductionFilesystemMaterializationComposition = (
  dependencies: InputMaterializationDependencies,
): MaterializationRuntimeComposition => {
  const filesystemAdapter =
    new ReferenceFilesystemInputMaterializationAdapter(dependencies);
  const strategy = createFilesystemMaterializationStrategyAdapter({
    filesystemAdapter,
  });
  const providerComposition =
    createProductionMaterializationProviderComposition(strategy);

  return createMaterializationRuntimeComposition({
    providerComposition,
    validation: createMaterializationRuntimeProviderInputValidation(),
  });
};
