import {
  createProductionMaterializationProvider,
} from "./productionMaterializationProvider";
import type {
  ProductionMaterializationProviderComposition,
  ProductionMaterializationStrategyCapability,
} from "./productionMaterializationProviderTypes";

export const createProductionMaterializationProviderComposition = (
  strategy: ProductionMaterializationStrategyCapability,
): ProductionMaterializationProviderComposition => Object.freeze({
  strategy,
  provider: createProductionMaterializationProvider({ strategy }),
});
