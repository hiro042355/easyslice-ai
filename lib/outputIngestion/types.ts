import type { Sensitive, AssetAvailabilityStatus, AssetRetentionClass, AssetSensitivityClass, AssetRecord } from "@/lib/assets/types";
import type { AssetKind } from "@/lib/mvContracts";
import type { NormalizedGenerationResult } from "@/lib/providers/types";
import type { ProviderOperation } from "@/lib/providerClients/types";

export type GeneratedOutputRole = "primary" | "alternate" | "preview" | "stem";
export type ExpectedDuration = { targetSeconds: number; toleranceSeconds: number };
export type ExpectedDimensions = { width?: number; height?: number; minimumWidth?: number; minimumHeight?: number; maximumWidth?: number; maximumHeight?: number; aspectRatio?: string; aspectTolerance?: number };
export type ExpectedOutputRole = { role: GeneratedOutputRole; requirement: "required" | "optional" };
export type ExpectedOutputContract = { contractVersion: "1.0"; kind: AssetKind; requiredRoles: readonly GeneratedOutputRole[]; optionalRoles: readonly GeneratedOutputRole[]; allowedMimeTypes: readonly string[]; allowedCodecs?: readonly string[]; allowedContainers?: readonly string[]; maximumOutputCount: number; maximumSizeBytes: number; expectedDuration?: ExpectedDuration; expectedDimensions?: ExpectedDimensions; requireChecksum: boolean; requireDurationMetadata: boolean; requireDimensions: boolean };
export type OutputIngestionPolicy = { policyVersion: "1.0"; externalFetchAllowed: boolean; allowedProviderIds: readonly string[]; maximumDownloadBytes: number; requireHttps: boolean; redirectPolicy: "none" | "same-allowlisted-host"; retentionClass: AssetRetentionClass; sensitivityClass: AssetSensitivityClass; scanRequired: boolean; metadataStrippingRequired: boolean; sourceRegion?: string; destinationRegion?: string; deletionPending: boolean };
export type OutputIngestionContext = { contextVersion: "1.0"; operationRef: string; baselineTime: string; attempt: number; cancellation?: { stage: "none" | "before-fetch" | "during-fetch" | "before-store" | "before-registry" } };
export type OutputIngestionIdempotencyContext = { ingestionKeyRef: string };
export type OutputIngestionInput = { contractVersion: "1.0"; providerId: string; providerApiVersion: string; operation: ProviderOperation; generationResult: NormalizedGenerationResult; expectedOutput: ExpectedOutputContract; policy: OutputIngestionPolicy; context: OutputIngestionContext; idempotency?: OutputIngestionIdempotencyContext };
export type OutputIngestionPlanItem = { slotIndex: number; role: GeneratedOutputRole; requirement: "required" | "optional"; expectedKind: AssetKind; allowedMimeTypes: readonly string[]; allowedCodecs: readonly string[]; allowedContainers: readonly string[]; maximumSizeBytes: number; expectedDuration?: ExpectedDuration; expectedDimensions?: ExpectedDimensions; requireChecksum: boolean; requireDurationMetadata: boolean; requireDimensions: boolean };
export type OutputIngestionPlan = { planVersion: "1.0"; executorVersion: "reference-v1"; providerId: string; providerApiVersion: string; operation: ProviderOperation; items: readonly OutputIngestionPlanItem[]; policy: Omit<OutputIngestionPolicy,"allowedProviderIds">; context: OutputIngestionContext; idempotency?: OutputIngestionIdempotencyContext; warnings: readonly string[] };
export type ProviderOutputReferenceItem = { slotIndex: number; role: GeneratedOutputRole; providerOutputReference: string };
export type ProviderOutputReferenceBundle = Sensitive<{ bundleVersion: "1.0"; providerId: string; providerApiVersion: string; operation: ProviderOperation; items: readonly ProviderOutputReferenceItem[] }>;
export type OutputIngestionPlanStatus = "planned" | "invalid";
export type OutputIngestionPlanResult = { status: "planned"; plan: OutputIngestionPlan; references: ProviderOutputReferenceBundle; issues: [] } | { status: "invalid"; issues: OutputIngestionIssue[] };
export type ProviderOutputAccess = Sensitive<{ mode: "provider-reference"; reference: string }>;
export type OutputContentHandle = Sensitive<{ handleVersion: "1.0"; contentRef: string }>;
export type ProviderOutputMetadata = { mimeType?: string; fetchContentType?: string; sizeBytes?: number; contentLength?: number; providerChecksum?: string; durationSeconds?: number; width?: number; height?: number; codec?: string; container?: string; contentEncoding?: "identity"; sourceRegion?: string };
export type ProviderOutputFetchInput = { access: ProviderOutputAccess; maximumBytes: number; requireHttps: boolean; redirectPolicy: OutputIngestionPolicy["redirectPolicy"] };
export type ProviderOutputFetchResult = { status: "fetched"; content: OutputContentHandle; metadata: ProviderOutputMetadata } | { status: "failed"; error: NormalizedOutputIngestionError };
export type ContentInspectionResult = { status: "inspected"; actualSizeBytes: number; computedChecksum: string; detectedMimeType: string; corrupted: boolean; partial: boolean; metadata: ProviderOutputMetadata } | { status: "failed"; error: NormalizedOutputIngestionError };
export type ContentScanResult = { status: "passed" | "pending" | "quarantined" | "blocked" | "failed" };
export type ContentSanitizationResult = { status: "sanitized" | "unchanged"; content: OutputContentHandle } | { status: "failed" };
export type AssetStoreWriteResult = { status: "written"; locatorRef: string; storedBytes: number; checksum: string } | { status: "failed"; error: NormalizedOutputIngestionError };
export type AssetRegistryCreateResult = { status: "created"; record: AssetRecord } | { status: "failed"; error: NormalizedOutputIngestionError };
export type AssetProvenanceRecord = { provenanceVersion: "1.0"; sourceType: "provider-generation"; providerId: string; providerApiVersion: string; operation: ProviderOperation; outputRole: GeneratedOutputRole; restrictedProviderOutputReference?: Sensitive<string>; importedChecksum: string };
export type ImportedAssetReference = { assetId: string; kind: AssetKind; role: GeneratedOutputRole; mimeType: string; sizeBytes: number; checksum: string; availability: AssetAvailabilityStatus };
export type OutputIngestionStatus = "completed" | "partial" | "failed";
export type OutputIngestionReasonCode = "unsupported-contract-version"|"input-shape-invalid"|"generation-result-invalid"|"provider-mismatch"|"provider-api-version-mismatch"|"operation-mismatch"|"output-reference-invalid"|"duplicate-output-reference"|"required-output-missing"|"optional-output-failed"|"output-count-exceeded"|"output-role-invalid"|"output-fetch-failed"|"output-fetch-timeout"|"output-too-large"|"output-empty"|"mime-type-mismatch"|"codec-unsupported"|"checksum-mismatch"|"metadata-missing"|"duration-mismatch"|"dimensions-mismatch"|"aspect-ratio-mismatch"|"content-scan-pending"|"content-quarantined"|"content-blocked"|"storage-write-failed"|"registry-create-failed"|"provenance-write-failed"|"duplicate-content-reused"|"ingestion-cancelled"|"cleanup-required"|"idempotency-conflict";
export type OutputIngestionIssueClassification = "validation"|"policy"|"fetch"|"integrity"|"metadata"|"safety"|"storage"|"execution";
export type OutputIngestionIssue = { reasonCode: OutputIngestionReasonCode; classification: OutputIngestionIssueClassification; slotIndex?: number; role?: GeneratedOutputRole; kind?: AssetKind; retryable: boolean };
export type OutputIngestionAudit = { status: OutputIngestionStatus; expectedCount: number; receivedCount: number; fetchedCount: number; validatedCount: number; importedCount: number; reusedCount: number; failedCount: number; roles: readonly GeneratedOutputRole[]; mimeClasses: readonly ("audio"|"video"|"image"|"unknown")[]; reasonCodes: readonly OutputIngestionReasonCode[] };
export type OutputIngestionResult = { status:"completed"; requiredOutputsComplete:true; assets:ImportedAssetReference[]; audit:OutputIngestionAudit } | { status:"partial"; requiredOutputsComplete:boolean; assets:ImportedAssetReference[]; issues:OutputIngestionIssue[]; audit:OutputIngestionAudit } | { status:"failed"; requiredOutputsComplete:false; issues:OutputIngestionIssue[]; audit:OutputIngestionAudit };
export type OutputIngestionErrorCategory = "reference-invalid"|"reference-expired"|"fetch-failed"|"fetch-timeout"|"payload-too-large"|"mime-invalid"|"metadata-invalid"|"checksum-mismatch"|"content-corrupted"|"scan-failed"|"content-blocked"|"storage-failed"|"registry-failed"|"cancelled"|"unknown";
export type OutputIngestionRetryAdvice = { retryable: boolean; safeCode?: string };
export type NormalizedOutputIngestionError = OutputIngestionRetryAdvice & { category: OutputIngestionErrorCategory };
export type ProviderOutputFetcher={fetch(input:ProviderOutputFetchInput):Promise<ProviderOutputFetchResult>};
export type ContentInspector={inspect(content:OutputContentHandle):Promise<ContentInspectionResult>};
export type ContentScanner={scan(content:OutputContentHandle):Promise<ContentScanResult>};
export type MediaSanitizer={sanitize(content:OutputContentHandle):Promise<ContentSanitizationResult>};
export type AssetStoreWriter={write(input:{content:OutputContentHandle;checksum:string;sizeBytes:number;mimeType:string;policy:OutputIngestionPlan["policy"]}):Promise<AssetStoreWriteResult>};
export type ImportedAssetRegistry={create(input:{slotIndex:number;kind:AssetKind;mimeType:string;sizeBytes:number;checksum:string;metadata:ProviderOutputMetadata;availability:AssetAvailabilityStatus;locatorRef:string;policy:OutputIngestionPlan["policy"]}):Promise<AssetRegistryCreateResult>};
export type ProvenanceStore={write(record:AssetProvenanceRecord):Promise<{status:"written"|"failed"}>};
export type DuplicateAssetLookup={find(input:{checksum:string;sizeBytes:number;mimeType:string;policy:OutputIngestionPlan["policy"]}):Promise<AssetRecord|undefined>};
export type IngestionJournal={get(keyRef:string):Promise<{fingerprint:string;result:OutputIngestionResult}|undefined>;put(keyRef:string,value:{fingerprint:string;result:OutputIngestionResult}):Promise<void>};
export type CleanupScheduler={schedule(reason:OutputIngestionReasonCode,content?:OutputContentHandle):Promise<{status:"scheduled"|"failed"}>};

// Persistence and Recovery Capability Contract V2. V1 capabilities above remain
// source-compatible and must not infer these outcomes from their narrower unions.
export type OutputIngestionMutationClassV2 = "asset-store-write"|"asset-registry-create"|"provenance-write"|"cleanup-schedule";
export type OutputIngestionMutationIdentityV2 = Sensitive<{identityVersion:"2.0";mutationClass:OutputIngestionMutationClassV2;identityRef:string;semanticFingerprint:string}>;
export type OutputIngestionJournalIdentityV2 = Sensitive<{identityVersion:"2.0";ingestionIdentityRef:string;semanticFingerprint:string}>;
export type OutputIngestionReplayEvidenceV2 = Sensitive<{evidenceVersion:"2.0";mutationIdentity:OutputIngestionMutationIdentityV2;evidenceRef:string;semanticFingerprint:string}>;
export type OutputIngestionStorageReceiptV2 = Sensitive<{receiptVersion:"2.0";mutationIdentity:OutputIngestionMutationIdentityV2;locatorRef:string;storedBytes:number;checksum:string}>;
export type OutputIngestionRegistryReceiptV2 = Sensitive<{receiptVersion:"2.0";mutationIdentity:OutputIngestionMutationIdentityV2;record:AssetRecord}>;
export type OutputIngestionProvenanceReceiptV2 = Sensitive<{receiptVersion:"2.0";mutationIdentity:OutputIngestionMutationIdentityV2;evidenceRef:string}>;
export type OutputIngestionCleanupReceiptV2 = Sensitive<{receiptVersion:"2.0";mutationIdentity:OutputIngestionMutationIdentityV2;requestRef:string}>;

export type OutputIngestionMutationFailureV2 =
  | {status:"not-committed";retryable:boolean}
  | {status:"semantic-conflict";retryable:false}
  | {status:"outcome-unknown";retryable:false;recoveryRequired:true}
  | {status:"unavailable";retryable:boolean}
  | {status:"corrupted";retryable:false};

export type OutputIngestionAuthoritativeLookupResultV2<TReceipt> =
  | {status:"committed";receipt:TReceipt;replayEvidence:OutputIngestionReplayEvidenceV2}
  | {status:"not-committed"}
  | {status:"semantic-conflict"}
  | {status:"corrupted"}
  | {status:"unavailable";retryable:boolean};

export type AssetStoreWriteInputV2 = {capabilityVersion:"2.0";mutationIdentity:OutputIngestionMutationIdentityV2;content:OutputContentHandle;checksum:string;sizeBytes:number;mimeType:string;policy:OutputIngestionPlan["policy"]};
export type AssetStoreWriteResultV2 =
  | {status:"written";receipt:OutputIngestionStorageReceiptV2}
  | {status:"replayed";receipt:OutputIngestionStorageReceiptV2;replayEvidence:OutputIngestionReplayEvidenceV2}
  | OutputIngestionMutationFailureV2;
export type AssetStoreWriterV2 = {
  write(input:AssetStoreWriteInputV2):Promise<AssetStoreWriteResultV2>;
  lookupAuthoritative(mutationIdentity:OutputIngestionMutationIdentityV2):Promise<OutputIngestionAuthoritativeLookupResultV2<OutputIngestionStorageReceiptV2>>;
};

export type AssetRegistryCreateInputV2 = {capabilityVersion:"2.0";mutationIdentity:OutputIngestionMutationIdentityV2;slotIndex:number;kind:AssetKind;mimeType:string;sizeBytes:number;checksum:string;metadata:ProviderOutputMetadata;availability:AssetAvailabilityStatus;storageReceipt:OutputIngestionStorageReceiptV2;policy:OutputIngestionPlan["policy"]};
export type AssetRegistryCreateResultV2 =
  | {status:"created";receipt:OutputIngestionRegistryReceiptV2}
  | {status:"replayed";receipt:OutputIngestionRegistryReceiptV2;replayEvidence:OutputIngestionReplayEvidenceV2}
  | OutputIngestionMutationFailureV2;
export type ImportedAssetRegistryV2 = {
  create(input:AssetRegistryCreateInputV2):Promise<AssetRegistryCreateResultV2>;
  lookupAuthoritative(mutationIdentity:OutputIngestionMutationIdentityV2):Promise<OutputIngestionAuthoritativeLookupResultV2<OutputIngestionRegistryReceiptV2>>;
};

export type ProvenanceWriteInputV2 = {capabilityVersion:"2.0";mutationIdentity:OutputIngestionMutationIdentityV2;record:AssetProvenanceRecord;registryReceipt:OutputIngestionRegistryReceiptV2};
export type ProvenanceWriteResultV2 =
  | {status:"written";receipt:OutputIngestionProvenanceReceiptV2}
  | {status:"replayed";receipt:OutputIngestionProvenanceReceiptV2;replayEvidence:OutputIngestionReplayEvidenceV2}
  | OutputIngestionMutationFailureV2;
export type ProvenanceStoreV2 = {
  write(input:ProvenanceWriteInputV2):Promise<ProvenanceWriteResultV2>;
  lookupAuthoritative(mutationIdentity:OutputIngestionMutationIdentityV2):Promise<OutputIngestionAuthoritativeLookupResultV2<OutputIngestionProvenanceReceiptV2>>;
};

export type CleanupScheduleInputV2 = {capabilityVersion:"2.0";mutationIdentity:OutputIngestionMutationIdentityV2;reason:OutputIngestionReasonCode;content?:OutputContentHandle;storageReceipt?:OutputIngestionStorageReceiptV2;registryReceipt?:OutputIngestionRegistryReceiptV2};
export type CleanupScheduleResultV2 =
  | {status:"scheduled";receipt:OutputIngestionCleanupReceiptV2}
  | {status:"replayed";receipt:OutputIngestionCleanupReceiptV2;replayEvidence:OutputIngestionReplayEvidenceV2}
  | OutputIngestionMutationFailureV2;
export type CleanupSchedulerV2 = {
  schedule(input:CleanupScheduleInputV2):Promise<CleanupScheduleResultV2>;
  lookupAuthoritative(mutationIdentity:OutputIngestionMutationIdentityV2):Promise<OutputIngestionAuthoritativeLookupResultV2<OutputIngestionCleanupReceiptV2>>;
};

export type OutputIngestionJournalStageV2 = "planned"|"content-validated"|"duplicate-reused"|"store-intent-recorded"|"stored"|"store-outcome-unknown"|"registry-intent-recorded"|"registered"|"registry-outcome-unknown"|"provenance-recorded"|"completed"|"failed"|"semantic-conflict"|"corrupted"|"cleanup-required";
export type OutputIngestionJournalRecordV2 = Sensitive<{recordVersion:"2.0";identity:OutputIngestionJournalIdentityV2;slotIndex:number;role:GeneratedOutputRole;stage:OutputIngestionJournalStageV2;attempt:number;revision:number;terminal:boolean;mutationIdentity?:OutputIngestionMutationIdentityV2;replayEvidence?:OutputIngestionReplayEvidenceV2;storageReceipt?:OutputIngestionStorageReceiptV2;registryReceipt?:OutputIngestionRegistryReceiptV2;provenanceReceipt?:OutputIngestionProvenanceReceiptV2;cleanupReceipt?:OutputIngestionCleanupReceiptV2;result?:OutputIngestionResult}>;
export type IngestionJournalReadResultV2 = {status:"found";record:OutputIngestionJournalRecordV2}|{status:"missing"}|{status:"corrupted"}|{status:"unavailable";retryable:boolean};
export type IngestionJournalCreateResultV2 = {status:"created";record:OutputIngestionJournalRecordV2}|{status:"replayed";record:OutputIngestionJournalRecordV2;replayEvidence:OutputIngestionReplayEvidenceV2}|{status:"semantic-conflict"}|{status:"corrupted"}|{status:"unavailable";retryable:boolean};
export type IngestionJournalCompareAndSetResultV2 = {status:"updated";record:OutputIngestionJournalRecordV2}|{status:"stale-revision"}|{status:"wrong-prior-stage"}|{status:"terminal-preserved"}|{status:"semantic-conflict"}|{status:"corrupted"}|{status:"unavailable";retryable:boolean};
export type IngestionJournalV2 = {
  createIfAbsent(record:OutputIngestionJournalRecordV2):Promise<IngestionJournalCreateResultV2>;
  readAuthoritative(identity:OutputIngestionJournalIdentityV2):Promise<IngestionJournalReadResultV2>;
  compareAndSet(input:{identity:OutputIngestionJournalIdentityV2;expectedRevision:number;expectedPriorStages:readonly [OutputIngestionJournalStageV2,...OutputIngestionJournalStageV2[]];nextRecord:OutputIngestionJournalRecordV2}):Promise<IngestionJournalCompareAndSetResultV2>;
};

export type OutputIngestionRecoveryRequiredV2 = {status:"recovery-required";recoveryVersion:"2.0";stage:"store"|"registry"|"provenance"|"cleanup";reason:"outcome-unknown"|"authoritative-lookup-unavailable";retryable:false};
