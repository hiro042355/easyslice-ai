import type {
  PrincipalAwareAuthorityRuntimeProviderInput,
} from "./principalAwareRuntimeProviderTypes";
import type {
  ProductionAuthorityPolicyCapability,
} from "./productionAuthorityProviderTypes";
import type {
  SourceArtifactAuthorityResolutionResult,
} from "./types";

export type DeterministicProductionAuthorityPolicyFixture = Readonly<{
  policy: ProductionAuthorityPolicyCapability;
  invocations(): readonly PrincipalAwareAuthorityRuntimeProviderInput[];
}>;

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

export const createDeterministicProductionAuthorityPolicyFixture = (
  fixedResult: SourceArtifactAuthorityResolutionResult,
): DeterministicProductionAuthorityPolicyFixture => {
  const result = copyResult(fixedResult);
  const captured: PrincipalAwareAuthorityRuntimeProviderInput[] = [];

  return Object.freeze({
    policy: Object.freeze({
      evaluate(
        input: PrincipalAwareAuthorityRuntimeProviderInput,
      ): SourceArtifactAuthorityResolutionResult {
        captured.push(copyInput(input));
        return copyResult(result);
      },
    }),
    invocations(): readonly PrincipalAwareAuthorityRuntimeProviderInput[] {
      return Object.freeze(captured.map(copyInput));
    },
  });
};
