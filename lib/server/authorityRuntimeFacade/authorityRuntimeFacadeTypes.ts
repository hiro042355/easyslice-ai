import type {
  PrincipalAwareAuthorityRuntimeProviderCapability,
} from "../sourceArtifactAuthority/principalAwareRuntimeProviderCapability";
import type {
  PrincipalAwareAuthorityRuntimeProviderInput,
  PrincipalAwareAuthorityRuntimeProviderInputValidationCapability,
} from "../sourceArtifactAuthority/principalAwareRuntimeProviderTypes";
import type {
  SourceArtifactPrincipalAwareResolutionContext,
} from "../sourceArtifactAuthority/principalTypes";
import type {
  SourceArtifactAuthorityResolutionInput,
  SourceArtifactAuthorityResolutionResult,
} from "../sourceArtifactAuthority/types";

export type AuthorityRuntimeFacadeInput = Readonly<{
  facadeVersion: "1.0";
  providerVersion: PrincipalAwareAuthorityRuntimeProviderInput["contractVersion"];
  sourceArtifactReference: SourceArtifactAuthorityResolutionInput["sourceArtifact"];
  resolutionContext: SourceArtifactPrincipalAwareResolutionContext;
}>;

export type AuthorityRuntimeFacadeFailure =
  | "unsupported-provider-version"
  | "missing-source-reference"
  | "missing-resolution-context"
  | "invalid-provider-input"
  | "internal-failure";

export type AuthorityRuntimeFacadeResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "evaluated";
    authorityResult: SourceArtifactAuthorityResolutionResult;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "rejected";
    failure: AuthorityRuntimeFacadeFailure;
  }>;

export type AuthorityRuntimeFacadeDependencies = Readonly<{
  provider: PrincipalAwareAuthorityRuntimeProviderCapability;
  validation: PrincipalAwareAuthorityRuntimeProviderInputValidationCapability;
}>;

export type AuthorityRuntimeFacade = Readonly<{
  evaluate(input: unknown): Promise<AuthorityRuntimeFacadeResult>;
}>;
