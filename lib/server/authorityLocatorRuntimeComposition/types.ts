import type {
  AuthorityRuntimeFacade,
} from "../authorityRuntimeFacade/authorityRuntimeFacadeTypes";
import type {
  LocatorRuntimeFacade,
} from "../locatorRuntimeFacade/locatorRuntimeFacadeTypes";
import type {
  PrincipalAwareAuthorityRuntimeProviderInputValidationCapability,
} from "../sourceArtifactAuthority/principalAwareRuntimeProviderTypes";
import type {
  ProductionAuthorityPolicyCapability,
  ProductionAuthorityProviderComposition,
} from "../sourceArtifactAuthority/productionAuthorityProviderTypes";
import type {
  SourceArtifactLocatorV2RuntimeProviderInputValidationCapability,
} from "../sourceArtifactLocator/locatorV2RuntimeProviderTypes";
import type {
  ProductionLocatorProviderComposition,
  ProductionLocatorStrategyCapability,
} from "../sourceArtifactLocator/productionLocatorProviderTypes";

export type AuthorityLocatorRuntimeCompositionDependencies = Readonly<{
  authority: Readonly<{
    policy: ProductionAuthorityPolicyCapability;
    validation: PrincipalAwareAuthorityRuntimeProviderInputValidationCapability;
  }>;
  locator: Readonly<{
    strategy: ProductionLocatorStrategyCapability;
    validation: SourceArtifactLocatorV2RuntimeProviderInputValidationCapability;
  }>;
}>;

export type AuthorityLocatorRuntimeComposition = Readonly<{
  authority: Readonly<{
    facade: AuthorityRuntimeFacade;
    providerComposition: ProductionAuthorityProviderComposition;
  }>;
  locator: Readonly<{
    facade: LocatorRuntimeFacade;
    providerComposition: ProductionLocatorProviderComposition;
  }>;
}>;
