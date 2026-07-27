import {
  createDeterministicProductionAuthorityPolicyFixture,
} from "../sourceArtifactAuthority/referenceDeterministicProductionAuthorityPolicy";
import {
  createDeterministicPrincipalAwareRuntimeProviderFixture,
} from "../sourceArtifactAuthority/referenceDeterministicPrincipalAwareRuntimeProviderFixture";
import type {
  SourceArtifactAuthorityResolutionResult,
} from "../sourceArtifactAuthority/types";
import {
  createSourceArtifactLocatorV2RuntimeProviderInputValidation,
} from "../sourceArtifactLocator/locatorV2RuntimeProviderValidation";
import {
  createDeterministicProductionLocatorFixture,
} from "../sourceArtifactLocator/referenceDeterministicProductionLocator";
import type {
  SourceArtifactLocatorV2Result,
} from "../sourceArtifactLocator/types";
import {
  createAuthorityLocatorRuntimeComposition,
} from "./authorityLocatorRuntimeComposition";
import type {
  AuthorityLocatorRuntimeComposition,
} from "./types";

export type DeterministicAuthorityLocatorRuntimeCompositionFixture = Readonly<{
  composition: AuthorityLocatorRuntimeComposition;
  authorityInvocations:
    ReturnType<typeof createDeterministicProductionAuthorityPolicyFixture>["invocations"];
  locatorInvocations:
    ReturnType<typeof createDeterministicProductionLocatorFixture>["invocations"];
}>;

export const createDeterministicAuthorityLocatorRuntimeCompositionFixture = (
  authorityResult: SourceArtifactAuthorityResolutionResult,
  locatorResult: SourceArtifactLocatorV2Result,
): DeterministicAuthorityLocatorRuntimeCompositionFixture => {
  const authority = createDeterministicProductionAuthorityPolicyFixture(
    authorityResult,
  );
  const authorityValidation =
    createDeterministicPrincipalAwareRuntimeProviderFixture(
      authorityResult,
    ).validation;
  const locator = createDeterministicProductionLocatorFixture(locatorResult);

  return Object.freeze({
    composition: createAuthorityLocatorRuntimeComposition({
      authority: Object.freeze({
        policy: authority.policy,
        validation: authorityValidation,
      }),
      locator: Object.freeze({
        strategy: locator.strategy,
        validation:
          createSourceArtifactLocatorV2RuntimeProviderInputValidation(),
      }),
    }),
    authorityInvocations: authority.invocations,
    locatorInvocations: locator.invocations,
  });
};
