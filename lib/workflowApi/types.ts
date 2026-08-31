import type { AssetKind } from "@/lib/mvContracts";
import type { ReferenceWorkflowInput } from "@/lib/workflows/types";

export type WorkflowApiContractVersion = "1.0";
export type WorkflowApiOperation = "generate-vocal" | "generate-music" | "generate-mv";
export type WorkflowApiCommand = "start" | "poll-upload" | "poll-generation" | "result" | "cancel";
export type WorkflowApiPermission = `workflow:${WorkflowApiCommand}`;
export type WorkflowApiIdempotencyKey = string;
export type WorkflowApiPrincipal = { principalVersion:"1.0"; actorType:"user"|"service"; subjectRef:string; tenantRef:string; region:string; permissions:readonly WorkflowApiPermission[] };
export type WorkflowApiRequestContext = { contextVersion:"1.0"; baselineTime:string; requestRef:string; correlationRef:string; attempt:number };

type PublicWorkflowInput<T extends ReferenceWorkflowInput>=Omit<T,"providerId"|"providerApiVersion"|"context"|"adapterInput">&{adapterInput:Omit<T["adapterInput"],"capability">};
type StartBase<T extends ReferenceWorkflowInput>={requestVersion:"1.0";operation:T["operation"];workflowInput:PublicWorkflowInput<T>;idempotencyKey:WorkflowApiIdempotencyKey};
export type StartVocalWorkflowRequest=StartBase<Extract<ReferenceWorkflowInput,{operation:"generate-vocal"}>>;
type MusicWorkflow=Extract<ReferenceWorkflowInput,{operation:"generate-music"}>;
type PublicMusicAdapterInput=Omit<MusicWorkflow["adapterInput"],"capability"|"assets">&{assets:Omit<MusicWorkflow["adapterInput"]["assets"],"guideVocalAsset">};
export type StartMusicWorkflowRequest={requestVersion:"1.0";operation:"generate-music";workflowInput:Omit<MusicWorkflow,"providerId"|"providerApiVersion"|"context"|"adapterInput">&{adapterInput:PublicMusicAdapterInput};idempotencyKey:WorkflowApiIdempotencyKey};
export type StartMVWorkflowRequest=StartBase<Extract<ReferenceWorkflowInput,{operation:"generate-mv"}>>;
export type StartWorkflowRequest=StartVocalWorkflowRequest|StartMusicWorkflowRequest|StartMVWorkflowRequest;

export type UploadPendingReferenceDTO={referenceVersion:"1.0";kind:"upload-pending";reference:string};
export type GenerationJobReferenceDTO={referenceVersion:"1.0";kind:"generation-job";reference:string};
export type WorkflowResultReferenceDTO={referenceVersion:"1.0";kind:"workflow-result";reference:string};
export type WorkflowReferenceDTO=UploadPendingReferenceDTO|GenerationJobReferenceDTO|WorkflowResultReferenceDTO;
export type PollUploadWorkflowRequest={requestVersion:"1.0";command:"poll-upload";pendingReference:UploadPendingReferenceDTO;idempotencyKey:WorkflowApiIdempotencyKey};
export type PollGenerationWorkflowRequest={requestVersion:"1.0";command:"poll-generation";generationReference:GenerationJobReferenceDTO;idempotencyKey:WorkflowApiIdempotencyKey};
export type QueryWorkflowResultRequest={requestVersion:"1.0";command:"result";reference:WorkflowReferenceDTO;idempotencyKey:WorkflowApiIdempotencyKey};
export type CancelWorkflowRequest={requestVersion:"1.0";command:"cancel";reference:WorkflowReferenceDTO;idempotencyKey:WorkflowApiIdempotencyKey};
export type WorkflowApiRequest=StartWorkflowRequest|PollUploadWorkflowRequest|PollGenerationWorkflowRequest|QueryWorkflowResultRequest|CancelWorkflowRequest;

export type WorkflowAssetDTO={assetVersion:"1.0";assetId:string;kind:AssetKind;role:string;mimeType:string};
export type WorkflowProgressDTO={progressVersion:"1.0";stage:"upload"|"generation"|"ingestion";percent?:number};
export type WorkflowRetryAdviceDTO={retryVersion:"1.0";retryable:boolean;retryAfterClass?:"short"|"medium"|"long"};
export type WorkflowApiPublicReasonCode="processing"|"workflow-completed"|"workflow-degraded"|"workflow-partial"|"workflow-failed"|"workflow-cancelled"|"state-conflict";
export type WorkflowApiAuditDTO={auditVersion:"1.0";operation:WorkflowApiOperation;status:WorkflowApiResultDTO["status"];reasonCodes:readonly WorkflowApiPublicReasonCode[]};

type ResultBase<S extends string>={responseVersion:"1.0";status:S;operation:WorkflowApiOperation};
export type CompletedWorkflowDTO=ResultBase<"completed">&{assets:readonly WorkflowAssetDTO[];resultReference:WorkflowResultReferenceDTO};
export type DegradedWorkflowDTO=ResultBase<"degraded">&{assets:readonly WorkflowAssetDTO[];resultReference:WorkflowResultReferenceDTO};
export type PartialWorkflowDTO=ResultBase<"partial">&{assets:readonly WorkflowAssetDTO[];resultReference:WorkflowResultReferenceDTO};
export type PendingUploadWorkflowDTO=ResultBase<"pending-upload">&{reference:UploadPendingReferenceDTO;retryAdvice?:WorkflowRetryAdviceDTO;progress?:WorkflowProgressDTO};
export type PendingGenerationWorkflowDTO=ResultBase<"pending-generation">&{reference:GenerationJobReferenceDTO;retryAdvice?:WorkflowRetryAdviceDTO;progress?:WorkflowProgressDTO};
export type FailedWorkflowDTO=ResultBase<"failed">&{error:WorkflowApiErrorDTO;resultReference:WorkflowResultReferenceDTO};
export type CancelledWorkflowDTO=ResultBase<"cancelled">&{resultReference:WorkflowResultReferenceDTO};
export type WorkflowApiResultDTO=CompletedWorkflowDTO|DegradedWorkflowDTO|PartialWorkflowDTO|PendingUploadWorkflowDTO|PendingGenerationWorkflowDTO|FailedWorkflowDTO|CancelledWorkflowDTO;

export type WorkflowApiErrorCode="request-invalid"|"request-version-unsupported"|"operation-unsupported"|"unauthenticated"|"unauthorized"|"reference-unavailable"|"reference-expired"|"idempotency-conflict"|"workflow-conflict"|"workflow-failed"|"workflow-cancelled"|"rate-limited"|"temporarily-unavailable"|"timeout"|"reconciliation-required"|"internal-error";
export type WorkflowApiErrorDTO={errorVersion:"1.0";code:WorkflowApiErrorCode;message:string;retryable:boolean;retryAfterClass?:"short"|"medium"|"long"};
export type WorkflowApiHttpProjection={statusCode:number;headers:readonly {name:string;value:string}[]};
export type WorkflowApiServiceResult={status:"success";http:WorkflowApiHttpProjection;body:WorkflowApiResultDTO}|{status:"error";http:WorkflowApiHttpProjection;body:WorkflowApiErrorDTO};
export type WorkflowApiServiceInput<T extends WorkflowApiRequest>={request:T;principal:WorkflowApiPrincipal;context:WorkflowApiRequestContext};

export type WorkflowApiDescriptor={descriptorVersion:"1.0";routeId:string;command:WorkflowApiCommand;method:"POST";path:string;requestVersion:"1.0";responseVersion:"1.0";supportedOperations:readonly WorkflowApiOperation[];authenticationRequired:true;idempotencySupported:boolean;availability:"available"|"disabled";runtimeScope:"single-process-reference"};
export type WorkflowApiRegistry={list():readonly WorkflowApiDescriptor[];get(routeId:string):WorkflowApiDescriptor|undefined};
