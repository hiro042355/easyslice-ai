import type {
  MaterializationRuntimeFacade,
} from "./materializationRuntimeFacadeTypes";
import type {
  MaterializationRuntimeProviderCapability,
} from "./materializationRuntimeProviderCapability";
import type {
  MaterializationRuntimeProviderInputValidationCapability,
} from "./materializationRuntimeProviderTypes";
import type {
  ProductionMaterializationProviderComposition,
} from "./productionMaterializationProviderTypes";

export type MaterializationRuntimeCompositionDependencies = Readonly<{
  providerComposition: ProductionMaterializationProviderComposition;
  validation: MaterializationRuntimeProviderInputValidationCapability;
}>;

export type MaterializationRuntimeComposition = Readonly<{
  facade: MaterializationRuntimeFacade;
  provider: MaterializationRuntimeProviderCapability;
  validation: MaterializationRuntimeProviderInputValidationCapability;
}>;
