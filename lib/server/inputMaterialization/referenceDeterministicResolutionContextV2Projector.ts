import type {
  InputMaterializationV2ProjectionFailure,
  InputMaterializationV2ProjectionResult,
  InputMaterializationV2Request,
  InputMaterializationV2ResolutionContextProjector,
} from "./resolutionContextV2Types";
import type { SourceArtifactLocatorV2ResolutionContext } from "../sourceArtifactLocator/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const rejected = (
  failure: InputMaterializationV2ProjectionFailure,
): InputMaterializationV2ProjectionResult => Object.freeze({
  resultVersion: "1.0",
  status: "rejected",
  failure,
});

const missingFailure = (
  context: Record<string, unknown>,
): InputMaterializationV2ProjectionFailure | undefined => {
  if (context.principalIdentity === undefined || context.principalIdentity === null) {
    return "missing-principal";
  }
  if (context.tenantScope === undefined || context.tenantScope === null) {
    return "missing-tenant";
  }
  if (context.ownershipScope === undefined || context.ownershipScope === null) {
    return "missing-ownership";
  }
  if (context.workflowScope === undefined || context.workflowScope === null) {
    return "missing-workflow";
  }
  if (context.authorizationEvidence === undefined || context.authorizationEvidence === null) {
    return "missing-evidence";
  }
  return undefined;
};

const hasValidMaterializationRequest = (
  value: unknown,
): value is InputMaterializationV2Request["materializationRequest"] => {
  if (!isRecord(value)) return false;
  const source = value.sourceArtifact;
  const ownership = value.ownership;

  return value.requestVersion === "1.0" &&
    isNonEmpty(value.requestIdentity) &&
    isNonEmpty(value.operationIdentity) &&
    isRecord(source) &&
    source.referenceVersion === "1.0" &&
    isNonEmpty(source.opaqueSourceArtifactReference) &&
    isRecord(ownership) &&
    ownership.projectionVersion === "1.0" &&
    isNonEmpty(ownership.sourceTenantReference) &&
    isNonEmpty(ownership.sourceOwnershipReference);
};

const hasValidExplicitContext = (
  value: Record<string, unknown>,
): value is InputMaterializationV2Request["sourceResolutionContext"] => {
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

const contextsAgree = (
  input: InputMaterializationV2Request,
): boolean => {
  const request = input.materializationRequest;
  const context = input.sourceResolutionContext;

  return request.requestIdentity === context.requestIdentity &&
    request.operationIdentity === context.operationIdentity &&
    request.sourceArtifact.opaqueSourceArtifactReference ===
      context.sourceArtifact.opaqueSourceArtifactReference &&
    request.ownership.sourceTenantReference === context.tenantScope.tenantReference &&
    request.ownership.sourceTenantReference ===
      context.ownershipScope.sourceTenantReference &&
    request.ownership.sourceOwnershipReference ===
      context.ownershipScope.sourceOwnershipReference;
};

const project = (
  input: InputMaterializationV2Request,
): SourceArtifactLocatorV2ResolutionContext => Object.freeze({
  contextVersion: "2.0",
  requestIdentity: input.sourceResolutionContext.requestIdentity,
  operationIdentity: input.sourceResolutionContext.operationIdentity,
  workflowIdentity: input.sourceResolutionContext.workflowScope.workflowIdentity,
  ownershipScope: Object.freeze({
    ...input.sourceResolutionContext.ownershipScope,
  }),
  authorizationEvidence: Object.freeze({
    ...input.sourceResolutionContext.authorizationEvidence,
  }),
});

export const createDeterministicInputMaterializationV2ResolutionContextProjector =
  (): InputMaterializationV2ResolutionContextProjector => Object.freeze({
    projectResolutionContext(input: unknown): InputMaterializationV2ProjectionResult {
      try {
        if (!isRecord(input)) return rejected("invalid-context");
        if (input.version !== "2.0") return rejected("unsupported-version");
        if (!isRecord(input.sourceResolutionContext)) return rejected("invalid-context");

        const missing = missingFailure(input.sourceResolutionContext);
        if (missing) return rejected(missing);
        if (!hasValidMaterializationRequest(input.materializationRequest)) {
          return rejected("invalid-context");
        }
        if (!hasValidExplicitContext(input.sourceResolutionContext)) {
          return rejected("invalid-context");
        }

        const typedInput = input as InputMaterializationV2Request;
        if (!contextsAgree(typedInput)) return rejected("invalid-context");

        return Object.freeze({
          resultVersion: "1.0",
          status: "projected",
          resolutionContext: project(typedInput),
        });
      } catch {
        return rejected("internal-failure");
      }
    },
  });
