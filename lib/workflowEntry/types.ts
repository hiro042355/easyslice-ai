import type { AssetReference } from "@/lib/mvContracts";
import type { AssetRequirement, AssetUsage, Sensitive } from "@/lib/assets/types";
import type { ImportedAssetReference } from "@/lib/outputIngestion/types";
import type { ProviderJobReference, ProviderOperation, ReferenceSafeResponseDTO } from "@/lib/providerClients/types";
import type { ProviderUploadPendingReference } from "@/lib/pendingUploads/types";
import type { ProviderUploadGateAssetBundle, ProviderUploadGateAudit, ProviderUploadGatePlan, ProviderUploadPendingState } from "@/lib/providerUploadGate/types";
import type { OperationAdapterRequest } from "../operationPipelines/referenceOperationResumeTypes";
import type { ReferenceWorkflowInput } from "@/lib/workflows/referenceWorkflowTypes";
import type { ReferenceWorkflowOperation, ReferenceWorkflowResult, ReferenceWorkflowScenario } from "@/lib/workflows/types";

export type ReferenceWorkflowIntegrationBindingMetadata = Readonly<{
  bindingVersion: "1.0";
  operation: ReferenceWorkflowOperation;
  materializerId: string;
  providerClientId: string;
  outputIngestionProfile: string;
  assetRequirementsProfile: string;
  uploadGateProfile: string;
  credentialClass: "GENERATION_PROVIDER";
  resumePipelineId: string;
  availability: "available";
}>;

export type ReferenceWorkflowLogicalAssetRequirement = Readonly<{
  assetRef: AssetReference;
  requirement: AssetRequirement;
  usage: AssetUsage;
}>;

export type ReferenceWorkflowOrchestrationInputV1 = Readonly<{
  contractVersion: "1.0";
  scenario: ReferenceWorkflowScenario;
  operation: ReferenceWorkflowOperation;
  workflowInput: ReferenceWorkflowInput;
  adapterRequest: Readonly<object>;
  logicalAssets: readonly ReferenceWorkflowLogicalAssetRequirement[];
  integrationBinding: ReferenceWorkflowIntegrationBindingMetadata;
}>;

export type ReferenceWorkflowOrchestrationCapabilityV1 = Readonly<{
  execute(input: ReferenceWorkflowOrchestrationInputV1): Promise<ReferenceWorkflowResult>;
}>;

export type ReferenceWorkflowEntryStatus = "completed" | "degraded" | "partial" | "accepted" | "failed" | "cancelled" | "conflict";
export type ReferenceWorkflowEntryReasonCode = "configuration-invalid" | "async-runtime-missing" | "async-integration-started" | "upload-accepted-persisted" | "upload-poll-pending" | "upload-poll-ready" | "upload-poll-failed" | "resume-started" | "resume-failed" | "generation-job-accepted" | "generation-job-pending" | "generation-job-completed" | "generation-job-failed" | "generation-acceptance-unknown" | "final-result-persisted" | "final-result-read" | "workflow-completed" | "workflow-cancelled" | "reconciliation-required";
export type ReferenceWorkflowEntryIssue = { reasonCode: ReferenceWorkflowEntryReasonCode; classification: "invalid" | "unauthorized" | "expired" | "conflict" | "failed" | "cancelled" | "internal"; retryable: boolean };
export type ReferenceWorkflowEntryAudit = { auditVersion: "1.0"; status: ReferenceWorkflowEntryStatus; operation: ProviderOperation; asyncIntegrationUsed: boolean; acceptedKind?: "provider-upload" | "generation-job"; pollStatus?: string; resumeStatus?: string; generationJobStatus?: string; finalPersistenceStatus: "not-run" | "committed" | "failed"; reasonCodes: readonly ReferenceWorkflowEntryReasonCode[] };
export type ReferenceWorkflowEntryContext = { contextVersion: "1.0"; baselineTime: string; attempt: number; operationRef: string; idempotencyKeyRef: Sensitive<string>; cancellationRequested: boolean };
export type ReferenceWorkflowEntryAuthorization = { authorizationVersion: "1.0"; actorType: "internal-workflow-service" | "system"; tenantRef: string; region: string; operation: ProviderOperation; workflowOwnershipVerified: true; deletionState: "active" | "deletion-pending" | "deleted"; legalHold: boolean };

export type ReferenceWorkflowStartInput = Sensitive<{ startVersion: "1.0"; workflowInput: ReferenceWorkflowInput; adapterRequest: OperationAdapterRequest; adapterStatus: "ready" | "degraded"; gatePlan: ProviderUploadGatePlan; gateBundle: ProviderUploadGateAssetBundle; gatePending: ProviderUploadPendingState; gateAudit: ProviderUploadGateAudit }>;
export type ReferenceWorkflowEntryResult =
  | { status: "accepted"; operation: ProviderOperation; acceptedKind: "provider-upload"; pending: Sensitive<ProviderUploadPendingReference>; audit: ReferenceWorkflowEntryAudit }
  | { status: "accepted"; operation: ProviderOperation; acceptedKind: "generation-job"; job: Sensitive<ProviderJobReference>; audit: ReferenceWorkflowEntryAudit }
  | { status: "completed" | "degraded"; operation: ProviderOperation; assets: readonly ImportedAssetReference[]; requiredOutputsComplete: true; audit: ReferenceWorkflowEntryAudit }
  | { status: "partial"; operation: ProviderOperation; assets: readonly ImportedAssetReference[]; requiredOutputsComplete: boolean; issues: readonly ReferenceWorkflowEntryIssue[]; audit: ReferenceWorkflowEntryAudit }
  | { status: "failed"; operation: ProviderOperation; failureStage: string; issues: readonly ReferenceWorkflowEntryIssue[]; audit: ReferenceWorkflowEntryAudit }
  | { status: "cancelled"; operation: ProviderOperation; issues: readonly ReferenceWorkflowEntryIssue[]; audit: ReferenceWorkflowEntryAudit };
export type ReferenceWorkflowStartResult = ReferenceWorkflowEntryResult;
export type ReferenceWorkflowUploadPollInput = { entryVersion: "1.0"; pendingReference: Sensitive<ProviderUploadPendingReference>; context: ReferenceWorkflowEntryContext; authorization: ReferenceWorkflowEntryAuthorization };
export type ReferenceWorkflowResumeInput = ReferenceWorkflowUploadPollInput;
export type ReferenceWorkflowGenerationPollInput = { entryVersion: "1.0"; jobReference: Sensitive<ProviderJobReference>; context: ReferenceWorkflowEntryContext; authorization: ReferenceWorkflowEntryAuthorization };
export type ReferenceWorkflowResultQueryInput = { queryVersion: "1.0"; reference: Sensitive<ProviderUploadPendingReference | ProviderJobReference | { referenceVersion: "1.0"; resultRef: string; kind: "workflow-result" }>; context: ReferenceWorkflowEntryContext; authorization: ReferenceWorkflowEntryAuthorization };
export type ReferenceWorkflowCancelInput = { entryVersion: "1.0"; reference: ReferenceWorkflowResultQueryInput["reference"]; context: ReferenceWorkflowEntryContext; authorization: ReferenceWorkflowEntryAuthorization };

export type ReferenceGenerationJobRecord = Sensitive<{ recordVersion: "1.0"; providerId: string; providerApiVersion: string; operation: ProviderOperation; clientBindingId: string; normalizerBindingId: string; ingestionBindingId: string; originalInputRecordRef: string; adapterRequestRecordRef: string; generationIdentity: string; jobReference: Sensitive<ProviderJobReference>; finalResultIdentity: string; baselineTime: string; tenantRef: string; region: string; revision: number; status: "pending" | "completed" | "failed" | "cancelled" | "expired"; lifecycle: "generation-pending" | "ingesting" | "terminal"; expiresAt: string }>;
export type ReferenceGenerationJobStoreResult = { status: "created" | "found" | "updated"; record: ReferenceGenerationJobRecord; revision: number } | { status: "missing" | "expired" | "conflict" | "deleted" | "failed" };
export type ReferenceGenerationJobStore = { createIfAbsent(identity: string, record: ReferenceGenerationJobRecord): Promise<ReferenceGenerationJobStoreResult>; read(reference: ProviderJobReference, baselineTime: string): Promise<ReferenceGenerationJobStoreResult>; compareAndSet(reference: ProviderJobReference, expectedRevision: number, record: ReferenceGenerationJobRecord): Promise<ReferenceGenerationJobStoreResult>; markPending(reference: ProviderJobReference, expectedRevision: number): Promise<ReferenceGenerationJobStoreResult>; markCompleted(reference: ProviderJobReference, expectedRevision: number): Promise<ReferenceGenerationJobStoreResult>; markFailed(reference: ProviderJobReference, expectedRevision: number): Promise<ReferenceGenerationJobStoreResult>; markCancelled(reference: ProviderJobReference, expectedRevision: number): Promise<ReferenceGenerationJobStoreResult>; markExpired(reference: ProviderJobReference, expectedRevision: number): Promise<ReferenceGenerationJobStoreResult>; delete(reference: ProviderJobReference): Promise<ReferenceGenerationJobStoreResult> };
export type ReferenceGenerationJobPollResult = { status: "pending" } | { status: "completed"; data: Sensitive<ReferenceSafeResponseDTO> } | { status: "failed" | "cancelled" | "expired" | "conflict" | "outcome-unknown"; retryable: boolean };
export type ReferenceGenerationJobEntryPoint = { poll(input: ReferenceWorkflowGenerationPollInput): Promise<ReferenceWorkflowEntryResult> };
export type ReferenceWorkflowFinalResultQueryResult = { status: "found"; result: ReferenceWorkflowEntryResult } | { status: "not-found" | "expired" | "unauthorized" | "conflict"; issues: readonly ReferenceWorkflowEntryIssue[] };
export type ReferenceWorkflowEntryPoints = { pollUpload(input: ReferenceWorkflowUploadPollInput): Promise<ReferenceWorkflowEntryResult>; resume(input: ReferenceWorkflowResumeInput): Promise<ReferenceWorkflowEntryResult>; pollGeneration(input: ReferenceWorkflowGenerationPollInput): Promise<ReferenceWorkflowEntryResult>; getResult(input: ReferenceWorkflowResultQueryInput): Promise<ReferenceWorkflowFinalResultQueryResult>; cancel(input: ReferenceWorkflowCancelInput): Promise<ReferenceWorkflowEntryResult> };
export type ReferenceWorkflowIntegrationRuntime = { runtimeVersion: "1.0"; supportedOperations: readonly ProviderOperation[]; startAccepted(input: ReferenceWorkflowStartInput): Promise<ReferenceWorkflowStartResult>; entryPoints: ReferenceWorkflowEntryPoints };
export type ReferenceWorkflowExecutionDependencies = {
  asyncRuntime?: ReferenceWorkflowIntegrationRuntime;
  orchestration?: ReferenceWorkflowOrchestrationCapabilityV1;
};
export type ReferenceWorkflowEntryDescriptor = { descriptorVersion: "1.0"; runtimeVersion: "1.0"; supportedOperations: readonly ProviderOperation[]; supportsAsyncUploadResume: true; supportsGenerationJobResume: true; requiresIntegrationRuntimeForAccepted: true; availability: "available" | "disabled" };
