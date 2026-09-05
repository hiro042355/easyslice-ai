export const ACQUISITION_REQUEST_VERSION = "1.0" as const;
export const ACQUISITION_OUTPUT_PROFILE = "canonical-mp4" as const;
export const ACQUISITION_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const ACQUISITION_DEFAULT_TIMEOUT_MS = 240_000;

export type AcquisitionSource = "youtube";

export type AcquisitionRequest = Readonly<{
  requestVersion: typeof ACQUISITION_REQUEST_VERSION;
  acquisitionId: string;
  source: AcquisitionSource;
  sourceUrl: string;
  requestedOutputProfile: typeof ACQUISITION_OUTPUT_PROFILE;
  maxBytes?: number;
  timeoutMs?: number;
}>;

export const ACQUISITION_FAILURE_CODES = [
  "invalid-acquisition-request",
  "invalid-acquisition-id",
  "idempotency-conflict",
  "invalid-source-url",
  "unsupported-source",
  "youtube-bot-check",
  "youtube-sign-in-required",
  "video-unavailable",
  "private-video",
  "age-restricted",
  "region-restricted",
  "live-stream-unsupported",
  "playlist-unsupported",
  "format-unavailable",
  "js-runtime-unavailable",
  "po-token-provider-unavailable",
  "po-token-provider-failed",
  "network-failure",
  "acquisition-timeout",
  "acquisition-cancelled",
  "acquisition-reconciliation-required",
  "output-too-large",
  "malformed-media",
  "ffmpeg-failed",
  "handoff-configuration-failure",
  "handoff-artifact-invalid",
  "handoff-conflict",
  "handoff-definitive-failure",
  "handoff-outcome-ambiguous",
  "unknown-acquisition-failure",
] as const;

export type AcquisitionFailureCode = (typeof ACQUISITION_FAILURE_CODES)[number];

export type AcquisitionMediaMetadata = Readonly<{
  contentType: "video/mp4";
  byteSize: number;
  durationSeconds: number;
  hasVideo: true;
  hasAudio: boolean;
}>;

export type AcquisitionArtifactHandoff = Readonly<{
  artifactReference: string;
  contentType: "video/mp4";
  byteSize: number;
  sha256: string;
  workerObservedDurationSeconds: number;
  videoPresent: true;
  audioPresent: boolean;
  expiresAt: string;
}>;

export type AcquisitionSuccess = Readonly<{
  acquisitionId: string;
  status: "succeeded";
  artifactReference: string;
  media: AcquisitionMediaMetadata;
  handoff: AcquisitionArtifactHandoff;
}>;

export type AcquisitionFailure = Readonly<{
  acquisitionId: string;
  status: "failed";
  errorCode: AcquisitionFailureCode;
  retryable: boolean;
}>;

export type AcquisitionResult = AcquisitionSuccess | AcquisitionFailure;

export class AcquisitionWorkerFailure extends Error {
  constructor(readonly code: AcquisitionFailureCode, readonly retryable = false) {
    super(code);
    this.name = "AcquisitionWorkerFailure";
  }
}
