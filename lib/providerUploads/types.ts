import type { Sensitive, ResolvedAsset, AssetRetentionClass, AssetSensitivityClass } from "@/lib/assets/types";
import type { AssetKind } from "@/lib/mvContracts";
import type { ProviderOperation } from "@/lib/providerClients/types";
export type ProviderUploadMode = "single-request" | "multipart" | "resumable" | "provider-fetch";
export type ProviderUploadIdempotencyContext = {
    uploadKeyRef: string;
};
export type ProviderUploadContext = {
    contextVersion: "1.0";
    operationRef: string;
    baselineTime: string;
    attempt: number;
    idempotency?: ProviderUploadIdempotencyContext;
    cancellation?: {
        stage: "none" | "before-upload" | "during-upload" | "before-registry";
    };
};
export type ProviderUploadProfile = {
    profileVersion: "1.0";
    providerId: string;
    providerApiVersion: string;
    operation: ProviderOperation;
    allowedKinds: readonly AssetKind[];
    allowedMimeTypes: readonly string[];
    maximumBytes: number;
    preferredModes: readonly ProviderUploadMode[];
    nativeHandleTtlSeconds: number;
    retentionClass: AssetRetentionClass;
    sensitivityClass: AssetSensitivityClass;
    region?: string;
};
export type ProviderUploadCapability = {
    capabilityVersion: "1.0";
    providerId: string;
    providerApiVersion: string;
    supportedKinds: readonly AssetKind[];
    allowedMimeTypes: readonly string[];
    maximumBytes: number;
    modes: readonly ProviderUploadMode[];
    supportsIdempotency: boolean;
    supportsCancellation: boolean;
    supportsStatusLookup: boolean;
    nativeHandleExpiry: "required" | "optional" | "none";
    multipart?: {
        minimumPartBytes: number;
        maximumPartBytes: number;
        maximumParts: number;
        requiresOrderedParts: boolean;
        supportsParallelParts: boolean;
    };
};
export type ProviderUploadInput = {
    contractVersion: "1.0";
    providerId: string;
    providerApiVersion: string;
    operation: ProviderOperation;
    asset: Sensitive<ResolvedAsset>;
    profile: ProviderUploadProfile;
    capability: ProviderUploadCapability;
    context: ProviderUploadContext;
};
export type ProviderUploadPlanItem = {
    slotIndex: 0;
    usage: ResolvedAsset["usage"];
    requirement: ResolvedAsset["requirement"];
    kind: AssetKind;
    mimeType: string;
    sizeBytes: number;
    mode: ProviderUploadMode;
    partSizeBytes?: number;
    partCount?: number;
    nativeHandleTtlSeconds: number;
    retentionClass: AssetRetentionClass;
    sensitivityClass: AssetSensitivityClass;
    region?: string;
};
export type ProviderUploadPlan = {
    planVersion: "1.0";
    executorVersion: "reference-v1";
    providerId: string;
    providerApiVersion: string;
    operation: ProviderOperation;
    items: readonly ProviderUploadPlanItem[];
    baselineTime: string;
    attempt: number;
    idempotency?: ProviderUploadIdempotencyContext;
    cancellationStage: "none" | "before-upload" | "during-upload" | "before-registry";
    warnings: readonly ProviderUploadReasonCode[];
};
export type ProviderUploadSource = Sensitive<{
    sourceVersion: "1.0";
    mode: "signed-url" | "internal-stream" | "provider-upload";
    accessRef: string;
    expiresAt: string;
}>;
export type ProviderUploadSourceBundle = Sensitive<{
    bundleVersion: "1.0";
    providerId: string;
    providerApiVersion: string;
    operation: ProviderOperation;
    items: readonly {
        slotIndex: 0;
        source: ProviderUploadSource;
    }[];
}>;
export type ProviderUploadPlanResult = {
    status: "planned";
    plan: ProviderUploadPlan;
    sources: ProviderUploadSourceBundle;
    issues: [
    ];
} | {
    status: "invalid";
    issues: ProviderUploadIssue[];
};
export type ProviderUploadSession = Sensitive<{
    sessionVersion: "1.0";
    sessionRef: string;
    providerId: string;
    operation: ProviderOperation;
    mode: ProviderUploadMode;
    expiresAt: string;
}>;
export type ProviderUploadPart = {
    partNumber: number;
    offsetBytes: number;
    sizeBytes: number;
    checksum: string;
    final: boolean;
};
export type ProviderNativeAssetHandle = Sensitive<{
    handleVersion: "1.0";
    providerId: string;
    providerApiVersion: string;
    operation: ProviderOperation;
    handle: string;
    kind: AssetKind;
    mimeType: string;
    sizeBytes: number;
    expiresAt?: string;
}>;
export type ProviderUploadStatus = "completed" | "accepted" | "failed" | "cancelled";
export type ProviderUploadReasonCode = "unsupported-contract-version" | "input-shape-invalid" | "binding-mismatch" | "profile-invalid" | "capability-incompatible" | "source-bundle-invalid" | "source-access-expired" | "source-integrity-invalid" | "mime-type-unsupported" | "asset-size-exceeded" | "upload-mode-unsupported" | "upload-session-failed" | "upload-accepted" | "upload-timeout" | "upload-failed" | "upload-part-failed" | "upload-complete-failed" | "native-handle-invalid" | "native-handle-expired" | "native-handle-reused" | "registry-read-failed" | "registry-write-failed" | "provenance-write-failed" | "idempotency-conflict" | "upload-cancelled" | "cleanup-required";
export type ProviderUploadIssueClassification = "validation" | "policy" | "source" | "transport" | "registry" | "execution";
export type ProviderUploadIssue = {
    reasonCode: ProviderUploadReasonCode;
    classification: ProviderUploadIssueClassification;
    slotIndex?: number;
    retryable: boolean;
};
export type ProviderUploadAudit = {
    status: ProviderUploadStatus;
    expectedCount: number;
    uploadedCount: number;
    reusedCount: number;
    failedCount: number;
    modes: readonly ProviderUploadMode[];
    mimeClasses: readonly ("audio" | "video" | "image" | "unknown")[];
    sizeClasses: readonly ("small" | "medium" | "large")[];
    reasonCodes: readonly ProviderUploadReasonCode[];
};
export type ProviderUploadRetryAdvice = {
    retryable: boolean;
    reason: "rate-limit" | "timeout" | "provider-unavailable" | "not-retryable";
};
export type ProviderUploadErrorCategory = "invalid-request" | "source-expired" | "source-unavailable" | "payload-too-large" | "rate-limit" | "timeout" | "provider-unavailable" | "session-failed" | "part-failed" | "complete-failed" | "handle-invalid" | "cancelled" | "unknown";
export type NormalizedProviderUploadError = {
    category: ProviderUploadErrorCategory;
    retryable: boolean;
    safeCode?: string;
};
export type ProviderUploadedAsset = {
    slotIndex: 0;
    usage: ResolvedAsset["usage"];
    requirement: ResolvedAsset["requirement"];
    kind: AssetKind;
    mimeType: string;
    sizeBytes: number;
    nativeHandle: ProviderNativeAssetHandle;
};
export type ProviderUploadResult = {
    status: "completed";
    assets: ProviderUploadedAsset[];
    audit: ProviderUploadAudit;
} | {
    status: "accepted";
    session: ProviderUploadSession;
    audit: ProviderUploadAudit;
} | {
    status: "failed" | "cancelled";
    issues: ProviderUploadIssue[];
    audit: ProviderUploadAudit;
};
export type ProviderUploadExecutionContext = {
    executionVersion: "reference-v1";
    providerId: string;
    providerApiVersion: string;
    operation: ProviderOperation;
    baselineTime: string;
    attempt: number;
};
export type ProviderUploadClient = {
    upload(input: Sensitive<{
        item: ProviderUploadPlanItem;
        source: ProviderUploadSource;
        context: ProviderUploadExecutionContext;
    }>): Promise<{
        status: "completed";
        handle: ProviderNativeAssetHandle;
    } | {
        status: "accepted";
        session: ProviderUploadSession;
    } | {
        status: "failed" | "cancelled";
        error: NormalizedProviderUploadError;
        retryAdvice: ProviderUploadRetryAdvice;
    }>;
};
export type ProviderNativeAssetRegistry = {
    find(input: {
        providerId: string;
        operation: ProviderOperation;
        kind: AssetKind;
        mimeType: string;
        sizeBytes: number;
        retentionClass: AssetRetentionClass;
        sensitivityClass: AssetSensitivityClass;
        region?: string;
        baselineTime: string;
    }): Promise<ProviderNativeAssetHandle | undefined>;
    save(input: Sensitive<{
        asset: ProviderUploadedAsset;
        sourceAssetRef: string;
    }>): Promise<{
        status: "saved";
    } | {
        status: "failed";
    }>;
};
export type ProviderUploadedAssetProvenance = {
    provenanceVersion: "1.0";
    providerId: string;
    operation: ProviderOperation;
    kind: AssetKind;
    mimeType: string;
    sizeBytes: number;
    uploadMode: ProviderUploadMode;
};
export type ProviderUploadCleanupRequest = {
    cleanupVersion: "1.0";
    reasonCode: "cleanup-required";
    scope: "session" | "parts" | "provider-asset";
};
export type ProviderUploadClientDescriptor = {
    uploadClientId: string;
    uploadClientVersion: "reference-v1";
    providerId: string;
    providerApiVersion: string;
    availability: "available" | "disabled";
    capabilityVersion: "1.0";
};
