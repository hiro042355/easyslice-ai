import type { Sensitive } from "@/lib/assets/types";
import type {
  MaterializedProviderRequest,
  ProviderOperation,
} from "@/lib/providerRequests/types";
export type { Sensitive } from "@/lib/assets/types";
export type {
  ExecutableProviderRequest,
  MaterializedProviderRequest,
  ProviderOperation,
} from "@/lib/providerRequests/types";
export type ProviderLatencyClass = "fast" | "normal" | "slow" | "timeout";
export type ProviderHttpStatusClass = "2xx" | "4xx" | "5xx" | "network";
export type ProviderTimeoutCategory = "connect" | "request" | "read" | "attempt";
export type ProviderJobState = "created" | "submitting" | "accepted" | "processing" | "completed" | "failed" | "cancelling" | "cancelled" | "expired" | "unknown";

export type ProviderClientCapability = {
  supportsAsyncJobs: boolean; supportsPolling: boolean; supportsWebhook: boolean;
  supportsCancellation: boolean; supportsIdempotencyKey: boolean; supportsRetryAfter: boolean;
  supportsStreamingResponse: boolean; supportsMultipartUpload: boolean;
  supportsRequestCompression: boolean; supportsRegionEndpoint: boolean;
};

export type ProviderCredentialHandle = { credentialRef: string; providerId: string; credentialVersion: string };
export type ProviderCredentialState = "valid" | "missing" | "expired" | "revoked" | "wrong-provider" | "insufficient-scope";
export type ProviderTimeoutPolicy = { policyVersion: "1.0"; connectTimeoutMs: number; requestTimeoutMs: number; totalAttemptTimeoutMs: number };
export type ProviderCorrelationContext = { operationId: string; attempt: number; workflowRunRef?: string };
export type ProviderIdempotencyContext = { keyRef: string };
export type ProviderCancellationState = "active" | "cancelled";

export type ProviderSubmitInput<TBody> = { contractVersion: "1.0"; request: MaterializedProviderRequest<TBody>; credentialHandle: ProviderCredentialHandle; timeoutPolicy: ProviderTimeoutPolicy; correlation: ProviderCorrelationContext; idempotency?: ProviderIdempotencyContext; cancellationState?: ProviderCancellationState };
export type ProviderPollInput = { contractVersion: "1.0"; job: ProviderJobReference; credentialHandle: ProviderCredentialHandle; timeoutPolicy: ProviderTimeoutPolicy; correlation: ProviderCorrelationContext; cancellationState?: ProviderCancellationState };
export type ProviderCancelInput = ProviderPollInput;

export type ProviderRetryReason = "rate-limit" | "timeout" | "provider-unavailable" | "connection-reset" | "temporary-authentication" | "unknown-transient" | "not-retryable";
export type ProviderRetryAdvice = { retryable: boolean; retryAfterMs?: number; reason: ProviderRetryReason };
export type ProviderClientErrorCategory = "authentication" | "authorization" | "rate-limit" | "invalid-request" | "unsupported" | "content-policy" | "payload-too-large" | "asset-access-expired" | "timeout" | "network" | "provider-unavailable" | "malformed-response" | "generation-failed" | "job-not-found" | "cancelled" | "unknown";
export type NormalizedProviderClientError = { category: ProviderClientErrorCategory; retryable: boolean; retryAfterMs?: number; safeCode?: string };
export type SafeRateLimitMetadata = { retryAfterMs?: number; remainingClass: "none" | "low" | "available" | "unknown"; limitClass?: "minute" | "day" | "concurrent" | "unknown" };
export type SafeTransportMetadata = { httpStatusClass?: ProviderHttpStatusClass; latencyClass: ProviderLatencyClass; attempt: number; requestAccepted: boolean; rateLimit?: SafeRateLimitMetadata; timeoutCategory?: ProviderTimeoutCategory };

/** Restricted identifier: never copy jobReference into ordinary audit or analytics. */
export type ProviderJobReference = Sensitive<{ providerId: string; operation: ProviderOperation; jobReference: string; clientVersion: string; providerApiVersion: string }>;
export type ProviderClientAttemptResult<T> =
  | { status: "completed"; data: T; retryAdvice: ProviderRetryAdvice; transport: SafeTransportMetadata }
  | { status: "accepted"; job: ProviderJobReference; retryAdvice: ProviderRetryAdvice; transport: SafeTransportMetadata }
  | { status: "pending"; progress?: number; retryAdvice: ProviderRetryAdvice; transport: SafeTransportMetadata }
  | { status: "cancelled"; retryAdvice: ProviderRetryAdvice; transport: SafeTransportMetadata }
  | { status: "failed"; error: NormalizedProviderClientError; retryAdvice: ProviderRetryAdvice; transport: SafeTransportMetadata };
export type ProviderSubmitResult<T> = Extract<ProviderClientAttemptResult<T>, { status: "completed" | "accepted" | "failed" }>;
export type ProviderPollResult<T> = Extract<ProviderClientAttemptResult<T>, { status: "pending" | "completed" | "failed" | "cancelled" }>;
export type ProviderCancelResult =
  | { status: "cancelled"; transport: SafeTransportMetadata }
  | { status: "already-completed"; transport: SafeTransportMetadata }
  | { status: "not-supported"; transport: SafeTransportMetadata }
  | { status: "failed"; error: NormalizedProviderClientError; retryAdvice: ProviderRetryAdvice; transport: SafeTransportMetadata };

export type ProviderClient<TBody, TSafeResponse> = {
  readonly clientId: string; readonly clientVersion: string; readonly providerId: string;
  readonly providerApiVersion: string; readonly capability: ProviderClientCapability;
  submit(input: ProviderSubmitInput<TBody>): Promise<ProviderSubmitResult<TSafeResponse>>;
  poll(input: ProviderPollInput): Promise<ProviderPollResult<TSafeResponse>>;
  cancel(input: ProviderCancelInput): Promise<ProviderCancelResult>;
};
export type ProviderClientAvailability = "available" | "disabled";
export type ProviderClientDescriptor = { providerId: string; clientId: string; clientVersion: string; providerApiVersion: string; capability: ProviderClientCapability; endpointConfigRef: string; availability: ProviderClientAvailability };

export type {
  ReferenceProviderClientConfig,
  ReferenceProviderRequestBody,
  ReferenceSafeResponseDTO,
  ReferenceTransportScenario,
} from "@/lib/providerClients/referenceTypes";
