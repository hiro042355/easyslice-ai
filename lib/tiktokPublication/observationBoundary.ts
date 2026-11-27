import { isTikTokPublicationObservation, type TikTokPublicationObservation } from "../publicationIntegration/observation";

/**
 * Adapter -> Core observation boundary.
 *
 * The adapter never writes Core state. It reports what it observed, and Core
 * decides the transition. This boundary is the only thing standing between a
 * compromised adapter process and an arbitrary state write, so it validates the
 * shape strictly and leaves every policy decision to `applyPublicationObservation`.
 */
export const TIKTOK_OBSERVATION_REQUEST_VERSION = "publication-observation-v1" as const;
export const TIKTOK_OBSERVATION_MAX_BODY_BYTES = 8192;

const requiredKeys = [
  "requestVersion",
  "ownerUid",
  "tenantId",
  "publicationId",
  "observationId",
  "observation",
] as const;
const optionalKeys = new Set(["provider", "error"]);
const identifier = /^[A-Za-z0-9_.:@-]{1,256}$/;
const uuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
const statusPattern = /^[A-Za-z0-9_.:-]{1,64}$/;

export type AdapterObservationReport = Readonly<{
  requestVersion: typeof TIKTOK_OBSERVATION_REQUEST_VERSION;
  ownerUid: string;
  tenantId: string;
  publicationId: string;
  observationId: string;
  observation: TikTokPublicationObservation;
  provider?: Readonly<{ publishId?: string; providerStatus?: string; observedAt?: string }>;
  error?: Readonly<{ code: string; message?: string }>;
}>;

export type AdapterObservationBoundaryResult =
  | Readonly<{ code: "REPORT_ACCEPTED"; report: AdapterObservationReport }>
  | Readonly<{ code: "REPORT_REJECTED"; status: 400 | 413 | 415; error: string }>;

const reject = (status: 400 | 413 | 415, error: string): AdapterObservationBoundaryResult =>
  Object.freeze({ code: "REPORT_REJECTED" as const, status, error });

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const readProvider = (value: unknown): AdapterObservationReport["provider"] | undefined | null => {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value);
  if (keys.some((key) => !["publishId", "providerStatus", "observedAt"].includes(key))) return null;
  const publishId = value.publishId;
  if (publishId !== undefined && (typeof publishId !== "string" || !identifier.test(publishId))) return null;
  const providerStatus = value.providerStatus;
  if (providerStatus !== undefined && (typeof providerStatus !== "string" || !statusPattern.test(providerStatus))) return null;
  const observedAt = value.observedAt;
  if (observedAt !== undefined && (typeof observedAt !== "string" || Number.isNaN(Date.parse(observedAt)))) return null;
  return Object.freeze({
    ...(publishId === undefined ? {} : { publishId: publishId as string }),
    ...(providerStatus === undefined ? {} : { providerStatus: providerStatus as string }),
    ...(observedAt === undefined ? {} : { observedAt: observedAt as string }),
  });
};

const readError = (value: unknown): AdapterObservationReport["error"] | undefined | null => {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value);
  if (keys.some((key) => !["code", "message"].includes(key))) return null;
  if (typeof value.code !== "string" || !statusPattern.test(value.code)) return null;
  const message = value.message;
  if (message !== undefined && (typeof message !== "string" || message.length > 512)) return null;
  return Object.freeze({
    code: value.code,
    ...(message === undefined ? {} : { message: message as string }),
  });
};

const parseReport = (value: unknown): AdapterObservationReport | undefined => {
  if (!isPlainObject(value)) return undefined;
  const keys = Object.keys(value);
  if (keys.some((key) => !requiredKeys.includes(key as (typeof requiredKeys)[number]) && !optionalKeys.has(key))) return undefined;
  if (requiredKeys.some((key) => !(key in value))) return undefined;

  if (value.requestVersion !== TIKTOK_OBSERVATION_REQUEST_VERSION) return undefined;
  const { ownerUid, tenantId } = value;
  if (typeof ownerUid !== "string" || !identifier.test(ownerUid)) return undefined;
  if (typeof tenantId !== "string" || !identifier.test(tenantId)) return undefined;
  if (typeof value.publicationId !== "string" || !uuid.test(value.publicationId)) return undefined;
  if (typeof value.observationId !== "string" || !identifier.test(value.observationId)) return undefined;
  if (!isTikTokPublicationObservation(value.observation)) return undefined;

  // A rejection must carry its code; a success must carry its provider publication id.
  const error = readError(value.error);
  const provider = readProvider(value.provider);
  if (error === null || provider === null) return undefined;
  if (value.observation === "PERMANENT_FAILURE" || value.observation === "AUTH_FAILED") {
    if (!error) return undefined;
  }
  if (value.observation === "PUBLISH_PRIVATE_CONFIRMED" && !provider?.publishId) return undefined;

  return Object.freeze({
    requestVersion: TIKTOK_OBSERVATION_REQUEST_VERSION,
    ownerUid,
    tenantId,
    publicationId: value.publicationId,
    observationId: value.observationId,
    observation: value.observation,
    ...(provider === undefined ? {} : { provider }),
    ...(error === undefined ? {} : { error }),
  });
};

export async function readTikTokObservationReport(request: {
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}): Promise<AdapterObservationBoundaryResult> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return reject(415, "observation_content_type_unsupported");
  }
  let body: string;
  try {
    body = await request.text();
  } catch {
    return reject(400, "observation_body_unreadable");
  }
  if (body.length > TIKTOK_OBSERVATION_MAX_BODY_BYTES) return reject(413, "observation_body_too_large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return reject(400, "observation_body_malformed");
  }
  const report = parseReport(parsed);
  if (!report) return reject(400, "observation_report_invalid");
  return Object.freeze({ code: "REPORT_ACCEPTED" as const, report });
}
