import type { AssetKind, AssetReference } from "@/lib/mvContracts";

export type { AssetKind, AssetReference } from "@/lib/mvContracts";

export type AssetRecordSchemaVersion = "1.0";
export type InternalStorageLocator = { locatorVersion: "1.0"; locatorId: string };
export type AssetAvailabilityStatus = "available" | "processing" | "pending-scan" | "quarantined" | "blocked" | "corrupted" | "deleted" | "expired" | "missing";
export type AssetRetentionClass = "ephemeral" | "project" | "export" | "legal-hold";
export type AssetSensitivityClass = "standard" | "personal" | "voice" | "child-related" | "sensitive";
export type AssetIntegrityState = "verified" | "unverified" | "failed";

export type AudioAssetMetadata = { type: "audio"; durationSeconds?: number; sampleRateHz?: number; channels?: number; codec?: string };
export type VideoAssetMetadata = { type: "video"; durationSeconds?: number; width?: number; height?: number; frameRate?: number; codec?: string };
export type ImageAssetMetadata = { type: "image"; width?: number; height?: number; orientation?: number; hasAlpha?: boolean };
export type AssetMetadata = AudioAssetMetadata | VideoAssetMetadata | ImageAssetMetadata;

type AssetRecordBase = {
  schemaVersion: AssetRecordSchemaVersion; assetId: string; mimeType: string;
  sizeBytes: number; checksum?: string; storageLocator: InternalStorageLocator;
  status: AssetAvailabilityStatus; region?: string; retentionClass?: AssetRetentionClass;
  integrityState: AssetIntegrityState;
};
export type AssetRecord = AssetRecordBase & (
  | { kind: "audio" | "voice" | "melody"; metadata: AudioAssetMetadata }
  | { kind: "video"; metadata: VideoAssetMetadata }
  | { kind: "image" | "character" | "brand"; metadata: ImageAssetMetadata }
);

export type AssetRequirement = "required" | "optional";
export type AssetUsage = "audio-conditioning" | "reference-image" | "reference-video" | "character-identity" | "location-reference" | "guide-vocal" | "guide-melody" | "lyrics-input" | "preview-source" | "export-source";
export type AssetResolutionPurpose = "vocal-generation" | "music-generation" | "mv-generation" | "provider-upload" | "preview" | "export";
export type ProviderAssetTransferMode = "provider-fetch" | "nexcut-upload" | "provider-native-asset" | "internal-stream";
export type AssetTtlClass = "image-short" | "audio-standard" | "video-long" | "stream-short";
export type AssetMetadataRequirement = "duration" | "dimensions";

export type AssetAccessRequirements = { preferredMode: ProviderAssetTransferMode; allowedModes?: readonly ProviderAssetTransferMode[]; requiredMimeTypes?: readonly string[]; maxSizeBytes?: number; requireChecksum?: boolean; requireDurationMetadata?: boolean; requireDimensions?: boolean; requestedTtlSeconds?: number };
export type AssetPolicyContext = { policyVersion: string; sourceRegion?: string; destinationRegion?: string; dataResidencyClass?: string; sensitivityClass?: AssetSensitivityClass; retentionClass?: AssetRetentionClass; externalTransferAllowed: boolean; providerTrainingAllowed?: boolean; deletionPending?: boolean };
export type AssetResolutionRequestItem = { assetRef: AssetReference; requirement: AssetRequirement; usage: AssetUsage };
export type AssetResolutionInput = { contractVersion: "1.0"; items: readonly AssetResolutionRequestItem[]; purpose: AssetResolutionPurpose; accessRequirements: AssetAccessRequirements; policyContext: AssetPolicyContext };

export type AssetResolutionReasonCode =
  | "contract-version-unsupported" | "input-shape-invalid" | "purpose-unsupported" | "policy-version-unsupported" | "policy-context-invalid" | "access-requirements-invalid" | "items-invalid" | "asset-reference-invalid" | "requirement-invalid" | "usage-invalid" | "duplicate-asset-conflict" | "duplicate-item-normalized"
  | "asset-record-version-unsupported" | "asset-not-found" | "asset-not-available" | "asset-processing" | "asset-pending-scan" | "asset-quarantined" | "asset-blocked" | "asset-deleted" | "asset-expired" | "asset-corrupted" | "asset-integrity-unverified" | "asset-kind-mismatch" | "mime-type-mismatch" | "asset-size-exceeded" | "checksum-mismatch" | "checksum-missing" | "metadata-missing" | "duration-metadata-missing" | "dimensions-metadata-missing" | "external-transfer-blocked" | "region-policy-blocked" | "deletion-pending" | "retention-expired" | "access-mode-unsupported" | "provider-upload-required" | "media-preparation-required" | "signed-url-generation-failed" | "signed-url-ttl-adjusted" | "optional-asset-omitted" | "required-asset-unresolved" | "cancelled";
export type AssetResolutionIssueClassification = "validation" | "unavailable" | "policy" | "integrity" | "metadata" | "execution";
export type AssetResolutionIssue = { reasonCode: AssetResolutionReasonCode; classification: AssetResolutionIssueClassification; itemIndex?: number; usage?: AssetUsage; kind?: AssetKind; retryable: boolean };
export type AssetResolutionWarning = { reasonCode: AssetResolutionReasonCode; itemIndex?: number; usage?: AssetUsage; kind?: AssetKind };

export type AssetResolutionPlanItem = { assetRef: AssetReference; requirement: AssetRequirement; usage: AssetUsage; transferMode: ProviderAssetTransferMode; ttlClass: AssetTtlClass; ttlSeconds: number; requiredMetadata: readonly AssetMetadataRequirement[]; requireChecksum: boolean; requiredMimeTypes: readonly string[]; maxSizeBytes?: number };
export type AssetResolutionPlan = { planVersion: "1.0"; resolverVersion: "rule-v1"; purpose: AssetResolutionPurpose; items: AssetResolutionPlanItem[]; warnings: AssetResolutionWarning[] };
export type AssetResolutionPlanStatus = "planned" | "invalid";
export type AssetResolutionPlanResult = { status: "planned"; plan: AssetResolutionPlan; issues: [] } | { status: "invalid"; issues: AssetResolutionIssue[] };

export type AssetResolutionStatus = "resolved" | "degraded" | "policy-blocked" | "failed";
export type AssetResolutionErrorCategory = "not-found" | "unavailable" | "policy-blocked" | "integrity-failed" | "metadata-invalid" | "storage-authentication" | "storage-rate-limit" | "storage-timeout" | "storage-unavailable" | "signed-access-failed" | "cancelled" | "unknown";
export type NormalizedAssetResolutionError = { category: AssetResolutionErrorCategory; message: string; retryable: boolean };
export type ResolvedAssetMetadata = { type: AssetMetadata["type"]; durationPresent: boolean; dimensionsPresent: boolean };
export type ResolvedAssetIntegrity = { checksumVerified: boolean; checksumAlgorithm?: "sha256"; sizeVerified: boolean };
export type ResolvedAssetAccess = { mode: "signed-url"; url: string; expiresAt: string } | { mode: "internal-stream"; streamToken: string; expiresAt: string } | { mode: "provider-upload"; uploadSourceToken: string; expiresAt: string } | { mode: "provider-native-asset"; handle: string; expiresAt?: string };
export type ResolvedAsset = { assetRef: AssetReference; usage: AssetUsage; requirement: AssetRequirement; access: ResolvedAssetAccess; sizeBytes: number; metadata: ResolvedAssetMetadata; integrity: ResolvedAssetIntegrity };
export type AssetResolutionAudit = { requiredCount: number; optionalCount: number; resolvedCount: number; omittedCount: number; kinds: readonly AssetKind[]; usages: readonly AssetUsage[]; transferModes: readonly ProviderAssetTransferMode[]; ttlClasses: readonly AssetTtlClass[]; metadataComplete: boolean; checksumVerified: boolean; status: AssetResolutionStatus; reasonCodes: AssetResolutionReasonCode[] };

declare const sensitiveBrand: unique symbol;
/** Compile-time marker only. It does not prevent JSON serialization; never log this value. */
export type Sensitive<T> = T & { readonly [sensitiveBrand]: true };
type ExecutionResult = { status: "resolved"; assets: ResolvedAsset[]; warnings: AssetResolutionWarning[]; audit: AssetResolutionAudit } | { status: "degraded"; assets: ResolvedAsset[]; issues: AssetResolutionIssue[]; warnings: AssetResolutionWarning[]; audit: AssetResolutionAudit } | { status: "policy-blocked" | "failed"; issues: AssetResolutionIssue[]; warnings: AssetResolutionWarning[]; audit: AssetResolutionAudit };
export type AssetResolutionExecutionResult = Sensitive<ExecutionResult>;
export type AssetResolutionCancellationStage = "before-execution" | "record-lookup" | "access-generation";
export type AssetResolutionExecutionContext = { executionContractVersion: "1.0"; storageClientVersion: "reference-v1"; metadataSchemaVersion: "1.0"; baseTimeIso: string; policyContext: AssetPolicyContext; cancellationStage?: AssetResolutionCancellationStage };
export type AssetResolutionExecutor = { execute(plan: AssetResolutionPlan, context: AssetResolutionExecutionContext): Promise<AssetResolutionExecutionResult> };
export type ReferenceAssetInspection = { contentType?: string; detectedMimeType?: string; actualSizeBytes: number; actualChecksum?: string };
export type ReferenceAssetStore = { getRecord(assetId: string): Promise<AssetRecord | undefined>; getInspection(assetId: string): Promise<ReferenceAssetInspection | undefined> };
