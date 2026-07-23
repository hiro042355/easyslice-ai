export type PackagingClassification =
  | "packaged" | "rejected" | "failed" | "unavailable" | "invalid" | "already-exists";
export type PackagingReasonCode =
  | "archive-created" | "request-invalid" | "outputs-missing"
  | "outputs-duplicate" | "reference-invalid" | "naming-invalid"
  | "policy-unsupported" | "output-not-found" | "output-not-regular"
  | "output-unavailable" | "archive-already-exists"
  | "archive-build-failed" | "archive-write-failed" | "dependency-failure";
export type RetryClassification =
  | "retry-not-required" | "retry-not-allowed" | "retry-safe"
  | "retry-requires-policy-change" | "retry-external-policy";

export type OutputArtifactProjection = Readonly<{
  referenceVersion: "1.0";
  opaqueOutputArtifactReference: string;
}>;
export type ArchiveProjection = Readonly<{
  referenceVersion: "1.0";
  opaqueArchiveReference: string;
}>;
export type PackagingRequest = Readonly<{
  requestVersion: "1.0";
  requestIdentity: string;
  operationIdentity: string;
  outputs: readonly OutputArtifactProjection[];
  archive: ArchiveProjection;
  namingPolicy: Readonly<{
    policyVersion: "1.0";
    classification: "operation-identity";
  }>;
  collisionPolicy: Readonly<{
    policyVersion: "1.0";
    classification: "reject-existing";
  }>;
}>;

export type PackagingAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stage:
    | "validation" | "output-discovery" | "output-validation"
    | "collision-validation" | "archive-build" | "archive-write" | "projection";
  classification: PackagingClassification;
  reasonCode: PackagingReasonCode;
}>;
export type PackagingAudit = Readonly<{
  auditVersion: "1.0";
  entries: readonly PackagingAuditEntry[];
}>;
export type PackagingDecision = Readonly<{
  decisionVersion: "1.0";
  classification: PackagingClassification;
  reasonCode: PackagingReasonCode;
  archiveAvailable: boolean;
  archive?: ArchiveProjection;
  outputCount: number;
  retryClassification: RetryClassification;
  audit: PackagingAudit;
}>;
export type PackagingCapability = Readonly<{
  package(request: PackagingRequest): Promise<PackagingDecision>;
}>;
