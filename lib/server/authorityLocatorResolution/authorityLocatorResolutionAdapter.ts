import type {
  AuthorityLocatorResolutionAdapter,
  AuthorityLocatorResolutionAdapterFailure,
  AuthorityLocatorResolutionAdapterInput,
  AuthorityLocatorResolutionAdapterResult,
} from "./authorityLocatorAdapterTypes";
import type {
  SourceArtifactAuthorizationEvidence,
  SourceArtifactAuthorityAuthorizedResult,
  SourceArtifactOwnershipScope,
} from "../sourceArtifactAuthority/types";
import type { SourceArtifactPrincipalIdentity } from "../sourceArtifactAuthority/principalTypes";
import type { SourceArtifactLocatorV2ResolutionContext } from "../sourceArtifactLocator/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const rejected = (
  failure: AuthorityLocatorResolutionAdapterFailure,
): AuthorityLocatorResolutionAdapterResult => Object.freeze({
  resultVersion: "1.0",
  status: "rejected",
  failure,
});

const samePrincipal = (
  left: SourceArtifactPrincipalIdentity,
  right: SourceArtifactPrincipalIdentity,
): boolean =>
  left.identityVersion === right.identityVersion &&
  left.authorityNamespace === right.authorityNamespace &&
  left.principalReference === right.principalReference;

const sameOwnership = (
  left: SourceArtifactOwnershipScope,
  right: SourceArtifactOwnershipScope,
): boolean =>
  left.scopeVersion === right.scopeVersion &&
  left.sourceTenantReference === right.sourceTenantReference &&
  left.sourceOwnershipReference === right.sourceOwnershipReference;

const sameEvidence = (
  left: SourceArtifactAuthorizationEvidence,
  right: SourceArtifactAuthorizationEvidence,
): boolean =>
  left.evidenceVersion === right.evidenceVersion &&
  left.authorityDecisionReference === right.authorityDecisionReference &&
  left.decision === right.decision;

const missingFailure = (
  input: Record<string, unknown>,
): AuthorityLocatorResolutionAdapterFailure | undefined => {
  if (input.authorityResult === undefined || input.authorityResult === null) {
    return "missing-authority-result";
  }
  if (!isRecord(input.authorityContext)) return "invalid-context";
  if (
    input.authorityContext.principalIdentity === undefined ||
    input.authorityContext.principalIdentity === null
  ) {
    return "missing-principal";
  }
  if (
    input.authorityContext.tenantScope === undefined ||
    input.authorityContext.tenantScope === null
  ) {
    return "missing-tenant";
  }
  if (
    input.authorityContext.ownershipScope === undefined ||
    input.authorityContext.ownershipScope === null
  ) {
    return "missing-ownership";
  }
  if (
    input.authorityContext.workflowScope === undefined ||
    input.authorityContext.workflowScope === null
  ) {
    return "missing-workflow";
  }
  if (
    input.authorityContext.authorizationEvidence === undefined ||
    input.authorityContext.authorizationEvidence === null
  ) {
    return "missing-evidence";
  }
  return undefined;
};

const hasValidPrincipal = (
  value: unknown,
): value is SourceArtifactPrincipalIdentity =>
  isRecord(value) &&
  value.identityVersion === "1.0" &&
  isNonEmpty(value.authorityNamespace) &&
  isNonEmpty(value.principalReference);

const hasValidOwnership = (
  value: unknown,
): value is SourceArtifactOwnershipScope =>
  isRecord(value) &&
  value.scopeVersion === "1.0" &&
  isNonEmpty(value.sourceTenantReference) &&
  isNonEmpty(value.sourceOwnershipReference);

const hasValidEvidence = (
  value: unknown,
): value is SourceArtifactAuthorizationEvidence =>
  isRecord(value) &&
  value.evidenceVersion === "1.0" &&
  isNonEmpty(value.authorityDecisionReference) &&
  value.decision === "authorized";

const isAuthorizedResult = (
  value: Record<string, unknown>,
): value is Record<string, unknown> & SourceArtifactAuthorityAuthorizedResult =>
  value.resultVersion === "1.0" &&
  value.status === "authorized" &&
  isNonEmpty(value.opaqueAuthorityRecordReference) &&
  isNonEmpty(value.opaqueResolutionReference) &&
  hasValidOwnership(value.ownershipScope) &&
  hasValidEvidence(value.authorizationEvidence);

const hasValidContext = (
  input: Record<string, unknown>,
): input is Record<string, unknown> & AuthorityLocatorResolutionAdapterInput => {
  const authorityContext = input.authorityContext;
  const binding = input.principalAuthorizationBinding;
  const locatorContext = input.locatorContext;
  const source = input.sourceArtifact;

  return input.adapterVersion === "1.0" &&
    input.locatorVersion === "2.0" &&
    isNonEmpty(input.requestIdentity) &&
    isNonEmpty(input.operationIdentity) &&
    isRecord(source) &&
    source.referenceVersion === "1.0" &&
    isNonEmpty(source.opaqueSourceArtifactReference) &&
    isRecord(authorityContext) &&
    authorityContext.contextVersion === "2.0" &&
    isRecord(authorityContext.sourceArtifact) &&
    authorityContext.sourceArtifact.referenceVersion === "1.0" &&
    isNonEmpty(authorityContext.sourceArtifact.opaqueSourceArtifactReference) &&
    isNonEmpty(authorityContext.requestIdentity) &&
    isNonEmpty(authorityContext.operationIdentity) &&
    hasValidPrincipal(authorityContext.principalIdentity) &&
    isRecord(authorityContext.tenantScope) &&
    authorityContext.tenantScope.scopeVersion === "1.0" &&
    isNonEmpty(authorityContext.tenantScope.tenantReference) &&
    hasValidOwnership(authorityContext.ownershipScope) &&
    isRecord(authorityContext.workflowScope) &&
    authorityContext.workflowScope.scopeVersion === "1.0" &&
    isNonEmpty(authorityContext.workflowScope.workflowIdentity) &&
    hasValidEvidence(authorityContext.authorizationEvidence) &&
    isRecord(binding) &&
    binding.bindingVersion === "1.0" &&
    hasValidPrincipal(binding.principalIdentity) &&
    hasValidEvidence(binding.authorizationEvidence) &&
    isRecord(locatorContext) &&
    locatorContext.contextVersion === "2.0" &&
    isNonEmpty(locatorContext.requestIdentity) &&
    isNonEmpty(locatorContext.operationIdentity) &&
    isNonEmpty(locatorContext.workflowIdentity) &&
    hasValidOwnership(locatorContext.ownershipScope) &&
    hasValidEvidence(locatorContext.authorizationEvidence);
};

const copyLocatorContext = (
  value: SourceArtifactLocatorV2ResolutionContext,
): SourceArtifactLocatorV2ResolutionContext => Object.freeze({
  ...value,
  ownershipScope: Object.freeze({ ...value.ownershipScope }),
  authorizationEvidence: Object.freeze({ ...value.authorizationEvidence }),
});

export const createAuthorityLocatorResolutionAdapter =
  (): AuthorityLocatorResolutionAdapter => Object.freeze({
    adapt(input: unknown): AuthorityLocatorResolutionAdapterResult {
      try {
        if (!isRecord(input)) return rejected("invalid-context");
        if (input.adapterVersion !== "1.0") return rejected("invalid-context");

        const missing = missingFailure(input);
        if (missing) return rejected(missing);
        if (!isRecord(input.authorityResult)) return rejected("invalid-context");
        if (input.authorityResult.resultVersion !== "1.0") {
          return rejected("unsupported-authority-version");
        }
        if (input.locatorVersion !== "2.0") {
          return rejected("unsupported-locator-version");
        }
        if (input.authorityResult.status !== "authorized") {
          return rejected("authority-denied");
        }
        if (!isAuthorizedResult(input.authorityResult) || !hasValidContext(input)) {
          return rejected("invalid-context");
        }

        const authority = input.authorityResult;
        const authorityContext = input.authorityContext;
        const binding = input.principalAuthorizationBinding;
        const locator = input.locatorContext;

        if (
          input.sourceArtifact.opaqueSourceArtifactReference !==
          authorityContext.sourceArtifact.opaqueSourceArtifactReference
        ) return rejected("source-mismatch");
        if (
          input.requestIdentity !== authorityContext.requestIdentity ||
          input.requestIdentity !== locator.requestIdentity
        ) return rejected("request-mismatch");
        if (
          input.operationIdentity !== authorityContext.operationIdentity ||
          input.operationIdentity !== locator.operationIdentity
        ) return rejected("operation-mismatch");
        if (!samePrincipal(authorityContext.principalIdentity, binding.principalIdentity)) {
          return rejected("principal-mismatch");
        }
        if (
          authorityContext.tenantScope.tenantReference !==
            authorityContext.ownershipScope.sourceTenantReference ||
          authorityContext.tenantScope.tenantReference !==
            locator.ownershipScope.sourceTenantReference ||
          authorityContext.tenantScope.tenantReference !==
            authority.ownershipScope.sourceTenantReference
        ) return rejected("tenant-mismatch");
        if (
          !sameOwnership(authorityContext.ownershipScope, locator.ownershipScope) ||
          !sameOwnership(authorityContext.ownershipScope, authority.ownershipScope)
        ) return rejected("ownership-mismatch");
        if (authorityContext.workflowScope.workflowIdentity !== locator.workflowIdentity) {
          return rejected("workflow-mismatch");
        }
        if (
          !sameEvidence(authorityContext.authorizationEvidence, locator.authorizationEvidence) ||
          !sameEvidence(authorityContext.authorizationEvidence, authority.authorizationEvidence) ||
          !sameEvidence(authorityContext.authorizationEvidence, binding.authorizationEvidence)
        ) return rejected("evidence-mismatch");

        return Object.freeze({
          resultVersion: "1.0",
          status: "adapted",
          locatorRequest: Object.freeze({
            version: "2.0",
            opaqueReference: input.sourceArtifact.opaqueSourceArtifactReference,
            resolutionContext: copyLocatorContext(locator),
          }),
        });
      } catch {
        return rejected("internal-failure");
      }
    },
  });
