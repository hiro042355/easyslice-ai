import type { AssetResolutionExecutionResult, ResolvedAsset } from "@/lib/assets/types";
import type { OperationPipelineIssue, OperationPipelineReasonCode, OperationResumePipelineAudit, OperationResumePipelineStatus, ReadyAssetProjectionInput, ReadyAssetProjectionResult } from "./referenceOperationResumeTypes";

export const copy = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));
export const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as object)) freeze(child);
  }
  return value;
};
export const validOpaque = (value: unknown, maximum = 128): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maximum &&
  !/[\r\n]/.test(value) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value);
export const validIso = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.000Z$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]! && hour < 24 && minute < 60 && second < 60;
};

export const order: readonly OperationPipelineReasonCode[] = [
  "adapter-request-record-missing", "adapter-request-record-expired", "adapter-request-record-deleted",
  "adapter-request-unauthorized", "adapter-request-schema-mismatch", "adapter-request-adapter-mismatch",
  "adapter-request-operation-mismatch", "adapter-request-resolution-failed", "ready-asset-projection-failed",
  "materializer-binding-missing", "materializer-binding-retired", "materialization-failed",
  "transport-bridge-failed", "credential-invalid", "provider-submit-failed", "generation-acceptance-unknown",
  "response-normalization-failed", "provider-output-reference-invalid", "expected-output-invalid",
  "output-ingestion-failed", "output-ingestion-partial", "operation-pipeline-completed", "reconciliation-required",
];
export const reasons = (values: readonly OperationPipelineReasonCode[]) => order.filter((value) => new Set(values).has(value));
export const issue = (reasonCode: OperationPipelineReasonCode, classification: OperationPipelineIssue["classification"] = "failed", retryable = false): OperationPipelineIssue => ({ reasonCode, classification, retryable });
export const audit = (status: OperationResumePipelineStatus, operation: OperationResumePipelineAudit["operation"], reasonCodes: readonly OperationPipelineReasonCode[], fields: Partial<OperationResumePipelineAudit> = {}): OperationResumePipelineAudit => ({ auditVersion: "1.0", status, operation, ...copy(fields), reasonCodes: reasons(reasonCodes) });

const validAsset = (asset: unknown): asset is ResolvedAsset => {
  if (!asset || typeof asset !== "object") return false;
  const value = asset as ResolvedAsset;
  return !!value.assetRef && validOpaque(value.assetRef.assetId, 256) &&
    (value.requirement === "required" || value.requirement === "optional") && typeof value.usage === "string" &&
    value.access?.mode === "provider-native-asset" && validOpaque(value.access.handle, 512) &&
    Number.isSafeInteger(value.sizeBytes) && value.sizeBytes >= 0 && !!value.metadata && !!value.integrity;
};

export function projectReadyAssetsToMaterializerResolution(raw: ReadyAssetProjectionInput): ReadyAssetProjectionResult {
  if (!raw || raw.projectionVersion !== "1.0" || !["generate-vocal", "generate-music", "generate-mv"].includes(raw.operation) ||
      (raw.pollStatus !== "ready" && raw.pollStatus !== "degraded") || !Number.isSafeInteger(raw.pollRevision) || raw.pollRevision < 1 ||
      !Array.isArray(raw.assets) || raw.assets.some((asset) => !validAsset(asset))) {
    return { status: "invalid", issues: [issue("ready-asset-projection-failed", "invalid")] };
  }
  if (raw.pollStatus === "degraded") {
    return { status: "unsupported-degraded", issues: [issue("ready-asset-projection-failed", "unavailable")] };
  }
  const assets = copy(raw.assets);
  const requiredCount = assets.filter((asset) => asset.requirement === "required").length;
  const resolution = {
    status: "resolved", assets, warnings: [],
    audit: {
      requiredCount, optionalCount: assets.length - requiredCount, resolvedCount: assets.length, omittedCount: 0,
      kinds: assets.map((asset) => asset.assetRef.kind), usages: assets.map((asset) => asset.usage),
      transferModes: assets.map(() => "provider-native-asset"), ttlClasses: [],
      metadataComplete: assets.every((asset) => !!asset.metadata),
      checksumVerified: assets.every((asset) => asset.integrity.checksumVerified),
      status: "resolved", reasonCodes: [],
    },
  } as unknown as AssetResolutionExecutionResult;
  return { status: "projected", resolution } as ReadyAssetProjectionResult;
}

export const protectedFingerprint = (...values: string[]) => {
  let hash = 2166136261;
  for (const value of values) for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `[operation-pipeline-${(hash >>> 0).toString(16)}]`;
};
