import type { ProviderOperation } from "@/lib/providerRequests/types";

export type ReferenceTransportScenario =
  | "sync-completed"
  | "async-accepted"
  | "async-pending"
  | "async-completed"
  | "provider-failed"
  | "rate-limited"
  | "rate-limited-no-retry-after"
  | "connect-timeout"
  | "request-timeout"
  | "read-timeout"
  | "provider-unavailable"
  | "authentication-failed"
  | "authorization-failed"
  | "invalid-request"
  | "unsupported"
  | "content-policy"
  | "payload-too-large"
  | "malformed-json"
  | "empty-body"
  | "html-body"
  | "null-body"
  | "array-body"
  | "missing-field"
  | "wrong-field-type"
  | "wrong-version"
  | "oversized-response"
  | "unknown-status"
  | "job-not-found"
  | "cancelled"
  | "cancellation-unsupported"
  | "duplicate-idempotency"
  | "timeout-after-acceptance";

export type ReferenceProviderRequestBody = {
  operationPayloadVersion: "1.0";
  payloadKind: "vocal" | "music" | "mv";
  inputAssetCount: number;
  outputFormat: string;
};

export type ReferenceSafeResponseDTO = {
  responseVersion: "1.0";
  operation: ProviderOperation;
  outcome: "completed";
  providerOutputReferences: readonly string[];
  safeMetadata: { outputCount: number };
};

/** Reference-only execution control. It is not part of MaterializedProviderRequest. */
export type ReferenceProviderClientConfig = {
  scenario: ReferenceTransportScenario;
  referenceNowEpochSeconds: number;
  minimumAssetLifetimeSeconds: number;
  credentialStates: Readonly<Record<string,
    | "valid"
    | "missing"
    | "expired"
    | "revoked"
    | "wrong-provider"
    | "insufficient-scope"
  >>;
  supportsCancellation?: boolean;
  supportsIdempotencyKey?: boolean;
  progressFixture?: number;
};
