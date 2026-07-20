import { addSecondsToReferenceIso, deepCopy, isFiniteNonNegativeInteger, isSafeOpaqueId, issue, metadataIsValid, normalizeAssetResolutionError, normalizeMimeType, unique } from "./assetResolverUtils";
import type { AssetMetadata, AssetRecord, AssetResolutionAudit, AssetResolutionErrorCategory, AssetResolutionExecutionContext, AssetResolutionExecutionResult, AssetResolutionExecutor, AssetResolutionIssue, AssetResolutionPlan, AssetResolutionPlanItem, AssetResolutionReasonCode, AssetResolutionStatus, ReferenceAssetInspection, ReferenceAssetStore, ResolvedAsset, ResolvedAssetAccess } from "./types";
import { getReferenceAssetStoreFixture } from "./referenceAssetFixtureCatalog";

type Fixture = { record?: AssetRecord; inspection?: ReferenceAssetInspection };
const checksum = "sha256:reference-fixture";
const record = (assetId: string, kind: AssetRecord["kind"], mimeType: string, metadata: AssetMetadata, overrides: Partial<AssetRecord> = {}): AssetRecord => ({ schemaVersion: "1.0", assetId, kind, mimeType, sizeBytes: 1024, checksum, metadata, storageLocator: { locatorVersion: "1.0", locatorId: `opaque-${assetId}` }, status: "available", region: "reference-region", retentionClass: "project", integrityState: "verified", ...overrides } as AssetRecord);
const inspection = (mimeType: string, overrides: Partial<ReferenceAssetInspection> = {}): ReferenceAssetInspection => ({ contentType: mimeType, detectedMimeType: mimeType, actualSizeBytes: 1024, actualChecksum: checksum, ...overrides });
const audio = { type: "audio", durationSeconds: 30, sampleRateHz: 48000, channels: 2, codec: "reference-codec" } as const;
const image = { type: "image", width: 1280, height: 720, orientation: 1, hasAlpha: false } as const;
const video = { type: "video", durationSeconds: 30, width: 1280, height: 720, frameRate: 30, codec: "reference-codec" } as const;
const statusFixture = (id: string, status: AssetRecord["status"]): Fixture => ({ record: record(id, "audio", "audio/wav", audio, { status }), inspection: inspection("audio/wav") });
const catalogFixture = (key: "fixture-audio" | "fixture-image" | "fixture-video"): Fixture => {
  const value = getReferenceAssetStoreFixture(key);
  if (!value) throw new Error("reference-asset-fixture-catalog-invalid");
  return { record: value.record, inspection: value.inspection };
};
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
};

const FIXTURES: Readonly<Record<string, Fixture>> = deepFreeze({
  "fixture-audio": catalogFixture("fixture-audio"),
  "fixture-image": catalogFixture("fixture-image"),
  "fixture-video": catalogFixture("fixture-video"),
  "fixture-processing": statusFixture("fixture-processing", "processing"), "fixture-pending-scan": statusFixture("fixture-pending-scan", "pending-scan"),
  "fixture-quarantined": statusFixture("fixture-quarantined", "quarantined"), "fixture-blocked": statusFixture("fixture-blocked", "blocked"),
  "fixture-corrupted": statusFixture("fixture-corrupted", "corrupted"), "fixture-deleted": statusFixture("fixture-deleted", "deleted"), "fixture-expired": statusFixture("fixture-expired", "expired"), "fixture-missing-status": statusFixture("fixture-missing-status", "missing"),
  "fixture-checksum-mismatch": { record: record("fixture-checksum-mismatch", "audio", "audio/wav", audio), inspection: inspection("audio/wav", { actualChecksum: "sha256:different" }) },
  "fixture-mime-mismatch": { record: record("fixture-mime-mismatch", "audio", "audio/wav", audio), inspection: inspection("audio/mpeg") },
  "fixture-missing-metadata": { record: record("fixture-missing-metadata", "audio", "audio/wav", { type: "audio" }), inspection: inspection("audio/wav") },
  "fixture-oversized": { record: record("fixture-oversized", "video", "video/mp4", video, { sizeBytes: 999999 }), inspection: inspection("video/mp4", { actualSizeBytes: 999999 }) },
  "fixture-unverified": { record: record("fixture-unverified", "audio", "audio/wav", audio, { integrityState: "unverified" }), inspection: inspection("audio/wav") },
  "fixture-invalid-version": { record: { ...record("fixture-invalid-version", "audio", "audio/wav", audio), schemaVersion: "2.0" as "1.0" }, inspection: inspection("audio/wav") },
  "fixture-partial": { record: record("fixture-partial", "audio", "audio/wav", audio), inspection: inspection("audio/wav", { actualSizeBytes: 512 }) },
});

export function createReferenceAssetStore(): ReferenceAssetStore {
  return { async getRecord(assetId) { return deepCopy(FIXTURES[assetId]?.record ?? getReferenceAssetStoreFixture(assetId)?.record); }, async getInspection(assetId) { return deepCopy(FIXTURES[assetId]?.inspection ?? getReferenceAssetStoreFixture(assetId)?.inspection); } };
}

export const REFERENCE_ASSET_EXECUTION_CONTEXT: AssetResolutionExecutionContext = Object.freeze({ executionContractVersion: "1.0", storageClientVersion: "reference-v1", metadataSchemaVersion: "1.0", baseTimeIso: "2030-01-01T00:00:00.000Z", policyContext: Object.freeze({ policyVersion: "policy-v1", sourceRegion: "reference-region", destinationRegion: "reference-region", retentionClass: "project", externalTransferAllowed: true, providerTrainingAllowed: false, deletionPending: false }) });

const availabilityIssue = (status: AssetRecord["status"], index: number, item: AssetResolutionPlanItem): AssetResolutionIssue | undefined => {
  const map: Partial<Record<AssetRecord["status"], [AssetResolutionReasonCode, AssetResolutionIssue["classification"], boolean]>> = {
    processing: ["asset-processing", "unavailable", true], "pending-scan": ["asset-pending-scan", "unavailable", true], quarantined: ["asset-quarantined", "policy", false], blocked: ["asset-blocked", "policy", false], corrupted: ["asset-corrupted", "integrity", false], deleted: ["asset-deleted", "unavailable", false], expired: ["asset-expired", "unavailable", false], missing: ["asset-not-available", "unavailable", false],
  };
  const found = map[status]; return found ? issue(found[0], found[1], found[2], index, item.usage, item.assetRef.kind) : undefined;
};

function validateRecord(recordValue: AssetRecord | undefined, inspected: ReferenceAssetInspection | undefined, item: AssetResolutionPlanItem, context: AssetResolutionExecutionContext, index: number): AssetResolutionIssue | undefined {
  if (!recordValue) return issue("asset-not-found", "unavailable", false, index, item.usage, item.assetRef.kind);
  if (recordValue.schemaVersion !== "1.0") return issue("asset-record-version-unsupported", "validation", false, index, item.usage, item.assetRef.kind);
  const unavailable = availabilityIssue(recordValue.status, index, item); if (unavailable) return unavailable;
  if (!isSafeOpaqueId(recordValue.assetId) || !isSafeOpaqueId(recordValue.storageLocator?.locatorId) || recordValue.storageLocator?.locatorVersion !== "1.0" || !isFiniteNonNegativeInteger(recordValue.sizeBytes)) return issue("asset-not-available", "unavailable", false, index, item.usage, item.assetRef.kind);
  if (recordValue.kind !== item.assetRef.kind) return issue("asset-kind-mismatch", "validation", false, index, item.usage, item.assetRef.kind);
  const rawMimeValues = [item.assetRef.mimeType, recordValue.mimeType, inspected?.contentType, inspected?.detectedMimeType].filter((v): v is string => v !== undefined);
  const mimeValues = rawMimeValues.map(normalizeMimeType);
  const canonicalMime = normalizeMimeType(recordValue.mimeType);
  const expectedCategory = item.assetRef.kind === "video" ? "video" : item.assetRef.kind === "image" || item.assetRef.kind === "character" || item.assetRef.kind === "brand" ? "image" : "audio";
  const genericBinaryAllowed = canonicalMime === "application/octet-stream" && item.requiredMimeTypes.includes(canonicalMime);
  if (mimeValues.some(v => v === undefined) || unique(mimeValues).length !== 1 || (!genericBinaryAllowed && !canonicalMime?.startsWith(`${expectedCategory}/`)) || (canonicalMime === "application/octet-stream" && !genericBinaryAllowed) || (item.requiredMimeTypes.length && !item.requiredMimeTypes.includes(canonicalMime!))) return issue("mime-type-mismatch", "integrity", false, index, item.usage, item.assetRef.kind);
  if (!inspected || inspected.actualSizeBytes !== recordValue.sizeBytes || (item.maxSizeBytes !== undefined && recordValue.sizeBytes > item.maxSizeBytes)) return issue("asset-size-exceeded", "integrity", false, index, item.usage, item.assetRef.kind);
  if (!metadataIsValid(recordValue.metadata, recordValue.kind)) return issue("metadata-missing", "metadata", false, index, item.usage, item.assetRef.kind);
  if (item.requiredMetadata.includes("duration") && !("durationSeconds" in recordValue.metadata && typeof recordValue.metadata.durationSeconds === "number" && recordValue.metadata.durationSeconds > 0)) return issue("duration-metadata-missing", "metadata", false, index, item.usage, item.assetRef.kind);
  if (item.requiredMetadata.includes("dimensions") && !("width" in recordValue.metadata && "height" in recordValue.metadata && typeof recordValue.metadata.width === "number" && recordValue.metadata.width > 0 && typeof recordValue.metadata.height === "number" && recordValue.metadata.height > 0)) return issue("dimensions-metadata-missing", "metadata", false, index, item.usage, item.assetRef.kind);
  if (recordValue.integrityState !== "verified") return issue(recordValue.integrityState === "failed" ? "asset-corrupted" : "asset-integrity-unverified", "integrity", false, index, item.usage, item.assetRef.kind);
  if (item.requireChecksum && !recordValue.checksum) return issue("checksum-missing", "integrity", false, index, item.usage, item.assetRef.kind);
  if ((item.assetRef.checksum && item.assetRef.checksum !== recordValue.checksum) || (recordValue.checksum && inspected.actualChecksum !== recordValue.checksum)) return issue("checksum-mismatch", "integrity", false, index, item.usage, item.assetRef.kind);
  const policy = context.policyContext;
  if (policy.deletionPending) return issue("deletion-pending", "policy", false, index, item.usage, item.assetRef.kind);
  if (item.transferMode !== "internal-stream" && !policy.externalTransferAllowed) return issue("external-transfer-blocked", "policy", false, index, item.usage, item.assetRef.kind);
  if (recordValue.region && policy.sourceRegion && recordValue.region !== policy.sourceRegion) return issue("region-policy-blocked", "policy", false, index, item.usage, item.assetRef.kind);
  if (policy.sourceRegion && policy.destinationRegion && policy.sourceRegion !== policy.destinationRegion) return issue("region-policy-blocked", "policy", false, index, item.usage, item.assetRef.kind);
}

function accessFor(item: AssetResolutionPlanItem, expiresAt: string): ResolvedAssetAccess {
  if (item.transferMode === "provider-fetch") return { mode: "signed-url", url: "[mock-secret-access]", expiresAt };
  if (item.transferMode === "nexcut-upload") return { mode: "provider-upload", uploadSourceToken: "[mock-secret-access]", expiresAt };
  if (item.transferMode === "provider-native-asset") return { mode: "provider-native-asset", handle: "[mock-secret-access]", expiresAt };
  return { mode: "internal-stream", streamToken: "[mock-secret-access]", expiresAt };
}

function makeAudit(plan: AssetResolutionPlan, status: AssetResolutionStatus, resolved: ResolvedAsset[], issues: AssetResolutionIssue[]): AssetResolutionAudit {
  return { requiredCount: plan.items.filter(v => v.requirement === "required").length, optionalCount: plan.items.filter(v => v.requirement === "optional").length, resolvedCount: resolved.length, omittedCount: plan.items.length - resolved.length, kinds: unique(plan.items.map(v => v.assetRef.kind)), usages: unique(plan.items.map(v => v.usage)), transferModes: unique(plan.items.map(v => v.transferMode)), ttlClasses: unique(plan.items.map(v => v.ttlClass)), metadataComplete: issues.every(v => v.classification !== "metadata"), checksumVerified: resolved.every(v => v.integrity.checksumVerified), status, reasonCodes: unique(issues.map(v => v.reasonCode)) };
}

export function createReferenceAssetResolutionExecutor(store: ReferenceAssetStore): AssetResolutionExecutor {
  return { async execute(plan, context) {
    // cancellationStage is a deterministic test seam, not a promise that an in-flight
    // storage operation can be interrupted. A production Storage Client owns AbortSignal.
    const early: AssetResolutionIssue[] = [];
    if (plan.planVersion !== "1.0" || plan.resolverVersion !== "rule-v1" || !Array.isArray(plan.items)) early.push(issue("asset-record-version-unsupported", "validation"));
    if (context.executionContractVersion !== "1.0" || context.storageClientVersion !== "reference-v1" || context.metadataSchemaVersion !== "1.0" || !context.policyContext) early.push(issue("asset-record-version-unsupported", "validation"));
    if (context.cancellationStage === "before-execution") early.push(issue("cancelled", "execution"));
    if (early.length) return deepCopy({ status: "failed", issues: early, warnings: plan.warnings ?? [], audit: makeAudit(plan, "failed", [], early) }) as AssetResolutionExecutionResult;
    const resolved: ResolvedAsset[] = []; const issues: AssetResolutionIssue[] = [];
    for (const [index, item] of plan.items.entries()) {
      if (context.cancellationStage === "record-lookup") { issues.push(issue("cancelled", "execution", false, index, item.usage, item.assetRef.kind)); break; }
      let found: AssetRecord | undefined; let inspected: ReferenceAssetInspection | undefined;
      try { found = await store.getRecord(item.assetRef.assetId); inspected = await store.getInspection(item.assetRef.assetId); } catch { issues.push(issue("asset-not-available", "execution", true, index, item.usage, item.assetRef.kind)); continue; }
      const invalid = validateRecord(found, inspected, item, context, index); if (invalid) { issues.push(invalid); continue; }
      if (context.cancellationStage === "access-generation") { issues.push(issue("cancelled", "execution", false, index, item.usage, item.assetRef.kind)); break; }
      const metadata = found!.metadata;
      resolved.push({ assetRef: deepCopy(item.assetRef), usage: item.usage, requirement: item.requirement, access: accessFor(item, addSecondsToReferenceIso(context.baseTimeIso, item.ttlSeconds)), sizeBytes: found!.sizeBytes, metadata: { type: metadata.type, durationPresent: "durationSeconds" in metadata && typeof metadata.durationSeconds === "number", dimensionsPresent: "width" in metadata && "height" in metadata && typeof metadata.width === "number" && typeof metadata.height === "number" }, integrity: { checksumVerified: Boolean(found!.checksum && inspected!.actualChecksum === found!.checksum), ...(found!.checksum ? { checksumAlgorithm: "sha256" as const } : {}), sizeVerified: true } });
    }
    const failedRequired = issues.some(v => v.itemIndex !== undefined && plan.items[v.itemIndex]?.requirement === "required");
    const policyBlocked = failedRequired && issues.some(v => v.classification === "policy");
    if (failedRequired) {
      const enriched = [...issues, issue("required-asset-unresolved", policyBlocked ? "policy" : "execution")];
      const status = policyBlocked ? "policy-blocked" : "failed";
      return deepCopy({ status, issues: enriched, warnings: plan.warnings, audit: makeAudit(plan, status, [], enriched) }) as AssetResolutionExecutionResult;
    }
    if (issues.length) {
      const enriched = [...issues, ...issues.map(v => issue("optional-asset-omitted", v.classification, v.retryable, v.itemIndex, v.usage, v.kind))];
      return deepCopy({ status: "degraded", assets: resolved, issues: enriched, warnings: plan.warnings, audit: makeAudit(plan, "degraded", resolved, enriched) }) as AssetResolutionExecutionResult;
    }
    return deepCopy({ status: "resolved", assets: resolved, warnings: plan.warnings, audit: makeAudit(plan, "resolved", resolved, []) }) as AssetResolutionExecutionResult;
  } };
}

export { normalizeAssetResolutionError };
export const normalizeReferenceAssetError = (category: AssetResolutionErrorCategory) => normalizeAssetResolutionError(category);
