import type {
  PrincipalAwareAuthorityRuntimeProviderCapability,
} from "./principalAwareRuntimeProviderCapability";
import type {
  PrincipalAwareAuthorityRuntimeProviderInput,
  PrincipalAwareAuthorityRuntimeProviderInputFailure,
  PrincipalAwareAuthorityRuntimeProviderInputValidationCapability,
  PrincipalAwareAuthorityRuntimeProviderInputValidationResult,
} from "./principalAwareRuntimeProviderTypes";
import type {
  SourceArtifactAuthorityResolutionResult,
} from "./types";

export type DeterministicPrincipalAwareRuntimeProviderFixture = Readonly<{
  provider: PrincipalAwareAuthorityRuntimeProviderCapability;
  validation: PrincipalAwareAuthorityRuntimeProviderInputValidationCapability;
  invocations(): readonly PrincipalAwareAuthorityRuntimeProviderInput[];
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const rejected = (
  failure: PrincipalAwareAuthorityRuntimeProviderInputFailure,
): PrincipalAwareAuthorityRuntimeProviderInputValidationResult => Object.freeze({
  resultVersion: "1.0",
  status: "rejected",
  failure,
});

const hasValidContextShape = (
  value: unknown,
): value is PrincipalAwareAuthorityRuntimeProviderInput["resolutionContext"] => {
  if (!isRecord(value)) return false;
  const source = value.sourceArtifact;
  const principal = value.principalIdentity;
  const tenant = value.tenantScope;
  const ownership = value.ownershipScope;
  const workflow = value.workflowScope;
  const evidence = value.authorizationEvidence;

  return value.contextVersion === "2.0" &&
    isRecord(source) &&
    source.referenceVersion === "1.0" &&
    isNonEmpty(source.opaqueSourceArtifactReference) &&
    isNonEmpty(value.requestIdentity) &&
    isNonEmpty(value.operationIdentity) &&
    isRecord(principal) &&
    principal.identityVersion === "1.0" &&
    isNonEmpty(principal.authorityNamespace) &&
    isNonEmpty(principal.principalReference) &&
    isRecord(tenant) &&
    tenant.scopeVersion === "1.0" &&
    isNonEmpty(tenant.tenantReference) &&
    isRecord(ownership) &&
    ownership.scopeVersion === "1.0" &&
    isNonEmpty(ownership.sourceTenantReference) &&
    isNonEmpty(ownership.sourceOwnershipReference) &&
    isRecord(workflow) &&
    workflow.scopeVersion === "1.0" &&
    isNonEmpty(workflow.workflowIdentity) &&
    isRecord(evidence) &&
    evidence.evidenceVersion === "1.0" &&
    isNonEmpty(evidence.authorityDecisionReference) &&
    evidence.decision === "authorized";
};

const copyInput = (
  value: PrincipalAwareAuthorityRuntimeProviderInput,
): PrincipalAwareAuthorityRuntimeProviderInput => Object.freeze({
  ...value,
  sourceArtifactReference: Object.freeze({ ...value.sourceArtifactReference }),
  resolutionContext: Object.freeze({
    ...value.resolutionContext,
    sourceArtifact: Object.freeze({ ...value.resolutionContext.sourceArtifact }),
    principalIdentity: Object.freeze({ ...value.resolutionContext.principalIdentity }),
    tenantScope: Object.freeze({ ...value.resolutionContext.tenantScope }),
    ownershipScope: Object.freeze({ ...value.resolutionContext.ownershipScope }),
    workflowScope: Object.freeze({ ...value.resolutionContext.workflowScope }),
    authorizationEvidence: Object.freeze({
      ...value.resolutionContext.authorizationEvidence,
    }),
  }),
});

const copyResult = (
  value: SourceArtifactAuthorityResolutionResult,
): SourceArtifactAuthorityResolutionResult => value.status === "authorized"
  ? Object.freeze({
    ...value,
    ownershipScope: Object.freeze({ ...value.ownershipScope }),
    authorizationEvidence: Object.freeze({ ...value.authorizationEvidence }),
  })
  : Object.freeze({ ...value });

const validate = (
  input: unknown,
): PrincipalAwareAuthorityRuntimeProviderInputValidationResult => {
  try {
    if (!isRecord(input)) return rejected("invalid-provider-input");
    if (input.contractVersion !== "2.0") {
      return rejected("unsupported-provider-input-version");
    }
    if (
      input.sourceArtifactReference === undefined ||
      input.sourceArtifactReference === null
    ) {
      return rejected("missing-source-reference");
    }
    if (input.resolutionContext === undefined || input.resolutionContext === null) {
      return rejected("missing-resolution-context");
    }
    if (
      !isRecord(input.sourceArtifactReference) ||
      input.sourceArtifactReference.referenceVersion !== "1.0" ||
      !isNonEmpty(input.sourceArtifactReference.opaqueSourceArtifactReference) ||
      !hasValidContextShape(input.resolutionContext)
    ) {
      return rejected("invalid-provider-input");
    }
    if (
      input.sourceArtifactReference.opaqueSourceArtifactReference !==
      input.resolutionContext.sourceArtifact.opaqueSourceArtifactReference
    ) {
      return rejected("invalid-provider-input");
    }

    return Object.freeze({
      resultVersion: "1.0",
      status: "valid",
      input: copyInput(input as unknown as PrincipalAwareAuthorityRuntimeProviderInput),
    });
  } catch {
    return rejected("internal-failure");
  }
};

export const createDeterministicPrincipalAwareRuntimeProviderFixture = (
  fixedResult: SourceArtifactAuthorityResolutionResult,
): DeterministicPrincipalAwareRuntimeProviderFixture => {
  const captured: PrincipalAwareAuthorityRuntimeProviderInput[] = [];
  const result = copyResult(fixedResult);

  return Object.freeze({
    validation: Object.freeze({ validateProviderInput: validate }),
    provider: Object.freeze({
      evaluateSourceArtifact(
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
