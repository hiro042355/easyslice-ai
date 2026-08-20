import { validateYouTubeVideoUrl, YouTubeIngestionFailure } from "../youtubeIngestion";
import {
  ACQUISITION_DEFAULT_TIMEOUT_MS,
  ACQUISITION_FAILURE_CODES,
  ACQUISITION_MAX_BYTES,
  ACQUISITION_OUTPUT_PROFILE,
  ACQUISITION_REQUEST_VERSION,
  AcquisitionWorkerFailure,
  type AcquisitionRequest,
  type AcquisitionResult,
} from "./types";

const ACQUISITION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_KEYS = new Set([
  "requestVersion", "acquisitionId", "source", "sourceUrl", "requestedOutputProfile", "maxBytes", "timeoutMs",
]);
const FAILURE_CODES = new Set<string>(ACQUISITION_FAILURE_CODES);

export type ValidatedAcquisitionRequest = Readonly<{
  requestVersion: typeof ACQUISITION_REQUEST_VERSION;
  acquisitionId: string;
  source: "youtube";
  sourceUrl: string;
  requestedOutputProfile: typeof ACQUISITION_OUTPUT_PROFILE;
  maxBytes: number;
  timeoutMs: number;
}>;

export const validateAcquisitionRequest = (input: unknown): ValidatedAcquisitionRequest => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AcquisitionWorkerFailure("invalid-acquisition-request");
  }
  const candidate = input as Partial<AcquisitionRequest> & Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !REQUEST_KEYS.has(key))) {
    throw new AcquisitionWorkerFailure("invalid-acquisition-request");
  }
  const acquisitionId = candidate.acquisitionId;
  if (typeof acquisitionId !== "string" || !ACQUISITION_ID.test(acquisitionId)) {
    throw new AcquisitionWorkerFailure("invalid-acquisition-id");
  }
  if (candidate.requestVersion !== ACQUISITION_REQUEST_VERSION
    || candidate.source !== "youtube"
    || candidate.requestedOutputProfile !== ACQUISITION_OUTPUT_PROFILE) {
    throw new AcquisitionWorkerFailure(candidate.source === "youtube"
      ? "invalid-acquisition-request"
      : "unsupported-source");
  }
  let canonicalUrl: string;
  try {
    canonicalUrl = validateYouTubeVideoUrl(candidate.sourceUrl).canonicalUrl;
  } catch (error) {
    if (error instanceof YouTubeIngestionFailure) throw new AcquisitionWorkerFailure("invalid-source-url");
    throw error;
  }
  const maxBytes = candidate.maxBytes ?? ACQUISITION_MAX_BYTES;
  const timeoutMs = candidate.timeoutMs ?? ACQUISITION_DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > ACQUISITION_MAX_BYTES
    || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > ACQUISITION_DEFAULT_TIMEOUT_MS) {
    throw new AcquisitionWorkerFailure("invalid-acquisition-request");
  }
  return Object.freeze({
    requestVersion: ACQUISITION_REQUEST_VERSION,
    acquisitionId,
    source: "youtube",
    sourceUrl: canonicalUrl,
    requestedOutputProfile: ACQUISITION_OUTPUT_PROFILE,
    maxBytes,
    timeoutMs,
  });
};

export const acquisitionRequestFingerprint = (request: ValidatedAcquisitionRequest): string => JSON.stringify(request);

const exactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
};

export const validateAcquisitionResult = (input: unknown): AcquisitionResult => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("invalid-acquisition-result");
  const result = input as Record<string, unknown>;
  if (typeof result.acquisitionId !== "string" || !ACQUISITION_ID.test(result.acquisitionId)) {
    throw new TypeError("invalid-acquisition-result");
  }
  if (result.status === "failed") {
    if (!exactKeys(result, ["acquisitionId", "status", "errorCode", "retryable"])
      || typeof result.errorCode !== "string" || !FAILURE_CODES.has(result.errorCode)
      || typeof result.retryable !== "boolean") {
      throw new TypeError("invalid-acquisition-result");
    }
    return Object.freeze({ ...result }) as AcquisitionResult;
  }
  if (result.status === "succeeded") {
    if (!exactKeys(result, ["acquisitionId", "status", "artifactReference", "media"])
      || typeof result.artifactReference !== "string" || !result.media || typeof result.media !== "object") {
      throw new TypeError("invalid-acquisition-result");
    }
    const media = result.media as Record<string, unknown>;
    if (!exactKeys(media, ["contentType", "byteSize", "durationSeconds", "hasVideo", "hasAudio"])
      || media.contentType !== "video/mp4" || media.hasVideo !== true || typeof media.hasAudio !== "boolean"
      || !Number.isSafeInteger(media.byteSize) || (media.byteSize as number) <= 0
      || typeof media.durationSeconds !== "number" || !Number.isFinite(media.durationSeconds) || media.durationSeconds <= 0) {
      throw new TypeError("invalid-acquisition-result");
    }
    return Object.freeze({ ...result, media: Object.freeze({ ...media }) }) as AcquisitionResult;
  }
  throw new TypeError("invalid-acquisition-result");
};
