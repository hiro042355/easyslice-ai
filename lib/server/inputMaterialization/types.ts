export type SourceArtifactReference = Readonly<{
  referenceVersion: "1.0";
  opaqueSourceArtifactReference: string;
}>;

export type WorkspaceReferenceProjection = Readonly<{
  referenceVersion: "1.0";
  opaqueWorkspaceReference: string;
}>;

export type MaterializedArtifactReference = Readonly<{
  referenceVersion: "1.0";
  opaqueMaterializedArtifactReference: string;
}>;

export type InputMaterializationOwnershipProjection = Readonly<{
  projectionVersion: "1.0";
  authenticatedTenantReference: string;
  requestTenantReference: string;
  sourceTenantReference: string;
  workspaceTenantReference: string;
  authenticatedOwnershipReference: string;
  sourceOwnershipReference: string;
  workspaceOwnershipReference: string;
  operationOwnershipReference: string;
}>;

export type InputMaterializationPolicy = Readonly<{
  policyVersion: "1.0";
  collisionPolicy: "reject-existing";
}>;

export type InputMaterializationRequest = Readonly<{
  requestVersion: "1.0";
  requestIdentity: string;
  operationIdentity: string;
  sourceArtifact: SourceArtifactReference;
  workspace: WorkspaceReferenceProjection;
  materializedArtifact: MaterializedArtifactReference;
  ownership: InputMaterializationOwnershipProjection;
  policy: InputMaterializationPolicy;
}>;

export type InputMaterializationContext = Readonly<{
  contextVersion: "1.0";
  executionWorkspaceReference: string;
  executionOperationIdentity: string;
}>;

export type InputMaterializationClassification =
  | "materialized" | "rejected" | "failed" | "unavailable" | "invalid" | "already-exists";
export type InputMaterializationRetryClassification =
  | "retry-not-required" | "retry-not-allowed" | "retry-safe"
  | "retry-requires-policy-change" | "retry-external-policy";
export type InputMaterializationReasonCode =
  | "materialization-completed" | "request-invalid" | "policy-unsupported"
  | "ownership-mismatch" | "reference-invalid" | "reference-collision"
  | "duplicate-request" | "source-not-found" | "source-not-regular"
  | "source-unavailable" | "workspace-not-found" | "workspace-not-directory"
  | "workspace-unavailable" | "destination-outside-workspace"
  | "destination-already-exists" | "copy-failed" | "dependency-failure";

export type InputMaterializationValidationIssue =
  | "request-missing" | "request-identity-missing" | "operation-identity-missing"
  | "tenant-identity-missing" | "workspace-identity-missing"
  | "source-reference-missing" | "materialized-reference-missing"
  | "source-reference-invalid" | "workspace-reference-invalid"
  | "materialized-reference-invalid" | "policy-unsupported"
  | "reference-collision";

export type InputMaterializationValidation =
  | Readonly<{ status: "valid" }>
  | Readonly<{
    status: "invalid";
    issues: readonly Readonly<{ sequence: number; issueCode: InputMaterializationValidationIssue }>[];
  }>;

export type InputMaterializationAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stage:
    | "request-validation" | "policy-validation" | "ownership-validation"
    | "reference-validation" | "source-resolution" | "workspace-resolution"
    | "source-validation" | "workspace-validation" | "containment-validation"
    | "collision-validation" | "copy" | "result-projection";
  classification: InputMaterializationClassification;
  reasonCode: InputMaterializationReasonCode;
  retryClassification: InputMaterializationRetryClassification;
}>;

export type InputMaterializationAudit = Readonly<{
  auditVersion: "1.0";
  entries: readonly InputMaterializationAuditEntry[];
}>;

export type InputMaterializationDecision = Readonly<{
  decisionVersion: "1.0";
  classification: InputMaterializationClassification;
  reasonCode: InputMaterializationReasonCode;
  materializedArtifactAvailable: boolean;
  materializedArtifact?: MaterializedArtifactReference;
  retryClassification: InputMaterializationRetryClassification;
  audit: InputMaterializationAudit;
}>;

export type InputMaterializationCapability = Readonly<{
  materialize(
    request: InputMaterializationRequest,
    context: InputMaterializationContext,
  ): InputMaterializationDecision | Promise<InputMaterializationDecision>;
}>;
