export type WorkspaceState =
  | "reserved" | "prepared" | "active" | "cleanup-required" | "cleaned" | "failed";
export type WorkspaceClassification = "available" | "unavailable" | "rejected" | "not-found";
export type WorkspaceCleanupClassification = "not-required" | "completed" | "failed";
export type WorkspaceReasonCode =
  | "workspace-reserved" | "workspace-prepared" | "workspace-active"
  | "workspace-cleanup-required" | "workspace-cleaned" | "workspace-failed"
  | "workspace-invalid" | "workspace-ownership-mismatch"
  | "workspace-policy-unsupported" | "workspace-duplicate" | "workspace-not-found"
  | "cleanup-failure";
export type WorkspaceLifecycle = Readonly<{
  lifecycleVersion: "1.0"; state: WorkspaceState;
}>;
export type WorkspaceRetentionPolicy = Readonly<{
  policyVersion: "1.0"; classification: "request-scoped" | "execution-scoped";
  cleanupRequired: true;
}>;
export type WorkspaceOwnershipProjection = Readonly<{
  projectionVersion: "1.0";
  authenticatedTenantReference: string;
  workspaceTenantReference: string;
  authenticatedOwnershipReference: string;
  workspaceOwnershipReference: string;
}>;
export type WorkspaceReference = Readonly<{
  referenceVersion: "1.0"; opaqueWorkspaceReference: string;
}>;
export type WorkspacePreparationRequest = Readonly<{
  requestVersion: "1.0";
  requestIdentity: string;
  workspace: WorkspaceReference;
  ownership: WorkspaceOwnershipProjection;
  retention: WorkspaceRetentionPolicy;
}>;
export type WorkspaceValidationIssue =
  | "request-missing" | "ownership-missing" | "tenant-missing"
  | "workspace-identity-missing" | "lifecycle-invalid"
  | "policy-unsupported" | "cleanup-policy-invalid";
export type WorkspacePreparationPolicy = WorkspaceRetentionPolicy;
export type WorkspacePreparationAuditEntry = Readonly<{
  entryVersion: "1.0"; sequence: number; state: WorkspaceState;
  reasonCode: WorkspaceReasonCode; cleanupClassification: WorkspaceCleanupClassification;
}>;
export type WorkspacePreparationAudit = Readonly<{
  auditVersion: "1.0"; entries: readonly WorkspacePreparationAuditEntry[];
}>;
export type WorkspacePreparationDecision = Readonly<{
  decisionVersion: "1.0";
  classification: WorkspaceClassification;
  reasonCode: WorkspaceReasonCode;
  workspace?: WorkspaceReference;
  lifecycle: WorkspaceLifecycle;
  cleanupClassification: WorkspaceCleanupClassification;
  audit: WorkspacePreparationAudit;
}>;
export type WorkspaceCleanupDecision = WorkspacePreparationDecision;
export type WorkspaceValidation =
  | Readonly<{ status: "valid" }>
  | Readonly<{ status: "invalid"; issues: readonly Readonly<{ sequence: number; issueCode: WorkspaceValidationIssue }>[] }>;
export type WorkspaceCapability = Readonly<{
  reserve(request: WorkspacePreparationRequest): WorkspacePreparationDecision | Promise<WorkspacePreparationDecision>;
  prepare(request: WorkspacePreparationRequest): WorkspacePreparationDecision | Promise<WorkspacePreparationDecision>;
  lookup(request: WorkspacePreparationRequest): WorkspacePreparationDecision | Promise<WorkspacePreparationDecision>;
  cleanup(request: WorkspacePreparationRequest): WorkspaceCleanupDecision | Promise<WorkspaceCleanupDecision>;
}>;
