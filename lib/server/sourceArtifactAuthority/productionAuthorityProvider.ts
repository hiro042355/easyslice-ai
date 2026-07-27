import type {
  PrincipalAwareAuthorityRuntimeProviderCapability,
} from "./principalAwareRuntimeProviderCapability";
import type {
  PrincipalAwareAuthorityRuntimeProviderInput,
} from "./principalAwareRuntimeProviderTypes";
import type {
  ProductionAuthorityProviderDependencies,
} from "./productionAuthorityProviderTypes";
import type {
  SourceArtifactAuthorityResolutionResult,
} from "./types";

const copyInput = (
  input: PrincipalAwareAuthorityRuntimeProviderInput,
): PrincipalAwareAuthorityRuntimeProviderInput => Object.freeze({
  ...input,
  sourceArtifactReference: Object.freeze({ ...input.sourceArtifactReference }),
  resolutionContext: Object.freeze({
    ...input.resolutionContext,
    sourceArtifact: Object.freeze({ ...input.resolutionContext.sourceArtifact }),
    principalIdentity: Object.freeze({ ...input.resolutionContext.principalIdentity }),
    tenantScope: Object.freeze({ ...input.resolutionContext.tenantScope }),
    ownershipScope: Object.freeze({ ...input.resolutionContext.ownershipScope }),
    workflowScope: Object.freeze({ ...input.resolutionContext.workflowScope }),
    authorizationEvidence: Object.freeze({
      ...input.resolutionContext.authorizationEvidence,
    }),
  }),
});

const copyResult = (
  result: SourceArtifactAuthorityResolutionResult,
): SourceArtifactAuthorityResolutionResult => result.status === "authorized"
  ? Object.freeze({
    ...result,
    ownershipScope: Object.freeze({ ...result.ownershipScope }),
    authorizationEvidence: Object.freeze({ ...result.authorizationEvidence }),
  })
  : Object.freeze({ ...result });

const unavailable = (): SourceArtifactAuthorityResolutionResult => Object.freeze({
  resultVersion: "1.0",
  status: "rejected",
  classification: "unavailable",
});

export const createProductionAuthorityProvider = (
  dependencies: ProductionAuthorityProviderDependencies,
): PrincipalAwareAuthorityRuntimeProviderCapability => Object.freeze({
  async evaluateSourceArtifact(
    input: PrincipalAwareAuthorityRuntimeProviderInput,
  ): Promise<SourceArtifactAuthorityResolutionResult> {
    try {
      if (typeof dependencies?.policy?.evaluate !== "function") {
        return unavailable();
      }
      const result = await dependencies.policy.evaluate(copyInput(input));
      return copyResult(result);
    } catch {
      return unavailable();
    }
  },
});
