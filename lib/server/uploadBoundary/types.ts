export type UploadReferenceKind = "uploaded-object" | "pending-upload" | "trusted-import";
export type UploadSourceClassification = "browser-upload" | "server-ingest" | "trusted-import";
export type UploadMediaClassification = "video" | "audio" | "image" | "archive" | "unknown";
export type UploadContentLengthClassification = "empty" | "small" | "medium" | "large" | "unknown";
export type UploadLifecycleClassification = "available" | "pending" | "expired" | "deleted" | "quarantined" | "unavailable";

export type UploadIntegrityProjection = Readonly<{
  integrityVersion: "1.0";
  integrityPresent: boolean;
  integrityVerified: boolean;
  algorithmClassification: "sha256" | "sha512" | "provider-attested" | "none";
  contentLengthVerified: boolean;
  mediaTypeVerified: boolean;
}>;

export type UploadMetadataProjection = Readonly<{
  metadataVersion: "1.0";
  contentLengthClassification: UploadContentLengthClassification;
  declaredMediaClassification: UploadMediaClassification;
}>;

export type OpaqueUploadReference = Readonly<{
  referenceVersion: "1.0";
  referenceKind: UploadReferenceKind;
  opaqueReferenceId: string;
  sourceClassification: UploadSourceClassification;
  mediaClassification: UploadMediaClassification;
  tenantReference: string;
  workspaceReference: string;
  ownershipReference: string;
  lifecycleClassification: UploadLifecycleClassification;
  metadata: UploadMetadataProjection;
  integrity: UploadIntegrityProjection;
}>;

export type UploadReference = OpaqueUploadReference;

export type UploadProjectionInput = Readonly<{
  inputVersion: "1.0";
  requestIdentity: string;
  authenticatedTenantReference: string;
  requestedWorkspaceReference: string;
  authenticatedOwnershipReference: string;
  acceptedMediaClassifications: readonly UploadMediaClassification[];
  uploadReferences: readonly OpaqueUploadReference[];
}>;

export type UploadProjectionIssueCode =
  | "request-identity-missing"
  | "upload-reference-missing"
  | "opaque-reference-invalid"
  | "reference-kind-unsupported"
  | "source-classification-unsupported"
  | "media-classification-unsupported"
  | "tenant-reference-missing"
  | "workspace-reference-missing"
  | "ownership-reference-missing"
  | "content-length-classification-invalid"
  | "integrity-projection-invalid"
  | "lifecycle-classification-invalid"
  | "reference-duplicate";

export type UploadProjectionValidation =
  | Readonly<{ status: "valid" }>
  | Readonly<{ status: "invalid"; issues: readonly Readonly<{ issueCode: UploadProjectionIssueCode; sequence: number }>[] }>;

export type ProjectedUploadContext = Readonly<{
  contextVersion: "1.0";
  requestIdentity: string;
  tenantReference: string;
  workspaceReference: string;
  uploads: readonly OpaqueUploadReference[];
}>;

export type UploadProjectionAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stage: "validation" | "ownership" | "resolution" | "projection";
  classification: string;
  reasonCode: string;
}>;

export type UploadProjectionAudit = Readonly<{
  auditVersion: "1.0";
  entries: readonly UploadProjectionAuditEntry[];
  reasonCodes: readonly string[];
}>;

export type UploadProjectionDecision =
  | Readonly<{ decisionVersion: "1.0"; status: "projected"; context: ProjectedUploadContext; audit: UploadProjectionAudit }>
  | Readonly<{ decisionVersion: "1.0"; status: "invalid"; reasonCode: "upload-input-invalid"; audit: UploadProjectionAudit }>
  | Readonly<{ decisionVersion: "1.0"; status: "rejected"; reasonCode: "ownership-mismatch" | "media-unsupported" | "upload-expired" | "upload-deleted" | "upload-quarantined" | "resolution-rejected"; audit: UploadProjectionAudit }>
  | Readonly<{ decisionVersion: "1.0"; status: "pending"; reasonCode: "upload-pending"; audit: UploadProjectionAudit }>
  | Readonly<{ decisionVersion: "1.0"; status: "unavailable"; reasonCode: "upload-unavailable" | "resolution-unavailable"; audit: UploadProjectionAudit }>;
