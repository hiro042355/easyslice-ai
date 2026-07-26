import type { FFmpegProcessCapability } from "../ffmpegProcess/types";
import type { InputMaterializationCapability } from "../inputMaterialization/types";
import type { MediaExecutionCompositionCapability } from "../mediaExecutionComposition/types";
import type { WorkspaceCapability } from "../workspace/types";
import type { PackagingCapability } from "../zipPackaging/types";

export type MediaExecutionRuntimeBindingDependencies = Readonly<{
  workspace: WorkspaceCapability;
  materialization: InputMaterializationCapability;
  ffmpeg: FFmpegProcessCapability;
  packaging: PackagingCapability;
}>;

export type MediaExecutionRuntimeBindingFailureClassification =
  | "missing-workspace"
  | "missing-materialization"
  | "missing-ffmpeg"
  | "missing-packaging"
  | "invalid-dependency"
  | "construction-failed"
  | "unexpected-failure";

export type MediaExecutionRuntimeBindingAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stage: "dependency-validation" | "composition-construction" | "capability-projection";
  outcome: "accepted" | "rejected" | "bound";
  reasonCode: string;
}>;

export type MediaExecutionRuntimeBindingAudit = Readonly<{
  auditVersion: "1.0";
  entries: readonly MediaExecutionRuntimeBindingAuditEntry[];
}>;

export type MediaExecutionRuntimeBindingResult =
  | Readonly<{
      resultVersion: "1.0";
      status: "bound";
      composition: MediaExecutionCompositionCapability;
      audit: MediaExecutionRuntimeBindingAudit;
    }>
  | Readonly<{
      resultVersion: "1.0";
      status: "rejected";
      classification: MediaExecutionRuntimeBindingFailureClassification;
      audit: MediaExecutionRuntimeBindingAudit;
    }>;

export type MediaExecutionRuntimeBindingCapability = Readonly<{
  createComposition(dependencies: unknown): MediaExecutionRuntimeBindingResult;
}>;
