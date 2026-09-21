// Reference-only contracts. These types are not Production runtime authority.
import type { AssetResolutionExecutionResult, ResolvedAsset, Sensitive } from "@/lib/assets/types";
import type {
  ReferenceMusicMaterializedBody,
  ReferenceMVMaterializedBody,
  ReferenceVocalMaterializedBody,
  RequestMaterializationResult,
} from "@/lib/materializers/types";
import type { ExpectedOutputContract, ImportedAssetReference, OutputIngestionPolicy } from "@/lib/outputIngestion/types";
import type {
  MaterializedProviderRequest,
  ProviderJobReference,
  ProviderOperation,
  ReferenceSafeResponseDTO,
} from "@/lib/providerClients/types";
import type { ReferenceMusicRequest, ReferenceMVRequest, ReferenceVocalRequest } from "@/lib/providerRequests/types";
import type { ReferenceMusicResponse } from "@/lib/providers/referenceMusicAdapter";
import type { ReferenceMVResponse } from "@/lib/providers/referenceMVAdapter";
import type { ReferenceVocalResponse } from "@/lib/providers/referenceVocalAdapter";
import type { NormalizedGenerationResult } from "@/lib/providers/types";

export type OperationResumePipelineStatus =
  | "completed"
  | "degraded"
  | "partial"
  | "accepted"
  | "acceptance-unknown"
  | "failed";

export type OperationPipelineReasonCode =
  | "adapter-request-record-missing"
  | "adapter-request-record-expired"
  | "adapter-request-record-deleted"
  | "adapter-request-unauthorized"
  | "adapter-request-schema-mismatch"
  | "adapter-request-adapter-mismatch"
  | "adapter-request-operation-mismatch"
  | "adapter-request-resolution-failed"
  | "ready-asset-projection-failed"
  | "materializer-binding-missing"
  | "materializer-binding-retired"
  | "materialization-failed"
  | "transport-bridge-failed"
  | "credential-invalid"
  | "provider-submit-failed"
  | "generation-acceptance-unknown"
  | "response-normalization-failed"
  | "provider-output-reference-invalid"
  | "expected-output-invalid"
  | "output-ingestion-failed"
  | "output-ingestion-partial"
  | "operation-pipeline-completed"
  | "reconciliation-required";

export type OperationPipelineIssue = Readonly<{
  reasonCode: OperationPipelineReasonCode;
  classification: "invalid" | "unauthorized" | "expired" | "conflict" | "failed" | "unavailable" | "internal";
  retryable: boolean;
}>;

export type ReadyAssetProjectionInput = Readonly<{
  projectionVersion: "1.0";
  operation: ProviderOperation;
  pollStatus: "ready" | "degraded";
  pollRevision: number;
  assets: Sensitive<readonly ResolvedAsset[]>;
}>;

export type ReadyAssetProjectionResult =
  | Readonly<{ status: "projected"; resolution: Sensitive<AssetResolutionExecutionResult> }>
  | Readonly<{ status: "invalid" | "unsupported-degraded"; issues: readonly OperationPipelineIssue[] }>;

export type OperationAdapterRequest = ReferenceVocalRequest | ReferenceMusicRequest | ReferenceMVRequest;

export type OperationResumePipelineContext = Readonly<{
  contextVersion: "1.0";
  baselineTime: string;
  attempt: number;
  operationRef: string;
  materializationIdempotencyKeyRef: string;
  generationIdempotencyKeyRef: string;
  outputIngestionIdempotencyKeyRef: string;
}>;

export type OperationResumePipelineAuthorization = Readonly<{
  authorizationVersion: "1.0";
  actorType: "internal-workflow-service" | "system";
  tenantRef: string;
  region: string;
  operation: ProviderOperation;
  permission: "execute-operation-resume-pipeline";
  workflowOwnershipVerified: true;
  deletionState: "active" | "deletion-pending" | "deleted";
  legalHold: boolean;
}>;

export type RestrictedAdapterRequestRecord = Readonly<{
  recordVersion: "1.0";
  operation: ProviderOperation;
  adapterId: string;
  adapterVersion: "1.0.0";
  requestSchemaVersion: "1.0";
  fingerprint: string;
  tenantRef: string;
  region: string;
  expiresAt: string;
  deletionState: "active" | "deletion-pending" | "deleted";
  legalHold: boolean;
  payloadRef: string;
}>;

export type RestrictedAdapterRequestRegistrationResult =
  | Readonly<{ status: "registered" }>
  | Readonly<{ status: "conflict" | "invalid" }>;

export type RestrictedAdapterRequestResolveResult =
  | Readonly<{ status: "resolved"; request: Sensitive<OperationAdapterRequest> }>
  | Readonly<{
      status: "missing" | "expired" | "unauthorized" | "deleted" | "schema-mismatch" | "adapter-mismatch" | "operation-mismatch" | "failed";
    }>;

export type RestrictedAdapterRequestResolver = Readonly<{
  register(record: RestrictedAdapterRequestRecord, request: Sensitive<OperationAdapterRequest>): RestrictedAdapterRequestRegistrationResult;
  resolve(
    reference: string,
    operation: ProviderOperation,
    context: OperationResumePipelineContext,
    authorization: OperationResumePipelineAuthorization,
  ): Promise<RestrictedAdapterRequestResolveResult>;
}>;

export type OperationResumePipelineInput = Readonly<{
  contractVersion: "1.0";
  operation: ProviderOperation;
  restrictedPayloadRef: string;
  readyAssets: Sensitive<readonly ResolvedAsset[]>;
  pollStatus: "ready" | "degraded";
  pollRevision: number;
  bindingId: string;
  generationClientBindingId: string;
  context: OperationResumePipelineContext;
  authorization: OperationResumePipelineAuthorization;
}>;

export type OperationResumePipelineAudit = Readonly<{
  auditVersion: "1.0";
  status: OperationResumePipelineStatus;
  operation: ProviderOperation;
  adapterRestoreStatus?: string;
  readyAssetProjectionStatus?: string;
  materializerStatus?: string;
  transportBridgeStatus?: string;
  providerClientStatus?: string;
  normalizationStatus?: string;
  ingestionStatus?: string;
  reasonCodes: readonly OperationPipelineReasonCode[];
}>;

export type OperationResumePipelineResult =
  | Readonly<{ status: "completed" | "degraded"; assets: Sensitive<readonly ImportedAssetReference[]>; audit: OperationResumePipelineAudit }>
  | Readonly<{ status: "partial"; assets: Sensitive<readonly ImportedAssetReference[]>; issues: readonly OperationPipelineIssue[]; audit: OperationResumePipelineAudit }>
  | Readonly<{ status: "accepted"; job: ProviderJobReference; audit: OperationResumePipelineAudit }>
  | Readonly<{ status: "acceptance-unknown" | "failed"; issues: readonly OperationPipelineIssue[]; audit: OperationResumePipelineAudit }>;

export type OperationResumePipeline = Readonly<{
  execute(input: OperationResumePipelineInput): Promise<OperationResumePipelineResult>;
}>;

export type ReferenceTransportSummary = Readonly<{
  operationPayloadVersion: "1.0";
  payloadKind: "vocal" | "music" | "mv";
  inputAssetCount: number;
  outputFormat: string;
  durationClass: "short" | "medium" | "long";
  timelineCount: number;
  sceneCount: number;
}>;

type ReferenceClientBody<TOperation extends ProviderOperation, TBody> = Readonly<{
  bodyVersion: "1.0";
  operation: TOperation;
  materializedRequest: Sensitive<TBody>;
  transportSummary: ReferenceTransportSummary;
}>;

export type ReferenceVocalClientBody = ReferenceClientBody<"generate-vocal", ReferenceVocalMaterializedBody>;
export type ReferenceMusicClientBody = ReferenceClientBody<"generate-music", ReferenceMusicMaterializedBody>;
export type ReferenceMVClientBody = ReferenceClientBody<"generate-mv", ReferenceMVMaterializedBody>;

export type OperationTransportBridgeResult<TBody> =
  | Readonly<{ status: "bridged"; body: Sensitive<TBody> }>
  | Readonly<{ status: "failed"; issues: readonly OperationPipelineIssue[] }>;

export type OperationExpectedOutputProjectionResult =
  | Readonly<{ status: "projected"; expected: ExpectedOutputContract; policy: OutputIngestionPolicy }>
  | Readonly<{ status: "failed"; issues: readonly OperationPipelineIssue[] }>;

export type OperationResumePipelineBinding<TRequest extends OperationAdapterRequest, TMaterializedBody, TClientBody, TResponse> = Readonly<{
  bindingVersion: "1.0";
  operation: ProviderOperation;
  adapterId: string;
  adapterVersion: string;
  materializerId: string;
  materializerVersion: string;
  providerClientId: string;
  providerClientVersion: string;
  providerId: string;
  providerApiVersion: string;
  normalizerId: string;
  normalizerVersion: string;
  outputIngestionId: string;
  restoreAdapterRequest(reference: string, input: OperationResumePipelineInput): Promise<RestrictedAdapterRequestResolveResult>;
  materialize(request: TRequest, resolution: AssetResolutionExecutionResult, baselineTime: string): RequestMaterializationResult<TMaterializedBody>;
  bridgeToClientBody(request: MaterializedProviderRequest<TMaterializedBody>): OperationTransportBridgeResult<TClientBody>;
  bridgeResponse(response: ReferenceSafeResponseDTO): TResponse;
  normalize(response: TResponse): NormalizedGenerationResult;
}>;

export type ReferenceVocalResumePipelineBinding = OperationResumePipelineBinding<ReferenceVocalRequest, ReferenceVocalMaterializedBody, ReferenceVocalClientBody, ReferenceVocalResponse>;
export type ReferenceMusicResumePipelineBinding = OperationResumePipelineBinding<ReferenceMusicRequest, ReferenceMusicMaterializedBody, ReferenceMusicClientBody, ReferenceMusicResponse>;
export type ReferenceMVResumePipelineBinding = OperationResumePipelineBinding<ReferenceMVRequest, ReferenceMVMaterializedBody, ReferenceMVClientBody, ReferenceMVResponse>;
