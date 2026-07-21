import { deepCopy, deepFreeze, isObject, isPositiveInteger, isSafeOpaqueRef, mapReferenceScenarioToError, nonRetryAdvice, normalizeProgress, parseIsoEpochSeconds } from "./providerClientUtils";
import type { MaterializedProviderRequest, NormalizedProviderClientError, ProviderCancelInput, ProviderCancelResult, ProviderClient, ProviderClientAttemptResult, ProviderClientCapability, ProviderCredentialState, ProviderJobReference, ProviderOperation, ProviderPollResult, ProviderRetryAdvice, ProviderSubmitInput, ProviderSubmitResult, ProviderTimeoutPolicy, ReferenceProviderClientConfig, ReferenceProviderRequestBody, ReferenceSafeResponseDTO, ReferenceTransportScenario, SafeTransportMetadata } from "./types";

export const REFERENCE_PROVIDER_ID = "reference-provider";
export const REFERENCE_PROVIDER_CLIENT_ID = "reference-provider-client-v1";
export const REFERENCE_PROVIDER_CLIENT_VERSION = "1.0.0";
export const REFERENCE_PROVIDER_API_VERSION = "reference-api-v1";

export const REFERENCE_PROVIDER_CLIENT_CAPABILITY: ProviderClientCapability = deepFreeze({ supportsAsyncJobs: true, supportsPolling: true, supportsWebhook: false, supportsCancellation: true, supportsIdempotencyKey: true, supportsRetryAfter: true, supportsStreamingResponse: false, supportsMultipartUpload: false, supportsRequestCompression: false, supportsRegionEndpoint: true });
export const REFERENCE_PROVIDER_TIMEOUT_POLICY: ProviderTimeoutPolicy = deepFreeze({ policyVersion: "1.0", connectTimeoutMs: 5000, requestTimeoutMs: 30000, totalAttemptTimeoutMs: 45000 });
export const REFERENCE_PROVIDER_POLL_TIMEOUT_POLICY: ProviderTimeoutPolicy = deepFreeze({ policyVersion: "1.0", connectTimeoutMs: 5000, requestTimeoutMs: 10000, totalAttemptTimeoutMs: 15000 });
export const REFERENCE_PROVIDER_CLIENT_CONFIG: ReferenceProviderClientConfig = deepFreeze({ scenario: "sync-completed", referenceNowEpochSeconds: 1893456000, minimumAssetLifetimeSeconds: 120, credentialStates: { "credential-valid": "valid", "credential-missing": "missing", "credential-expired": "expired", "credential-revoked": "revoked", "credential-wrong-provider": "wrong-provider", "credential-insufficient-scope": "insufficient-scope" } });

const OPERATIONS: readonly ProviderOperation[] = Object.freeze(["generate-vocal", "generate-music", "generate-mv"]);
const transport = (attempt: number, accepted: boolean, overrides: Partial<SafeTransportMetadata> = {}): SafeTransportMetadata => ({ latencyClass: "normal", attempt, requestAccepted: accepted, ...overrides });
type ReferenceFailure = Extract<ProviderClientAttemptResult<ReferenceSafeResponseDTO>, { status: "failed" }>;
const failed = (attempt: number, category: NormalizedProviderClientError["category"], safeCode?: string): ReferenceFailure => {
  const retryable = category === "rate-limit" || category === "timeout" || category === "network" || category === "provider-unavailable";
  const advice: ProviderRetryAdvice = { retryable, reason: retryable ? category === "rate-limit" ? "rate-limit" : category === "provider-unavailable" ? "provider-unavailable" : "timeout" : "not-retryable" };
  return { status: "failed", error: { category, retryable, ...(safeCode ? { safeCode } : {}) }, retryAdvice: advice, transport: transport(attempt, false, { latencyClass: category === "timeout" ? "timeout" : "fast" }) };
};

function credentialState(handle: unknown, config: ReferenceProviderClientConfig): ProviderCredentialState | "invalid" {
  if (!isObject(handle) || !isSafeOpaqueRef(handle.credentialRef) || !isSafeOpaqueRef(handle.providerId) || !isSafeOpaqueRef(handle.credentialVersion)) return "invalid";
  if (handle.providerId !== REFERENCE_PROVIDER_ID) return "wrong-provider";
  if (handle.credentialVersion !== "reference-v1") return "invalid";
  return config.credentialStates[handle.credentialRef as string] ?? "missing";
}
function credentialFailure(handle: unknown, config: ReferenceProviderClientConfig, attempt: number): ReferenceFailure | undefined {
  const state = credentialState(handle, config);
  if (state === "valid") return undefined;
  if (state === "insufficient-scope") return failed(attempt, "authorization");
  if (state === "wrong-provider" || state === "invalid") return failed(attempt, "invalid-request");
  return failed(attempt, "authentication");
}
function validTimeout(value: unknown): value is ProviderTimeoutPolicy {
  return isObject(value) && value.policyVersion === "1.0" && isPositiveInteger(value.connectTimeoutMs) && isPositiveInteger(value.requestTimeoutMs) && isPositiveInteger(value.totalAttemptTimeoutMs) && value.totalAttemptTimeoutMs <= 300000 && value.connectTimeoutMs <= value.totalAttemptTimeoutMs && value.requestTimeoutMs <= value.totalAttemptTimeoutMs;
}
function validCorrelation(value: unknown): value is ProviderSubmitInput<unknown>["correlation"] { return isObject(value) && isSafeOpaqueRef(value.operationId) && isPositiveInteger(value.attempt) && (value.workflowRunRef === undefined || isSafeOpaqueRef(value.workflowRunRef)); }
function validJob(value: unknown): value is ProviderJobReference { return isObject(value) && value.providerId === REFERENCE_PROVIDER_ID && OPERATIONS.includes(value.operation as ProviderOperation) && isSafeOpaqueRef(value.jobReference, 256) && value.clientVersion === REFERENCE_PROVIDER_CLIENT_VERSION && value.providerApiVersion === REFERENCE_PROVIDER_API_VERSION; }
function requestFingerprint(request: MaterializedProviderRequest<ReferenceProviderRequestBody>): string { const b=request.body; return [request.requestVersion,request.providerId,request.providerApiVersion,request.operation,b.operationPayloadVersion,b.payloadKind,b.inputAssetCount,b.outputFormat,request.assetAccessCount,request.earliestAssetExpiry??"",request.materialization.status,request.materialization.unresolvedAssetCount].join("|"); }
/** Reference-only integration fixture. These are provider output references, never NEXCUT asset IDs. */
function outputReferences(operation: ProviderOperation): readonly string[] {
  if (operation === "generate-vocal") return ["ref-vocal"];
  if (operation === "generate-music") return ["ref-music"];
  return ["ref-video"];
}
function rawResponse(scenario: ReferenceTransportScenario, operation: ProviderOperation): unknown {
  const providerOutputReferences=outputReferences(operation);
  const valid={responseVersion:"1.0",operation,outcome:"completed",providerOutputReferences,safeMetadata:{outputCount:providerOutputReferences.length}};
  if(scenario==="null-body")return null;if(scenario==="array-body")return[];if(scenario==="empty-body")return"";if(scenario==="html-body")return"<html>";if(scenario==="malformed-json")return"{invalid";if(scenario==="missing-field")return{responseVersion:"1.0"};if(scenario==="wrong-field-type")return{...valid,safeMetadata:{outputCount:"one"}};if(scenario==="wrong-version")return{...valid,responseVersion:"2.0"};if(scenario==="unknown-status")return{...valid,outcome:"unknown"};if(scenario==="oversized-response")return{...valid,providerOutputReferences:Array(1025).fill("[opaque-provider-output]")};return valid;
}
function validateResponse(value:unknown,operation:ProviderOperation):ReferenceSafeResponseDTO|undefined{
  if(!isObject(value)||value.responseVersion!=="1.0"||value.operation!==operation||value.outcome!=="completed"||!Array.isArray(value.providerOutputReferences)||value.providerOutputReferences.length>1024||value.providerOutputReferences.some(ref=>!isSafeOpaqueRef(ref,256))||new Set(value.providerOutputReferences).size!==value.providerOutputReferences.length||!isObject(value.safeMetadata)||!Number.isInteger(value.safeMetadata.outputCount)||value.safeMetadata.outputCount!==value.providerOutputReferences.length)return undefined;
  return deepCopy(value as ReferenceSafeResponseDTO);
}
function job(operation: ProviderOperation, suffix: string): ProviderJobReference { return { providerId: REFERENCE_PROVIDER_ID, operation, jobReference: `[opaque-job-${suffix}]`, clientVersion: REFERENCE_PROVIDER_CLIENT_VERSION, providerApiVersion: REFERENCE_PROVIDER_API_VERSION } as ProviderJobReference; }

function validateSubmit(input: unknown, config: ReferenceProviderClientConfig): ReferenceFailure | undefined {
  if (!isObject(input) || input.contractVersion !== "1.0") return failed(1, "invalid-request");
  const request=input.request; if (!isObject(request) || request.requestVersion !== "1.0") return failed(1,"invalid-request");
  if (request.providerId !== REFERENCE_PROVIDER_ID || request.providerApiVersion !== REFERENCE_PROVIDER_API_VERSION || !OPERATIONS.includes(request.operation as ProviderOperation)) return failed(1,"invalid-request");
  if (!isObject(request.body)) return failed(1,"invalid-request");
  const attempt=isObject(input.correlation)&&isPositiveInteger(input.correlation.attempt)?input.correlation.attempt:1;
  const credential=credentialFailure(input.credentialHandle,config,attempt); if(credential)return credential;
  if(!validTimeout(input.timeoutPolicy)||!validCorrelation(input.correlation))return failed(attempt,"invalid-request");
  if(input.idempotency!==undefined&&(!isObject(input.idempotency)||!isSafeOpaqueRef(input.idempotency.keyRef)))return failed(attempt,"invalid-request");
  if(input.idempotency!==undefined&&config.supportsIdempotencyKey===false)return failed(attempt,"unsupported");
  if(input.cancellationState!==undefined&&input.cancellationState!=="active"&&input.cancellationState!=="cancelled")return failed(attempt,"invalid-request");
  if(input.cancellationState==="cancelled")return failed(attempt,"cancelled");
  if(!isPositiveInteger(request.assetAccessCount)&&request.assetAccessCount!==0)return failed(attempt,"invalid-request");
  if(!isObject(request.materialization)||request.materialization.status!=="complete"||request.materialization.unresolvedAssetCount!==0)return failed(attempt,"invalid-request");
  if(request.assetAccessCount===0&&request.earliestAssetExpiry!==undefined)return failed(attempt,"invalid-request");
  if(request.earliestAssetExpiry!==undefined){const expiry=parseIsoEpochSeconds(request.earliestAssetExpiry);if(expiry===undefined)return failed(attempt,"invalid-request");if(expiry-config.referenceNowEpochSeconds<config.minimumAssetLifetimeSeconds)return failed(attempt,"asset-access-expired");}
  const body=request.body;
  const expectedPayloadKind = request.operation === "generate-vocal" ? "vocal" : request.operation === "generate-music" ? "music" : "mv";
  if(body.operationPayloadVersion!=="1.0"||body.payloadKind!==expectedPayloadKind||typeof body.inputAssetCount!=="number"||!Number.isInteger(body.inputAssetCount)||body.inputAssetCount<0||body.inputAssetCount!==request.assetAccessCount||typeof body.outputFormat!=="string"||body.outputFormat.length===0)return failed(attempt,"invalid-request");
}

function jobScenario(reference: string): ReferenceTransportScenario { if(reference.includes("pending"))return"async-pending";if(reference.includes("completed"))return"async-completed";if(reference.includes("failed"))return"provider-failed";if(reference.includes("cancelled"))return"cancelled";if(reference.includes("missing"))return"job-not-found";if(reference.includes("malformed"))return"unknown-status";return"async-pending"; }

export function createReferenceProviderClient(config: ReferenceProviderClientConfig = REFERENCE_PROVIDER_CLIENT_CONFIG): ProviderClient<ReferenceProviderRequestBody, ReferenceSafeResponseDTO> {
  const fixed=deepFreeze(deepCopy(config)); const capability=deepFreeze(deepCopy({ ...REFERENCE_PROVIDER_CLIENT_CAPABILITY, ...(fixed.supportsCancellation===undefined?{}:{supportsCancellation:fixed.supportsCancellation}), ...(fixed.supportsIdempotencyKey===undefined?{}:{supportsIdempotencyKey:fixed.supportsIdempotencyKey}) }));
  const idempotency=new Map<string,{fingerprint:string;result:ProviderSubmitResult<ReferenceSafeResponseDTO>}>();
  const client: ProviderClient<ReferenceProviderRequestBody,ReferenceSafeResponseDTO> = {
    clientId:REFERENCE_PROVIDER_CLIENT_ID,clientVersion:REFERENCE_PROVIDER_CLIENT_VERSION,providerId:REFERENCE_PROVIDER_ID,providerApiVersion:REFERENCE_PROVIDER_API_VERSION,capability,
    async submit(input):Promise<ProviderSubmitResult<ReferenceSafeResponseDTO>>{
      const invalid=validateSubmit(input,fixed);if(invalid)return deepCopy(invalid);
      const attempt=input.correlation.attempt,scenario=fixed.scenario;
      if(input.idempotency){const fingerprint=requestFingerprint(input.request);const old=idempotency.get(input.idempotency.keyRef);if(old){if(old.fingerprint!==fingerprint)return deepCopy(failed(attempt,"invalid-request","idempotency-conflict"));return deepCopy(old.result);}}
      let result:ProviderSubmitResult<ReferenceSafeResponseDTO>;const mapped=mapReferenceScenarioToError(scenario);
      if(mapped)result={status:"failed",error:mapped.error,retryAdvice:mapped.retryAdvice,transport:{...mapped.transportBase,attempt,requestAccepted:scenario==="timeout-after-acceptance"}};
      else if(scenario==="sync-completed"||scenario==="async-completed"){const dto=validateResponse(rawResponse(scenario,input.request.operation),input.request.operation);result=dto?{status:"completed",data:dto,retryAdvice:nonRetryAdvice(),transport:transport(attempt,true,{httpStatusClass:"2xx"})}:failed(attempt,"malformed-response");}
      else if(scenario==="async-accepted"||scenario==="duplicate-idempotency")result={status:"accepted",job:job(input.request.operation,"accepted"),retryAdvice:nonRetryAdvice(),transport:transport(attempt,true,{httpStatusClass:"2xx"})};
      else if(["null-body","array-body","empty-body","html-body","malformed-json","missing-field","wrong-field-type","wrong-version","unknown-status","oversized-response"].includes(scenario)){validateResponse(rawResponse(scenario,input.request.operation),input.request.operation);const malformed=failed(attempt,"malformed-response");result={...malformed,transport:transport(attempt,true,{httpStatusClass:scenario==="html-body"?"5xx":"2xx"})};}
      else result=failed(attempt,"invalid-request");
      if(input.idempotency&&(result.status==="completed"||result.status==="accepted"))idempotency.set(input.idempotency.keyRef,{fingerprint:requestFingerprint(input.request),result:deepFreeze(deepCopy(result))});return deepCopy(result);
    },
    async poll(input):Promise<ProviderPollResult<ReferenceSafeResponseDTO>>{
      const attempt=isObject(input)&&isObject(input.correlation)&&isPositiveInteger(input.correlation.attempt)?input.correlation.attempt:1;
      if(!isObject(input)||input.contractVersion!=="1.0"||!validJob(input.job)||!validTimeout(input.timeoutPolicy)||!validCorrelation(input.correlation))return deepCopy(failed(attempt,"invalid-request"));
      const credential=credentialFailure(input.credentialHandle,fixed,attempt);if(credential)return deepCopy(credential);if(input.cancellationState==="cancelled")return deepCopy(failed(attempt,"cancelled"));
      const scenario=fixed.scenario==="sync-completed"?jobScenario(input.job.jobReference):fixed.scenario;if(scenario==="async-pending"){const progress=normalizeProgress(fixed.progressFixture===undefined?50:fixed.progressFixture);return {status:"pending",...(progress===undefined?{}:{progress}),retryAdvice:nonRetryAdvice(),transport:transport(attempt,true,{httpStatusClass:"2xx"})};}if(scenario==="async-completed"){const dto=validateResponse(rawResponse(scenario,input.job.operation),input.job.operation);return dto?{status:"completed",data:dto,retryAdvice:nonRetryAdvice(),transport:transport(attempt,true,{httpStatusClass:"2xx"})}:deepCopy(failed(attempt,"malformed-response"));}if(scenario==="cancelled")return {status:"cancelled",retryAdvice:nonRetryAdvice(),transport:transport(attempt,true,{httpStatusClass:"2xx"})};const mapped=mapReferenceScenarioToError(scenario)??mapReferenceScenarioToError("unknown-status")!;return {status:"failed",error:mapped.error,retryAdvice:mapped.retryAdvice,transport:{...mapped.transportBase,attempt,requestAccepted:true}};
    },
    async cancel(input:ProviderCancelInput):Promise<ProviderCancelResult>{
      const attempt=isObject(input)&&isObject(input.correlation)&&isPositiveInteger(input.correlation.attempt)?input.correlation.attempt:1;
      if(!isObject(input)||input.contractVersion!=="1.0"||!validJob(input.job)||!validTimeout(input.timeoutPolicy)||!validCorrelation(input.correlation)){const f=failed(attempt,"invalid-request") as Extract<ProviderClientAttemptResult<ReferenceSafeResponseDTO>,{status:"failed"}>;return {status:"failed",error:f.error,retryAdvice:f.retryAdvice,transport:f.transport};}
      const credential=credentialFailure(input.credentialHandle,fixed,attempt);if(credential&&credential.status==="failed")return {status:"failed",error:credential.error,retryAdvice:credential.retryAdvice,transport:credential.transport};if(input.cancellationState==="cancelled"){const f=failed(attempt,"cancelled") as Extract<ProviderClientAttemptResult<ReferenceSafeResponseDTO>,{status:"failed"}>;return {status:"failed",error:f.error,retryAdvice:f.retryAdvice,transport:f.transport};}
      if(!capability.supportsCancellation||input.job.jobReference.includes("unsupported"))return {status:"not-supported",transport:transport(attempt,false)};if(input.job.jobReference.includes("completed"))return {status:"already-completed",transport:transport(attempt,true)};if(input.job.jobReference.includes("failed")){const f=failed(attempt,"provider-unavailable") as Extract<ProviderClientAttemptResult<ReferenceSafeResponseDTO>,{status:"failed"}>;return {status:"failed",error:f.error,retryAdvice:f.retryAdvice,transport:f.transport};}return {status:"cancelled",transport:transport(attempt,true)};
    }
  };return Object.freeze(client);
}
