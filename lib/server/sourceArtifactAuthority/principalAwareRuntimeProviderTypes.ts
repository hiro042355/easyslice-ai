import type { SourceArtifactPrincipalAwareResolutionContext } from "./principalTypes";
import type { SourceArtifactAuthorityResolutionInput } from "./types";

export type PrincipalAwareAuthorityRuntimeProviderInput = Readonly<{
  contractVersion: "2.0";
  sourceArtifactReference: SourceArtifactAuthorityResolutionInput["sourceArtifact"];
  resolutionContext: SourceArtifactPrincipalAwareResolutionContext;
}>;

export type PrincipalAwareAuthorityRuntimeProviderInputFailure =
  | "unsupported-provider-input-version"
  | "invalid-provider-input"
  | "missing-source-reference"
  | "missing-resolution-context"
  | "internal-failure";

export type PrincipalAwareAuthorityRuntimeProviderInputValidationResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "valid";
    input: PrincipalAwareAuthorityRuntimeProviderInput;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "rejected";
    failure: PrincipalAwareAuthorityRuntimeProviderInputFailure;
  }>;

export type PrincipalAwareAuthorityRuntimeProviderInputValidationCapability =
  Readonly<{
    validateProviderInput(
      input: unknown,
    ): PrincipalAwareAuthorityRuntimeProviderInputValidationResult;
  }>;
