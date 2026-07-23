export type SensitiveValueClassification =
  | "public"
  | "internal"
  | "confidential"
  | "credential"
  | "locator"
  | "personal"
  | "operational"
  | "derived-safe";

export type SensitiveValueSourceClassification =
  | "request-boundary"
  | "auth-boundary"
  | "upload-boundary"
  | "capability-boundary"
  | "internal-runtime";

export type SensitiveValueUsageScope =
  | "internal-execution"
  | "capability-input"
  | "audit"
  | "public-response"
  | "diagnostic"
  | "cleanup";

export type SensitiveProjectionPolicyClassification =
  | "strict"
  | "personal-public-explicit"
  | "internal-capability";

export type SensitiveValueReference = Readonly<{
  referenceVersion: "1.0";
  opaqueValueReference: string;
  classification: SensitiveValueClassification;
  sourceClassification: SensitiveValueSourceClassification;
  requestedUsageScope: SensitiveValueUsageScope;
  tenantReference: string;
  workspaceReference: string;
  ownershipReference: string;
  projectionPolicyClassification: SensitiveProjectionPolicyClassification;
}>;

export type SensitiveProjectionInput = Readonly<{
  inputVersion: "1.0";
  requestIdentity: string;
  authenticatedTenantReference: string;
  requestedWorkspaceReference: string;
  authenticatedOwnershipReference: string;
  references: readonly SensitiveValueReference[];
}>;

export type SensitiveProjectionIssueCode =
  | "request-identity-missing"
  | "value-reference-missing"
  | "opaque-reference-invalid"
  | "classification-unsupported"
  | "source-classification-unsupported"
  | "usage-scope-unsupported"
  | "tenant-reference-missing"
  | "workspace-reference-missing"
  | "ownership-reference-missing"
  | "projection-policy-invalid"
  | "reference-duplicate"
  | "metadata-malformed";

export type SensitiveProjectionReasonCode =
  | "sensitive-input-invalid"
  | "ownership-mismatch"
  | "scope-forbidden"
  | "projection-redacted"
  | "projection-approved"
  | "projection-rejected"
  | "projection-unavailable";

export type SensitiveProjectionValidation =
  | Readonly<{ status: "valid" }>
  | Readonly<{ status: "invalid"; issues: readonly Readonly<{ issueCode: SensitiveProjectionIssueCode; sequence: number }>[] }>;

export type SafeInternalProjection = Readonly<{
  projectionVersion: "1.0";
  opaqueValueReference: string;
  classification: SensitiveValueClassification;
  permittedUsageScope: SensitiveValueUsageScope;
  tenantClassification: "matched";
  workspaceClassification: "matched";
  ownershipVerified: true;
  redactionRequired: boolean;
  reasonCode: SensitiveProjectionReasonCode;
}>;

export type SafeAuditProjection = Readonly<{
  projectionVersion: "1.0";
  sequence: number;
  stage: "validation" | "ownership" | "policy" | "projection";
  classification: SensitiveValueClassification;
  requestedUsageScope: SensitiveValueUsageScope;
  outcomeClassification: "projected" | "redacted" | "rejected" | "invalid" | "unavailable";
  reasonCode: SensitiveProjectionReasonCode;
}>;

export type SafePublicProjection = Readonly<{
  projectionVersion: "1.0";
  outcomeClassification: "projected" | "redacted" | "rejected" | "invalid" | "unavailable";
  reasonCode: SensitiveProjectionReasonCode;
  retryClassification: "not-retryable" | "retryable";
  userActionClassification: "none" | "change-request" | "retry-later";
  messageClassification: "accepted" | "redacted" | "rejected" | "invalid" | "unavailable";
}>;

export type SensitiveProjectionContext = Readonly<{
  contextVersion: "1.0";
  internalProjections: readonly SafeInternalProjection[];
  auditProjections: readonly SafeAuditProjection[];
  publicProjections: readonly SafePublicProjection[];
}>;

export type SensitiveProjectionAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stage: "validation" | "ownership" | "policy" | "projection";
  classification: SensitiveValueClassification | "request";
  requestedUsageScope: SensitiveValueUsageScope | "none";
  decisionClassification: "projected" | "redacted" | "rejected" | "invalid" | "unavailable";
  reasonCode: SensitiveProjectionReasonCode;
}>;

export type SensitiveProjectionAudit = Readonly<{
  auditVersion: "1.0";
  entries: readonly SensitiveProjectionAuditEntry[];
  reasonCodes: readonly SensitiveProjectionReasonCode[];
}>;

export type SensitiveProjectionDecision =
  | Readonly<{ decisionVersion: "1.0"; status: "projected"; context: SensitiveProjectionContext; audit: SensitiveProjectionAudit }>
  | Readonly<{ decisionVersion: "1.0"; status: "redacted"; context: SensitiveProjectionContext; reasonCode: "projection-redacted"; audit: SensitiveProjectionAudit }>
  | Readonly<{ decisionVersion: "1.0"; status: "rejected"; reasonCode: "ownership-mismatch" | "scope-forbidden" | "projection-rejected"; audit: SensitiveProjectionAudit; publicProjection: SafePublicProjection }>
  | Readonly<{ decisionVersion: "1.0"; status: "invalid"; reasonCode: "sensitive-input-invalid"; audit: SensitiveProjectionAudit; publicProjection: SafePublicProjection }>
  | Readonly<{ decisionVersion: "1.0"; status: "unavailable"; reasonCode: "projection-unavailable"; audit: SensitiveProjectionAudit; publicProjection: SafePublicProjection }>;
