import {
  createProductionLocatorProvider,
} from "./productionLocatorProvider";
import type {
  ProductionLocatorProviderComposition,
  ProductionLocatorProviderCompositionDependencies,
} from "./productionLocatorProviderTypes";

export const createProductionLocatorProviderComposition = (
  dependencies: ProductionLocatorProviderCompositionDependencies,
): ProductionLocatorProviderComposition => Object.freeze({
  provider: createProductionLocatorProvider({
    strategy: dependencies.strategy,
  }),
  validation: dependencies.validation,
});
