import type {
  InputMaterializationCapability,
  InputMaterializationContext,
  InputMaterializationRequest,
} from "../inputMaterialization/types";
import type {
  FFmpegProcessCapability,
  FFmpegProcessRequest,
} from "../ffmpegProcess/types";
import type {
  ArchiveProjection,
  PackagingCapability,
  PackagingRequest,
} from "../zipPackaging/types";
import type {
  WorkspaceCapability,
  WorkspacePreparationRequest,
} from "../workspace/types";

export type MediaExecutionCompositionStage =
  | "dependency-validation"
  | "workspace-reservation"
  | "input-materialization"
  | "ffmpeg-execution"
  | "zip-packaging"
  | "response-representation"
  | "workspace-cleanup"
  | "final-decision";

export type MediaExecutionCompositionClassification =
  | "completed"
  | "failed"
  | "unavailable"
  | "cancelled"
  | "timed-out"
  | "invalid";

export type MediaExecutionCompositionReasonCode =
  | "execution-completed"
  | "dependency-missing"
  | "workspace-unavailable"
  | "materialization-failed"
  | "ffmpeg-failed"
  | "packaging-failed"
  | "response-representation-failed"
  | "dependency-failure";

export type MediaExecutionCleanupClassification =
  | "not-required"
  | "completed"
  | "failed"
  | "unavailable";

export type ResponseOwnedArchive = Uint8Array;

export type ResponseRepresentationCapability = Readonly<{
  readArchive(archive: ArchiveProjection): ResponseOwnedArchive | Promise<ResponseOwnedArchive>;
}>;

export type MediaExecutionCompositionDependencies = Readonly<{
  workspace: WorkspaceCapability;
  materialization: InputMaterializationCapability;
  ffmpeg: FFmpegProcessCapability;
  packaging: PackagingCapability;
  responseRepresentation: ResponseRepresentationCapability;
}>;

export type MediaExecutionCompositionInput = Readonly<{
  inputVersion: "1.0";
  workspaceRequest: WorkspacePreparationRequest;
  materializationRequest: InputMaterializationRequest;
  materializationContext: InputMaterializationContext;
  ffmpegRequest: FFmpegProcessRequest;
  packagingRequest: PackagingRequest;
}>;

export type MediaExecutionCompositionAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stage: MediaExecutionCompositionStage;
  classification: MediaExecutionCompositionClassification;
  reasonCode: MediaExecutionCompositionReasonCode;
  cleanupClassification: MediaExecutionCleanupClassification;
}>;

export type MediaExecutionCompositionDecision = Readonly<{
  decisionVersion: "1.0";
  classification: MediaExecutionCompositionClassification;
  reasonCode: MediaExecutionCompositionReasonCode;
  cleanupClassification: MediaExecutionCleanupClassification;
  responseArchive?: ResponseOwnedArchive;
  audit: Readonly<{
    auditVersion: "1.0";
    entries: readonly MediaExecutionCompositionAuditEntry[];
  }>;
}>;

export type MediaExecutionCompositionCapability = Readonly<{
  execute(input: MediaExecutionCompositionInput): Promise<MediaExecutionCompositionDecision>;
}>;
