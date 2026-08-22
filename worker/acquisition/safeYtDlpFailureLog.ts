import {
  createSafeYtDlpFailureLog,
  type YtDlpProcessFailure,
  type YtDlpProcessFailureReason,
} from "../../lib/server/packagedYtDlp";

export type AcquisitionWorkerSafeYtDlpFailureLog = Readonly<{
  event: "acquisition-worker-yt-dlp-failure";
  exitCode: number | null;
  signal: string | null;
  safeFailureFamily: YtDlpProcessFailureReason;
  formatEnumerationObserved: "UNKNOWN";
  mediaRequestObserved: "UNKNOWN";
  mediaBytesObserved: "UNKNOWN";
  postprocessObserved: "YES" | "UNKNOWN";
  validationReached: "NO";
  has403: boolean;
  has429: boolean;
  has5xx: boolean;
  requestedFormatFailure: boolean;
  ffmpegFailure: boolean;
  writeFailure: boolean;
  permissionFailure: boolean;
  networkFailure: boolean;
}>;

export const projectAcquisitionWorkerYtDlpFailure = (
  error: YtDlpProcessFailure,
): AcquisitionWorkerSafeYtDlpFailureLog => {
  const safe = createSafeYtDlpFailureLog(error, true);
  return Object.freeze({
    event: "acquisition-worker-yt-dlp-failure",
    exitCode: safe.exitCode,
    signal: safe.signal,
    safeFailureFamily: safe.errorCode,
    formatEnumerationObserved: "UNKNOWN",
    mediaRequestObserved: "UNKNOWN",
    mediaBytesObserved: "UNKNOWN",
    postprocessObserved: safe.hasFfmpeg || safe.hasMerge ? "YES" : "UNKNOWN",
    validationReached: "NO",
    has403: safe.has403,
    has429: safe.has429,
    has5xx: safe.has5xx,
    requestedFormatFailure: safe.hasRequestedFormat,
    ffmpegFailure: safe.hasFfmpeg,
    writeFailure: safe.hasWrite,
    permissionFailure: safe.hasPermission,
    networkFailure: safe.hasNetwork,
  });
};
