import { createAuthorityRuntimeFacade } from "./authorityRuntimeFacade";
import type {
  AuthorityRuntimeFacade,
} from "./authorityRuntimeFacadeTypes";
import {
  createDeterministicPrincipalAwareRuntimeProviderFixture,
} from "../sourceArtifactAuthority/referenceDeterministicPrincipalAwareRuntimeProviderFixture";
import type {
  PrincipalAwareAuthorityRuntimeProviderInput,
} from "../sourceArtifactAuthority/principalAwareRuntimeProviderTypes";
import type {
  SourceArtifactAuthorityResolutionResult,
} from "../sourceArtifactAuthority/types";

export type DeterministicAuthorityRuntimeFacadeStub = Readonly<{
  facade: AuthorityRuntimeFacade;
  invocations(): readonly PrincipalAwareAuthorityRuntimeProviderInput[];
}>;

export const createDeterministicAuthorityRuntimeFacadeStub = (
  fixedResult: SourceArtifactAuthorityResolutionResult,
): DeterministicAuthorityRuntimeFacadeStub => {
  const providerFixture =
    createDeterministicPrincipalAwareRuntimeProviderFixture(fixedResult);

  return Object.freeze({
    facade: createAuthorityRuntimeFacade({
      provider: providerFixture.provider,
      validation: providerFixture.validation,
    }),
    invocations: providerFixture.invocations,
  });
};
