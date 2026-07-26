import type {
  PrincipalAwareAuthorityRuntimeProviderInput,
} from "./principalAwareRuntimeProviderTypes";
import type {
  SourceArtifactAuthorityResolutionResult,
} from "./types";

export type PrincipalAwareAuthorityRuntimeProviderCapability = Readonly<{
  evaluateSourceArtifact(
    input: PrincipalAwareAuthorityRuntimeProviderInput,
  ):
    | SourceArtifactAuthorityResolutionResult
    | Promise<SourceArtifactAuthorityResolutionResult>;
}>;
