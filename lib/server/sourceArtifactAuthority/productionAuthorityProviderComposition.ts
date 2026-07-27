import {
  createProductionAuthorityProvider,
} from "./productionAuthorityProvider";
import type {
  ProductionAuthorityProviderComposition,
  ProductionAuthorityProviderCompositionDependencies,
} from "./productionAuthorityProviderTypes";

export const createProductionAuthorityProviderComposition = (
  dependencies: ProductionAuthorityProviderCompositionDependencies,
): ProductionAuthorityProviderComposition => Object.freeze({
  provider: createProductionAuthorityProvider({
    policy: dependencies.policy,
  }),
  validation: dependencies.validation,
});
