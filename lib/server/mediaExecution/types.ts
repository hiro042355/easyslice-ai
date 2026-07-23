import type { MediaOperationClassification } from "../mediaOperation/types";

export type MediaExecutionStage =
  | "workspace-prepare" | "input-materialize" | "media-process"
  | "package-output" | "collect-output" | "cleanup";
export type MediaExecutionClassification =
  | "completed" | "accepted" | "rejected" | "failed"
  | "unavailable" | "cancelled" | "timed-out" | "invalid";
export type ExecutionRetryProjection =
  | "retry-not-allowed" | "retry-safe"
  | "retry-requires-new-request" | "retry-external-policy";
export type CleanupClassification = "not-required" | "completed" | "failed" | "unavailable";

export type ExecutionWorkspaceReference = Readonly<{
  referenceVersion: "1.0"; opaqueWorkspaceReference: string; ownershipReference: string;
}>;
export type InputArtifactReference = Readonly<{
  referenceVersion: "1.0"; opaqueInputArtifactReference: string; ownershipReference: string;
}>;
export type OutputArtifactReference = Readonly<{
  referenceVersion: "1.0"; opaqueOutputArtifactReference: string; ownershipReference: string;
}>;
export type PackageArtifactReference = Readonly<{
  referenceVersion: "1.0"; opaquePackageArtifactReference: string; ownershipReference: string;
}>;

export type ExecutionCancellationProjection = Readonly<{
  projectionVersion: "1.0"; classification: "active" | "cancelled";
}>;
export type ExecutionTimeoutProjection = Readonly<{
  projectionVersion: "1.0"; classification: "within-policy" | "timed-out";
}>;

export type MediaExecutionRequest = Readonly<{
  requestVersion: "1.0";
  requestIdentity: string;
  operationIdentity: string;
  operation: MediaOperationClassification;
  inputArtifacts: readonly InputArtifactReference[];
  packagingRequired: boolean;
}>;
export type MediaExecutionContext = Readonly<{
  contextVersion: "1.0";
  authenticatedTenantReference: string;
  executionTenantReference: string;
  authenticatedWorkspaceReference: string;
  executionWorkspaceReference: string;
  authenticatedOwnershipReference: string;
  operationOwnershipReference: string;
}>;
export type MediaExecutionPolicy = Readonly<{
  policyVersion: "1.0";
  allowedOperations: readonly MediaOperationClassification[];
  maximumInputArtifacts: number;
  cancellation: ExecutionCancellationProjection;
  timeout: ExecutionTimeoutProjection;
}>;
export type MediaExecutionInput = Readonly<{
  inputVersion: "1.0";
  request: MediaExecutionRequest;
  context: MediaExecutionContext;
  policy: MediaExecutionPolicy;
}>;

export type MediaExecutionIssueCode =
  | "input-malformed" | "request-missing" | "identity-missing"
  | "operation-unsupported" | "input-artifact-missing"
  | "input-artifact-invalid" | "input-artifact-duplicate"
  | "context-missing" | "policy-invalid";
export type MediaExecutionReasonCode =
  | "execution-completed" | "execution-accepted" | "execution-rejected"
  | "execution-failed" | "execution-unavailable" | "execution-cancelled"
  | "execution-timed-out" | "execution-invalid" | "ownership-mismatch"
  | "policy-violation" | "workspace-failure" | "materialization-failure"
  | "process-failure" | "packaging-failure" | "cleanup-failure";
export type MediaExecutionValidation =
  | Readonly<{ status: "valid" }>
  | Readonly<{ status: "invalid"; issues: readonly Readonly<{ sequence: number; issueCode: MediaExecutionIssueCode }>[] }>;

export type WorkspacePreparationResult =
  | Readonly<{ status: "completed"; workspace: ExecutionWorkspaceReference }>
  | Readonly<{ status: "rejected" | "unavailable"; reasonCode: "workspace-failure" }>;
export type InputMaterializationResult =
  | Readonly<{ status: "completed"; artifacts: readonly InputArtifactReference[] }>
  | Readonly<{ status: "rejected" | "unavailable"; reasonCode: "materialization-failure" }>;
export type MediaProcessResult =
  | Readonly<{ status: "completed" | "accepted"; outputs: readonly OutputArtifactReference[]; cleanupRequired: boolean }>
  | Readonly<{ status: "failed" | "rejected" | "unavailable" | "cancelled" | "timed-out"; reasonCode: "process-failure"; cleanupRequired: boolean }>;
export type PackagingResult =
  | Readonly<{ status: "completed"; packageArtifact: PackageArtifactReference }>
  | Readonly<{ status: "failed" | "rejected" | "unavailable"; reasonCode: "packaging-failure" }>;
export type CleanupResult =
  | Readonly<{ status: "completed" }>
  | Readonly<{ status: "failed" | "unavailable"; reasonCode: "cleanup-failure" }>;

export type WorkspaceCapability = Readonly<{
  prepareWorkspace(input: MediaExecutionInput): WorkspacePreparationResult | Promise<WorkspacePreparationResult>;
}>;
export type InputMaterializationCapability = Readonly<{
  materializeInput(input: Readonly<{ request: MediaExecutionRequest; workspace: ExecutionWorkspaceReference }>): InputMaterializationResult | Promise<InputMaterializationResult>;
}>;
export type MediaProcessCapability = Readonly<{
  executeMediaOperation(input: Readonly<{
    operation: MediaOperationClassification;
    workspace: ExecutionWorkspaceReference;
    artifacts: readonly InputArtifactReference[];
    cancellation: ExecutionCancellationProjection;
    timeout: ExecutionTimeoutProjection;
  }>): MediaProcessResult | Promise<MediaProcessResult>;
}>;
export type PackagingCapability = Readonly<{
  packageArtifacts(input: Readonly<{
    workspace: ExecutionWorkspaceReference;
    artifacts: readonly OutputArtifactReference[];
  }>): PackagingResult | Promise<PackagingResult>;
}>;
export type CleanupCapability = Readonly<{
  cleanupExecution(input: Readonly<{ workspace: ExecutionWorkspaceReference }>): CleanupResult | Promise<CleanupResult>;
}>;

export type MediaExecutionAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stage: MediaExecutionStage;
  operation: MediaOperationClassification;
  classification: MediaExecutionClassification;
  reasonCode: MediaExecutionReasonCode;
  cleanupClassification: CleanupClassification;
  retryClassification: ExecutionRetryProjection;
}>;
export type MediaExecutionAudit = Readonly<{
  auditVersion: "1.0"; entries: readonly MediaExecutionAuditEntry[];
}>;
export type MediaExecutionDecision = Readonly<{
  decisionVersion: "1.0";
  operation: MediaOperationClassification;
  classification: MediaExecutionClassification;
  reasonCode: MediaExecutionReasonCode;
  outputArtifactCount: number;
  packageArtifactAvailable: boolean;
  retryClassification: ExecutionRetryProjection;
  cleanupClassification: CleanupClassification;
  outputArtifacts: readonly OutputArtifactReference[];
  packageArtifact?: PackageArtifactReference;
  audit: MediaExecutionAudit;
}>;
