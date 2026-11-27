import { canonicalJson, hmacSha256Base64Url, macEquals, sha256Hex } from "./canonicalJson";

/**
 * Core -> adapter publication transport (CORE_R11 handoff, transport leg).
 *
 * The grant already proves *what* may be published. This layer proves *who* is
 * asking, so the adapter can reject an unauthenticated caller before it ever
 * touches a token. The request signature covers the exact body bytes, so a
 * replayed or edited body cannot be paired with a valid signature.
 *
 * No provider credential travels here: the request carries only the signed
 * grant token.
 */
export const ADAPTER_TRANSPORT_VERSION = "publication-transport-v1" as const;
export const ADAPTER_PUBLICATION_PATH = "/publications/tiktok" as const;
/** Adapter -> Core observation leg. Same signature rule, its own path. */
export const ADAPTER_OBSERVATION_PATH = "/publications/tiktok/observations" as const;
export const ADAPTER_REQUEST_MAX_SKEW_MS = 60_000;
export const ADAPTER_REQUEST_TIMEOUT_MS = 30_000;

export type AdapterTransportHeaders = Readonly<{
  "content-type": "application/json";
  "x-nexcut-transport-key-id": string;
  "x-nexcut-transport-timestamp": string;
  "x-nexcut-transport-signature": string;
}>;

/** Mirrors the adapter's AdapterPublicationResult union. */
export type AdapterPublicationResult =
  | Readonly<{ code: "PUBLISHED_PRIVATE"; publicationId: string; publishId: string }>
  | Readonly<{ code: "OUTCOME_UNKNOWN"; publicationId: string }>
  | Readonly<{ code: "GRANT_REJECTED"; reason: string }>
  | Readonly<{ code: "ACCOUNT_NOT_BOUND"; publicationId: string }>
  | Readonly<{ code: "ASSET_REJECTED"; publicationId: string; reason: string }>
  | Readonly<{ code: "DUPLICATE_PUBLICATION"; publicationId: string; publishId?: string }>
  | Readonly<{ code: "CORE_STATE_REJECTED"; publicationId: string; coreCode: string }>
  | Readonly<{ code: "AUTH_FAILED"; publicationId: string }>
  | Readonly<{ code: "PROVIDER_REJECTED"; publicationId: string; providerCode: string }>;

const RESULT_CODES: ReadonlySet<string> = new Set([
  "PUBLISHED_PRIVATE",
  "OUTCOME_UNKNOWN",
  "GRANT_REJECTED",
  "ACCOUNT_NOT_BOUND",
  "ASSET_REJECTED",
  "DUPLICATE_PUBLICATION",
  "CORE_STATE_REJECTED",
  "AUTH_FAILED",
  "PROVIDER_REJECTED",
]);

export type AdapterCallOutcome =
  | Readonly<{ code: "ADAPTER_RESULT"; result: AdapterPublicationResult }>
  /**
   * The request may or may not have reached TikTok. The caller must record
   * OUTCOME_UNKNOWN and reconcile by publication id; it must not re-send.
   */
  | Readonly<{ code: "TRANSPORT_FAILURE"; reason: "NETWORK" | "TIMEOUT" | "STATUS"; status?: number }>
  | Readonly<{ code: "MALFORMED_RESPONSE"; status: number }>;

/**
 * Signature message for one signed leg. The path is part of the message, so a
 * signature minted for a publication request cannot be replayed against the
 * observation endpoint.
 */
export const adapterSignatureMessage = (
  path: string,
  body: string,
  timestampMs: number,
): string =>
  [ADAPTER_TRANSPORT_VERSION, "POST", path, String(timestampMs), sha256Hex(body)].join("\n");

export const adapterRequestSignatureMessage = (
  body: string,
  timestampMs: number,
): string => adapterSignatureMessage(ADAPTER_PUBLICATION_PATH, body, timestampMs);

export type AdapterPublicationRequest = Readonly<{
  path: typeof ADAPTER_PUBLICATION_PATH;
  body: string;
  headers: AdapterTransportHeaders;
}>;

/**
 * Builds the signed request. The body is the canonical form of `{ grant }`, so
 * Core and adapter hash the same bytes.
 */
export function buildAdapterPublicationRequest(input: Readonly<{
  grant: string;
  keyId: string;
  secret: string;
  now?: number;
}>): AdapterPublicationRequest | undefined {
  if (!input.grant || !input.keyId || !input.secret) return undefined;
  const body = canonicalJson({ grant: input.grant });
  if (body === undefined) return undefined;
  const timestampMs = input.now ?? Date.now();
  return Object.freeze({
    path: ADAPTER_PUBLICATION_PATH,
    body,
    headers: Object.freeze({
      "content-type": "application/json" as const,
      "x-nexcut-transport-key-id": input.keyId,
      "x-nexcut-transport-timestamp": String(timestampMs),
      "x-nexcut-transport-signature": hmacSha256Base64Url(
        input.secret,
        adapterRequestSignatureMessage(body, timestampMs),
      ),
    }),
  });
}

/**
 * Independent verifier for one signed leg (the adapter verifies Core with the
 * same rule, and Core verifies adapter observations with it in reverse).
 */
export function verifyAdapterSignedRequest(input: Readonly<{
  path: string;
  body: string;
  headers: Readonly<Record<string, string | undefined>>;
  secrets: Readonly<Record<string, string>>;
  now?: number;
  maxSkewMs?: number;
}>): "VERIFIED" | "UNAUTHENTICATED" | "STALE" {
  const keyId = input.headers["x-nexcut-transport-key-id"];
  const timestamp = input.headers["x-nexcut-transport-timestamp"];
  const signature = input.headers["x-nexcut-transport-signature"];
  if (!keyId || !timestamp || !signature) return "UNAUTHENTICATED";
  const secret = input.secrets[keyId];
  if (!secret) return "UNAUTHENTICATED";
  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs)) return "UNAUTHENTICATED";
  const expected = hmacSha256Base64Url(secret, adapterSignatureMessage(input.path, input.body, timestampMs));
  if (!macEquals(expected, signature)) return "UNAUTHENTICATED";
  const now = input.now ?? Date.now();
  const skew = input.maxSkewMs ?? ADAPTER_REQUEST_MAX_SKEW_MS;
  if (Math.abs(now - timestampMs) > skew) return "STALE";
  return "VERIFIED";
}

/** Verifier for the Core publication endpoint's inbound request leg. */
export const verifyAdapterRequestSignature = (input: Readonly<{
  body: string;
  headers: Readonly<Record<string, string | undefined>>;
  secrets: Readonly<Record<string, string>>;
  now?: number;
  maxSkewMs?: number;
}>): "VERIFIED" | "UNAUTHENTICATED" | "STALE" =>
  verifyAdapterSignedRequest({ ...input, path: ADAPTER_PUBLICATION_PATH });

/** Verifier for the adapter -> Core observation leg. */
export const verifyAdapterObservationSignature = (input: Readonly<{
  body: string;
  headers: Readonly<Record<string, string | undefined>>;
  secrets: Readonly<Record<string, string>>;
  now?: number;
  maxSkewMs?: number;
}>): "VERIFIED" | "UNAUTHENTICATED" | "STALE" =>
  verifyAdapterSignedRequest({ ...input, path: ADAPTER_OBSERVATION_PATH });

const isAdapterPublicationResult = (value: unknown): value is AdapterPublicationResult => {
  if (typeof value !== "object" || value === null) return false;
  const code = (value as { code?: unknown }).code;
  return typeof code === "string" && RESULT_CODES.has(code);
};

export type SendAdapterPublicationInput = Readonly<{
  grant: string;
  endpoint: string;
  keyId: string;
  secret: string;
  now?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}>;

/**
 * Sends one publication request. There is deliberately no retry: an ambiguous
 * answer must become OUTCOME_UNKNOWN in Core, not a second TikTok post.
 */
export async function sendTikTokPublication(
  input: SendAdapterPublicationInput,
): Promise<AdapterCallOutcome> {
  const request = buildAdapterPublicationRequest(input);
  if (request === undefined) {
    return Object.freeze({ code: "TRANSPORT_FAILURE" as const, reason: "NETWORK" as const });
  }
  const doFetch = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? ADAPTER_REQUEST_TIMEOUT_MS);
  try {
    const response = await doFetch(`${input.endpoint.replace(/\/+$/, "")}${request.path}`, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
      redirect: "error",
    });
    const text = await response.text();
    if (!response.ok) {
      return Object.freeze({ code: "TRANSPORT_FAILURE" as const, reason: "STATUS" as const, status: response.status });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return Object.freeze({ code: "MALFORMED_RESPONSE" as const, status: response.status });
    }
    if (!isAdapterPublicationResult(parsed)) {
      return Object.freeze({ code: "MALFORMED_RESPONSE" as const, status: response.status });
    }
    return Object.freeze({ code: "ADAPTER_RESULT" as const, result: parsed });
  } catch (error) {
    const aborted = (error as { name?: string } | null)?.name === "AbortError";
    return Object.freeze({
      code: "TRANSPORT_FAILURE" as const,
      reason: aborted ? ("TIMEOUT" as const) : ("NETWORK" as const),
    });
  } finally {
    clearTimeout(timer);
  }
}
