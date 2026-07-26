import type {
  WorkflowEntryTrustedContextAdapter,
  WorkflowEntryTrustedContextAdapterFailure,
  WorkflowEntryTrustedContextAdapterInput,
  WorkflowEntryTrustedContextAdapterResult,
} from "./adapterTypes";
import type { InputMaterializationRequest } from "../inputMaterialization/types";
import type { SourceArtifactPrincipalAwareResolutionContext } from "../sourceArtifactAuthority/principalTypes";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const rejected = (
  failure: WorkflowEntryTrustedContextAdapterFailure,
): WorkflowEntryTrustedContextAdapterResult => Object.freeze({
  resultVersion: "1.0",
  status: "rejected",
  failure,
});

const missingFailure = (
  trusted: Record<string, unknown>,
  workflowEntry: Record<string, unknown>,
): WorkflowEntryTrustedContextAdapterFailure | undefined => {
  if (trusted.principalIdentity === undefined || trusted.principalIdentity === null) {
    return "missing-principal";
  }
  if (trusted.tenantScope === undefined || trusted.tenantScope === null) {
    return "missing-tenant";
  }
  if (trusted.ownershipScope === undefined || trusted.ownershipScope === null) {
    return "missing-ownership";
  }
  if (trusted.authorizationEvidence === undefined || trusted.authorizationEvidence === null) {
    return "missing-evidence";
  }
  const selection = workflowEntry.selection;
  if (
    !isRecord(selection) ||
    !isRecord(selection.workflow) ||
    !isNonEmpty(selection.workflow.workflowId)
  ) {
    return "missing-workflow";
  }
  return undefined;
};

const hasValidMaterializationRequest = (
  value: unknown,
): value is InputMaterializationRequest => {
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

const hasValidWorkflowEntry = (
  value: Record<string, unknown>,
): boolean => {
  const request = value.request;
  const selection = value.selection;
  const input = value.input;

  return value.envelopeVersion === "1.0" &&
    isRecord(request) &&
    request.requestVersion === "1.0" &&
    isNonEmpty(request.requestId) &&
    isRecord(selection) &&
    selection.selectionVersion === "1.0" &&
    isRecord(selection.workflow) &&
    isNonEmpty(selection.workflow.workflowId) &&
    isNonEmpty(selection.workflow.workflowVersion) &&
    isRecord(input) &&
    input.inputVersion === "1.0" &&
    hasValidMaterializationRequest(input.payload);
};

const hasValidTrustedContext = (
  value: Record<string, unknown>,
): value is Record<string, unknown> & WorkflowEntryTrustedContextAdapterInput["trustedContext"] => {
  const source = value.sourceArtifact;
  const principal = value.principalIdentity;
  const tenant = value.tenantScope;
  const ownership = value.ownershipScope;
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
    isRecord(evidence) &&
    evidence.evidenceVersion === "1.0" &&
    isNonEmpty(evidence.authorityDecisionReference) &&
    evidence.decision === "authorized";
};

const copyMaterializationRequest = (
  value: InputMaterializationRequest,
): InputMaterializationRequest => Object.freeze({
  ...value,
  sourceArtifact: Object.freeze({ ...value.sourceArtifact }),
  workspace: Object.freeze({ ...value.workspace }),
  materializedArtifact: Object.freeze({ ...value.materializedArtifact }),
  ownership: Object.freeze({ ...value.ownership }),
  policy: Object.freeze({ ...value.policy }),
});

const copyTrustedContext = (
  value: WorkflowEntryTrustedContextAdapterInput["trustedContext"],
  workflowIdentity: string,
): SourceArtifactPrincipalAwareResolutionContext => Object.freeze({
  ...value,
  sourceArtifact: Object.freeze({ ...value.sourceArtifact }),
  principalIdentity: Object.freeze({ ...value.principalIdentity }),
  tenantScope: Object.freeze({ ...value.tenantScope }),
  ownershipScope: Object.freeze({ ...value.ownershipScope }),
  workflowScope: Object.freeze({
    scopeVersion: "1.0",
    workflowIdentity,
  }),
  authorizationEvidence: Object.freeze({ ...value.authorizationEvidence }),
});

const contextsAgree = (
  request: InputMaterializationRequest,
  trusted: WorkflowEntryTrustedContextAdapterInput["trustedContext"],
): boolean =>
  request.requestIdentity === trusted.requestIdentity &&
  request.operationIdentity === trusted.operationIdentity &&
  request.sourceArtifact.opaqueSourceArtifactReference ===
    trusted.sourceArtifact.opaqueSourceArtifactReference &&
  request.ownership.sourceTenantReference === trusted.tenantScope.tenantReference &&
  request.ownership.sourceTenantReference === trusted.ownershipScope.sourceTenantReference &&
  request.ownership.sourceOwnershipReference === trusted.ownershipScope.sourceOwnershipReference;

export const createWorkflowEntryTrustedContextAdapter =
  (): WorkflowEntryTrustedContextAdapter => Object.freeze({
    adapt(input: unknown): WorkflowEntryTrustedContextAdapterResult {
      try {
        if (!isRecord(input)) return rejected("invalid-context");
        if (input.adapterVersion !== "1.0") return rejected("unsupported-version");
        if (!isRecord(input.workflowEntry) || !isRecord(input.trustedContext)) {
          return rejected("invalid-context");
        }

        const missing = missingFailure(input.trustedContext, input.workflowEntry);
        if (missing) return rejected(missing);
        if (
          !hasValidWorkflowEntry(input.workflowEntry) ||
          !hasValidTrustedContext(input.trustedContext)
        ) {
          return rejected("invalid-context");
        }

        const workflowEntry =
          input.workflowEntry as unknown as WorkflowEntryTrustedContextAdapterInput["workflowEntry"];
        const trustedContext = input.trustedContext;
        const materializationRequest = workflowEntry.input.payload;
        if (
          workflowEntry.request.requestId !== materializationRequest.requestIdentity ||
          !contextsAgree(materializationRequest, trustedContext)
        ) {
          return rejected("invalid-context");
        }

        const workflowIdentity = workflowEntry.selection.workflow.workflowId;
        return Object.freeze({
          resultVersion: "1.0",
          status: "adapted",
          materializationRequest: Object.freeze({
            version: "2.0",
            materializationRequest: copyMaterializationRequest(materializationRequest),
            sourceResolutionContext: copyTrustedContext(
              trustedContext,
              workflowIdentity,
            ),
          }),
          locatorWorkflowIdentity: workflowIdentity,
        });
      } catch {
        return rejected("internal-failure");
      }
    },
  });
