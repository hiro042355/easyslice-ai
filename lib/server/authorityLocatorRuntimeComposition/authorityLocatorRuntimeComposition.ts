import {
  createAuthorityRuntimeFacade,
} from "../authorityRuntimeFacade/authorityRuntimeFacade";
import {
  createLocatorRuntimeFacade,
} from "../locatorRuntimeFacade/locatorRuntimeFacade";
import {
  createProductionAuthorityProviderComposition,
} from "../sourceArtifactAuthority/productionAuthorityProviderComposition";
import {
  createProductionLocatorProviderComposition,
} from "../sourceArtifactLocator/productionLocatorProviderComposition";
import type {
  AuthorityLocatorRuntimeComposition,
  AuthorityLocatorRuntimeCompositionDependencies,
} from "./types";

export const createAuthorityLocatorRuntimeComposition = (
  dependencies: AuthorityLocatorRuntimeCompositionDependencies,
): AuthorityLocatorRuntimeComposition => {
  const authorityProviderComposition =
    createProductionAuthorityProviderComposition({
      policy: dependencies.authority.policy,
      validation: dependencies.authority.validation,
    });
  const locatorProviderComposition = createProductionLocatorProviderComposition({
    strategy: dependencies.locator.strategy,
    validation: dependencies.locator.validation,
  });

  return Object.freeze({
    authority: Object.freeze({
      facade: createAuthorityRuntimeFacade(authorityProviderComposition),
      providerComposition: authorityProviderComposition,
    }),
    locator: Object.freeze({
      facade: createLocatorRuntimeFacade(locatorProviderComposition),
      providerComposition: locatorProviderComposition,
    }),
  });
};
