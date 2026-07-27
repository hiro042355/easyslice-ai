import type {
  PrincipalAwareAuthorityRuntimeProviderCapability,
} from "./principalAwareRuntimeProviderCapability";
import type {
  PrincipalAwareAuthorityRuntimeProviderInput,
  PrincipalAwareAuthorityRuntimeProviderInputValidationCapability,
} from "./principalAwareRuntimeProviderTypes";
import type {
  SourceArtifactAuthorityResolutionResult,
} from "./types";

export type ProductionAuthorityPolicyCapability = Readonly<{
  evaluate(
    input: PrincipalAwareAuthorityRuntimeProviderInput,
  ):
    | SourceArtifactAuthorityResolutionResult
    | Promise<SourceArtifactAuthorityResolutionResult>;
}>;

export type ProductionAuthorityProviderDependencies = Readonly<{
  policy: ProductionAuthorityPolicyCapability;
}>;

export type ProductionAuthorityProviderCompositionDependencies = Readonly<{
  policy: ProductionAuthorityPolicyCapability;
  validation: PrincipalAwareAuthorityRuntimeProviderInputValidationCapability;
}>;

export type ProductionAuthorityProviderComposition = Readonly<{
  provider: PrincipalAwareAuthorityRuntimeProviderCapability;
  validation: PrincipalAwareAuthorityRuntimeProviderInputValidationCapability;
}>;
