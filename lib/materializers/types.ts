import type { AssetKind } from "@/lib/mvContracts";
import type { AssetResolutionExecutionResult, AssetUsage, ResolvedAssetAccess } from "@/lib/assets/types";
import type {
  MaterializedProviderRequest,
  ProviderOperation,
  ReferenceMusicRequest,
  ReferenceMVRequest,
  ReferenceMVSceneInstruction,
  ReferenceVocalRequest,
} from "@/lib/providerRequests/types";
export type { Sensitive } from "@/lib/assets/types";
export type { MaterializedProviderRequest } from "@/lib/providerRequests/types";

export type RequestMaterializationStatus = "materialized" | "failed";
export type ProviderMaterializationProfileVersion = "1.0";
export type AssetFieldRequirement = "required" | "optional";
export type AssetFieldCardinality = "single" | "multiple";
export type OptionalOmissionBehavior = "remove" | "undefined" | "empty-array";
export type RequestMaterializationIssueClassification = "validation" | "resolution" | "mapping" | "expiry" | "security";
export type RequestMaterializationReasonCode = "unsupported-contract-version" | "input-shape-invalid" | "provider-mismatch" | "provider-api-version-mismatch" | "operation-mismatch" | "adapter-request-invalid" | "resolution-result-invalid" | "resolution-not-complete" | "unsupported-profile-version" | "profile-invalid" | "context-invalid" | "source-field-missing" | "source-field-cardinality-invalid" | "duplicate-resolved-asset" | "required-asset-missing" | "requirement-mismatch" | "asset-usage-mismatch" | "asset-kind-mismatch" | "access-mode-unsupported" | "asset-access-expired" | "asset-access-lifetime-insufficient" | "target-field-conflict" | "unresolved-asset-reference" | "optional-asset-omitted" | "materialization-failed";
export type RequestMaterializationIssue = { readonly reasonCode: RequestMaterializationReasonCode; readonly classification: RequestMaterializationIssueClassification; readonly mappingIndex?: number; readonly usage?: AssetUsage; readonly kind?: AssetKind };
export type RequestMaterializationAudit = { readonly status: RequestMaterializationStatus; readonly requiredReferenceCount: number; readonly optionalReferenceCount: number; readonly materializedCount: number; readonly omittedCount: number; readonly accessModes: readonly ResolvedAssetAccess["mode"][]; readonly reasonCodes: readonly RequestMaterializationReasonCode[]; readonly profileVersion: ProviderMaterializationProfileVersion };
export type RequestMaterializationContext = { readonly contextVersion: "1.0"; readonly baselineTime: string };
export type MaterializationProof = { readonly status: "complete"; readonly unresolvedAssetCount: 0 };

export type MaterializedAssetValue =
  | { readonly mode: "signed-url"; readonly url: string; readonly expiresAt: string }
  | { readonly mode: "provider-upload"; readonly uploadSourceToken: string; readonly expiresAt: string }
  | { readonly mode: "provider-native-asset"; readonly providerAssetHandle: string; readonly expiresAt?: string }
  | { readonly mode: "internal-stream"; readonly streamToken: string; readonly expiresAt: string };

export type ResolvedAssetLookupKey = { readonly assetId: string; readonly usage: AssetUsage };
export type AssetFieldMapping<TSlot extends string = string> = { readonly mappingId: string; readonly sourceSlot: TSlot; readonly usage: AssetUsage | readonly AssetUsage[]; readonly requirement: AssetFieldRequirement; readonly cardinality: AssetFieldCardinality; readonly allowedAccessModes: readonly ResolvedAssetAccess["mode"][]; readonly maximumCount?: number; readonly omissionBehavior?: OptionalOmissionBehavior; readonly allowedKinds: readonly AssetKind[]; readonly allowMissingExpiryForNative?: boolean };
export type ProviderMaterializationProfile<TSlot extends string = string> = { readonly profileVersion: ProviderMaterializationProfileVersion; readonly materializerVersion: "reference-v1"; readonly providerId: string; readonly providerApiVersion: string; readonly operation: ProviderOperation; readonly minimumAssetLifetimeSeconds: number; readonly mappings: readonly AssetFieldMapping<TSlot>[] };
export type ReferenceVocalSlot = "reference-voice" | "guide-melody";
export type ReferenceMusicSlot = "reference-audio";
export type ReferenceMVSlot = "audio" | "scene-assets";
export type ReferenceVocalMaterializationProfile = ProviderMaterializationProfile<ReferenceVocalSlot>;
export type ReferenceMusicMaterializationProfile = ProviderMaterializationProfile<ReferenceMusicSlot>;
export type ReferenceMVMaterializationProfile = ProviderMaterializationProfile<ReferenceMVSlot>;

export type RequestMaterializationInput<TRequest, TSlot extends string = string> = { readonly contractVersion: "1.0"; readonly providerId: string; readonly providerApiVersion: string; readonly operation: ProviderOperation; readonly adapterRequest: TRequest; readonly resolvedAssets: AssetResolutionExecutionResult; readonly profile: ProviderMaterializationProfile<TSlot>; readonly context: RequestMaterializationContext };
export type RequestMaterializationResult<TBody> = { readonly status: "materialized"; readonly request: MaterializedProviderRequest<TBody>; readonly audit: RequestMaterializationAudit } | { readonly status: "failed"; readonly issues: readonly RequestMaterializationIssue[]; readonly audit: RequestMaterializationAudit };
export type RequestMaterializer<TAdapterRequest, TMaterializedBody, TSlot extends string = string> = { readonly materializerId: string; readonly materializerVersion: "reference-v1"; readonly providerId: string; readonly providerApiVersion: string; readonly operation: ProviderOperation; readonly materialize: (input: RequestMaterializationInput<TAdapterRequest, TSlot>) => RequestMaterializationResult<TMaterializedBody> };

export type ReferenceVocalMaterializedBody = Omit<ReferenceVocalRequest, "referenceVoiceAssetId" | "guideMelodyAssetId"> & { referenceVoice?: MaterializedAssetValue; guideMelody?: MaterializedAssetValue };
export type ReferenceMusicMaterializedBody = Omit<ReferenceMusicRequest, "referenceAudioAssetId"> & { readonly referenceAudio?: MaterializedAssetValue };
export type ReferenceMVMaterializedSceneInstruction = Omit<ReferenceMVSceneInstruction, "assetIds"> & { readonly assets: readonly MaterializedAssetValue[] };
export type ReferenceMVMaterializedBody = Omit<ReferenceMVRequest, "audioAssetId" | "scenes"> & { readonly audio: MaterializedAssetValue; readonly scenes: readonly ReferenceMVMaterializedSceneInstruction[] };
export type MaterializerDescriptor = { readonly materializerId: string; readonly materializerVersion: "reference-v1"; readonly providerId: string; readonly providerApiVersion: string; readonly operation: ProviderOperation; readonly profileVersion: ProviderMaterializationProfileVersion; readonly availability: "available" | "disabled" };
