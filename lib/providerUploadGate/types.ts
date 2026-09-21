import type { Sensitive, AssetResolutionExecutionResult, ResolvedAsset, ResolvedAssetAccess, AssetUsage, AssetRequirement } from "@/lib/assets/types";
import type { ProviderOperation } from "@/lib/providerClients/types";
import type { ProviderUploadSession } from "@/lib/providerUploads/types";
export type ProviderUploadGateContext = {
    contextVersion: "1.0";
    operationRef: string;
    baselineTime: string;
    attempt: number;
    cancellationStage: "none" | "before-gate" | "between-assets" | "before-materializer";
};
export type ProviderUploadGateMaterializerCapability = {
    capabilityVersion: "1.0";
    acceptedAccessModes: readonly ResolvedAssetAccess["mode"][];
    nativeHandleMinimumLifetimeSeconds: number;
    optionalOmissionAllowed: boolean;
};
export type ProviderUploadGateInput = {
    contractVersion: "1.0";
    providerId: string;
    providerApiVersion: string;
    operation: ProviderOperation;
    resolutionResult: Sensitive<AssetResolutionExecutionResult>;
    materializerCapability: ProviderUploadGateMaterializerCapability;
    context: ProviderUploadGateContext;
};
export type ProviderUploadGateAction = "pass-through" | "upload";
export type ProviderUploadGateItem = {
    itemIndex: number;
    assetIndex: number;
    usage: AssetUsage;
    requirement: AssetRequirement;
    action: ProviderUploadGateAction;
};
export type ProviderUploadGatePlan = {
    planVersion: "1.0";
    executorVersion: "reference-v1";
    providerId: string;
    providerApiVersion: string;
    operation: ProviderOperation;
    items: readonly ProviderUploadGateItem[];
    materializerCapability: ProviderUploadGateMaterializerCapability;
    baselineTime: string;
    attempt: number;
    idempotencyKeyRef?: string;
    cancellationStage: ProviderUploadGateContext["cancellationStage"];
    warnings: readonly ProviderUploadGateReasonCode[];
};
export type ProviderUploadGateAssetBundle = Sensitive<{
    bundleVersion: "1.0";
    providerId: string;
    providerApiVersion: string;
    operation: ProviderOperation;
    assets: readonly ResolvedAsset[];
    idempotencyKeyRef?: string;
}>;
export type ProviderUploadGatePlanResult = {
    status: "planned";
    plan: ProviderUploadGatePlan;
    bundle: ProviderUploadGateAssetBundle;
    issues: [
    ];
} | {
    status: "invalid" | "blocked";
    issues: ProviderUploadGateIssue[];
};
export type ProviderUploadGateStatus = "ready" | "degraded" | "accepted" | "failed" | "blocked" | "cancelled";
export type ProviderUploadGateStage = "input-validation" | "requirement-decision" | "gate-plan" | "upload-execution" | "result-aggregation" | "materializer-ready";
export type ProviderUploadGateReasonCode = "unsupported-contract-version" | "input-shape-invalid" | "binding-mismatch" | "materializer-capability-invalid" | "gate-plan-invalid" | "upload-not-required" | "upload-required" | "native-handle-reused" | "required-upload-accepted" | "optional-upload-accepted" | "required-upload-failed" | "optional-upload-omitted" | "required-upload-cancelled" | "optional-upload-cancelled" | "registry-read-failed" | "registry-repair-required" | "provenance-repair-required" | "upload-cleanup-required" | "gate-idempotency-conflict" | "gate-cancelled" | "materializer-ready";
export type ProviderUploadGateIssueClassification = "invalid" | "blocked" | "retryable" | "cancelled" | "internal";
export type ProviderUploadGateIssue = {
    stage: ProviderUploadGateStage;
    reasonCode: ProviderUploadGateReasonCode;
    classification: ProviderUploadGateIssueClassification;
    itemIndex?: number;
    usage?: AssetUsage;
    requirement?: AssetRequirement;
    retryable: boolean;
};
export type ProviderUploadGateAudit = {
    status: ProviderUploadGateStatus;
    expectedCount: number;
    passThroughCount: number;
    uploadRequiredCount: number;
    uploadedCount: number;
    reusedCount: number;
    omittedCount: number;
    pendingCount: number;
    failedCount: number;
    reasonCodes: readonly ProviderUploadGateReasonCode[];
};
export type ProviderUploadPendingState = Sensitive<{
    pendingVersion: "1.0";
    planFingerprint: string;
    pendingItems: readonly {
        assetIndex: number;
        usage: AssetUsage;
        requirement: AssetRequirement;
        session: ProviderUploadSession;
        attempt: number;
    }[];
    completedAssets: readonly ResolvedAsset[];
}>;
export type ProviderUploadGateResult = {
    status: "ready" | "degraded";
    assets: Sensitive<ResolvedAsset[]>;
    audit: ProviderUploadGateAudit;
} | {
    status: "accepted";
    pending: ProviderUploadPendingState;
    audit: ProviderUploadGateAudit;
} | {
    status: "failed" | "blocked" | "cancelled";
    issues: ProviderUploadGateIssue[];
    audit: ProviderUploadGateAudit;
};
export type ProviderUploadGateExecutionInput = {
    plan: ProviderUploadGatePlan;
    bundle: ProviderUploadGateAssetBundle;
};
export type ProviderUploadGateExecutor = {
    execute(input: ProviderUploadGateExecutionInput): Promise<ProviderUploadGateResult>;
};
export type ProviderUploadGateBinding = {
    bindingVersion: "1.0";
    bindingId: string;
    providerId: string;
    providerApiVersion: string;
    operation: ProviderOperation;
    uploadProfileId: string;
    uploadClientId: string;
    nativeHandleRegistryId: string;
    materializerId: string;
    availability: "available" | "disabled";
};
export type ProviderUploadGateDescriptor = {
    gateId: string;
    gateVersion: "reference-v1";
    bindingId: string;
    operation: ProviderOperation;
    availability: "available" | "disabled";
};
