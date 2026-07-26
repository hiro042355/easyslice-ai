import type {
  SourceArtifactPrincipalAwareResolutionContext,
  SourceArtifactPrincipalContextValidationCapability,
  SourceArtifactPrincipalContextValidationResult,
  SourceArtifactPrincipalIdentity,
  SourceArtifactPrincipalValidationFailure,
} from "./principalTypes";
import type {
  SourceArtifactAuthorizationEvidence,
  SourceArtifactOwnershipScope,
} from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const rejected = (
  failure: SourceArtifactPrincipalValidationFailure,
): SourceArtifactPrincipalContextValidationResult => Object.freeze({
  resultVersion: "1.0",
  status: "rejected",
  failure,
});

const copyPrincipal = (
  value: SourceArtifactPrincipalIdentity,
): SourceArtifactPrincipalIdentity => Object.freeze({ ...value });

const copyOwnership = (
  value: SourceArtifactOwnershipScope,
): SourceArtifactOwnershipScope => Object.freeze({ ...value });

const copyEvidence = (
  value: SourceArtifactAuthorizationEvidence,
): SourceArtifactAuthorizationEvidence => Object.freeze({ ...value });

const validatePrincipal = (
  value: unknown,
): SourceArtifactPrincipalValidationFailure | undefined => {
  if (value === undefined || value === null) return "missing-principal";
  if (!isRecord(value)) return "invalid-principal";
  if (value.identityVersion !== "1.0") return "unsupported-principal-version";
  if (!isNonEmpty(value.authorityNamespace)) return "invalid-authority-namespace";
  if (!isNonEmpty(value.principalReference)) return "invalid-principal-reference";
  return undefined;
};

const hasValidContextShape = (
  value: Record<string, unknown>,
): value is Record<string, unknown> & SourceArtifactPrincipalAwareResolutionContext => {
  const sourceArtifact = value.sourceArtifact;
  const tenantScope = value.tenantScope;
  const ownershipScope = value.ownershipScope;
  const workflowScope = value.workflowScope;
  const evidence = value.authorizationEvidence;

  return value.contextVersion === "2.0" &&
    isRecord(sourceArtifact) &&
    sourceArtifact.referenceVersion === "1.0" &&
    isNonEmpty(sourceArtifact.opaqueSourceArtifactReference) &&
    isNonEmpty(value.requestIdentity) &&
    isNonEmpty(value.operationIdentity) &&
    isRecord(tenantScope) &&
    tenantScope.scopeVersion === "1.0" &&
    isNonEmpty(tenantScope.tenantReference) &&
    isRecord(ownershipScope) &&
    ownershipScope.scopeVersion === "1.0" &&
    isNonEmpty(ownershipScope.sourceTenantReference) &&
    isNonEmpty(ownershipScope.sourceOwnershipReference) &&
    isRecord(workflowScope) &&
    workflowScope.scopeVersion === "1.0" &&
    isNonEmpty(workflowScope.workflowIdentity) &&
    isRecord(evidence) &&
    evidence.evidenceVersion === "1.0" &&
    isNonEmpty(evidence.authorityDecisionReference) &&
    evidence.decision === "authorized";
};

const copyContext = (
  value: SourceArtifactPrincipalAwareResolutionContext,
): SourceArtifactPrincipalAwareResolutionContext => Object.freeze({
  ...value,
  sourceArtifact: Object.freeze({ ...value.sourceArtifact }),
  principalIdentity: copyPrincipal(value.principalIdentity),
  tenantScope: Object.freeze({ ...value.tenantScope }),
  ownershipScope: copyOwnership(value.ownershipScope),
  workflowScope: Object.freeze({ ...value.workflowScope }),
  authorizationEvidence: copyEvidence(value.authorizationEvidence),
});

export const createDeterministicSourceArtifactPrincipalContextFixture =
  (): SourceArtifactPrincipalContextValidationCapability => Object.freeze({
    validatePrincipalContext(input: unknown): SourceArtifactPrincipalContextValidationResult {
      try {
        if (!isRecord(input)) return rejected("invalid-context");

        const principalFailure = validatePrincipal(input.principalIdentity);
        if (principalFailure) return rejected(principalFailure);
        if (!hasValidContextShape(input)) return rejected("invalid-context");

        return Object.freeze({
          resultVersion: "1.0",
          status: "valid",
          context: copyContext(input),
        });
      } catch {
        return rejected("internal-failure");
      }
    },
  });
