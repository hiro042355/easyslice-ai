import type { SafeInternalProjection } from "../sensitiveBoundary/types";

export type MediaOperationClassification =
  | "clip-generation"
  | "clip-export"
  | "zip-export"
  | "preview-generation";

export type MediaOperationResultClassification =
  | "accepted"
  | "completed"
  | "failed"
  | "rejected"
  | "unavailable";

export type MediaOperationIssueCode =
  | "request-missing"
  | "request-identity-missing"
  | "upload-context-missing"
  | "upload-reference-invalid"
  | "auth-context-missing"
  | "operation-missing"
  | "operation-unsupported"
  | "policy-invalid"
  | "policy-violation"
  | "ownership-mismatch"
  | "request-duplicate"
  | "input-malformed";

export type MediaOperationReasonCode =
  | "media-operation-accepted"
  | "media-operation-completed"
  | "media-operation-failed"
  | "media-operation-rejected"
  | "media-operation-unavailable"
  | "media-operation-invalid"
  | "media-operation-policy-violation"
  | "media-operation-ownership-mismatch";

export type MediaOperationRequest = Readonly<{
  requestVersion: "1.0";
  requestIdentity: string;
  operation: MediaOperationClassification;
  operationIdentity: string;
  opaqueUploadReferences: readonly string[];
  opaqueOutputReferences: readonly string[];
}>;

export type MediaOperationContext = Readonly<{
  contextVersion: "1.0";
  tenantReference: string;
  workspaceReference: string;
  ownershipReference: string;
  sensitiveProjections: readonly SafeInternalProjection[];
}>;

export type MediaOperationPolicy = Readonly<{
  policyVersion: "1.0";
  allowedOperations: readonly MediaOperationClassification[];
  maximumUploadReferences: number;
  outputRequired: boolean;
}>;

export type MediaOperationInput = Readonly<{
  inputVersion: "1.0";
  request: MediaOperationRequest;
  context: MediaOperationContext;
  policy: MediaOperationPolicy;
}>;

export type MediaOperationValidation =
  | Readonly<{ status: "valid" }>
  | Readonly<{
      status: "invalid";
      issues: readonly Readonly<{ sequence: number; issueCode: MediaOperationIssueCode }>[];
    }>;

export type MediaOperationCapabilityResult = Readonly<{
  resultVersion: "1.0";
  classification: MediaOperationResultClassification;
  reasonCode: MediaOperationReasonCode;
  opaqueArtifactReferences: readonly string[];
}>;

export type MediaOperationCapability = Readonly<{
  execute(input: MediaOperationInput): MediaOperationCapabilityResult | Promise<MediaOperationCapabilityResult>;
}>;

export type MediaOperationAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stage: "validation" | "policy" | "ownership" | "capability" | "projection";
  classification: MediaOperationResultClassification | "invalid";
  operation: MediaOperationClassification | "none";
  reasonCode: MediaOperationReasonCode;
}>;

export type MediaOperationAudit = Readonly<{
  auditVersion: "1.0";
  entries: readonly MediaOperationAuditEntry[];
  reasonCodes: readonly MediaOperationReasonCode[];
}>;

export type MediaOperationDecision =
  | Readonly<{
      decisionVersion: "1.0";
      status: "accepted" | "completed";
      operation: MediaOperationClassification;
      opaqueArtifactReferences: readonly string[];
      audit: MediaOperationAudit;
    }>
  | Readonly<{
      decisionVersion: "1.0";
      status: "failed" | "rejected" | "unavailable";
      operation: MediaOperationClassification | "none";
      reasonCode: MediaOperationReasonCode;
      retryClassification: "not-retryable" | "retryable";
      audit: MediaOperationAudit;
    }>
  | Readonly<{
      decisionVersion: "1.0";
      status: "invalid";
      operation: "none";
      reasonCode: "media-operation-invalid";
      retryClassification: "not-retryable";
      audit: MediaOperationAudit;
    }>;
