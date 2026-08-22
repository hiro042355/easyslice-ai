import assert from "node:assert/strict";
import test from "node:test";
import {
  extractSafeYtDlpStderrSignature,
  YtDlpProcessFailure,
} from "../../lib/server/packagedYtDlp";
import { projectAcquisitionWorkerYtDlpFailure } from "../../worker/acquisition/safeYtDlpFailureLog";

test("Worker projects only the closed safe post-provider process failure evidence", () => {
  const error = new YtDlpProcessFailure("unknown-yt-dlp-failure", {
    exitCode: 1,
    signal: null,
    timedOut: false,
    aborted: false,
    stdoutLimitExceeded: false,
    stderrLimitExceeded: false,
    stderrSignature: extractSafeYtDlpStderrSignature(
      "ERROR: HTTP Error 403; requested format failed; ffmpeg writing permission denied",
    ),
  });
  assert.deepEqual(projectAcquisitionWorkerYtDlpFailure(error), {
    event: "acquisition-worker-yt-dlp-failure",
    exitCode: 1,
    signal: null,
    safeFailureFamily: "unknown-yt-dlp-failure",
    formatEnumerationObserved: "UNKNOWN",
    mediaRequestObserved: "UNKNOWN",
    mediaBytesObserved: "UNKNOWN",
    postprocessObserved: "YES",
    validationReached: "NO",
    has403: true,
    has429: false,
    has5xx: false,
    requestedFormatFailure: true,
    ffmpegFailure: true,
    writeFailure: true,
    permissionFailure: true,
    networkFailure: false,
  });
});

test("Worker safe failure evidence contains no raw output or acquisition authority", () => {
  const projected = projectAcquisitionWorkerYtDlpFailure(new YtDlpProcessFailure("extractor-failure"));
  const serialized = JSON.stringify(projected);
  assert.doesNotMatch(serialized, /https?:|youtu|video.?id|uid|token|cookie|credential|authorization|stdout|stderr|command|filesystem|path|gcs/i);
  assert.deepEqual(Object.keys(projected).sort(), [
    "event", "exitCode", "ffmpegFailure", "formatEnumerationObserved", "has403", "has429", "has5xx",
    "mediaBytesObserved", "mediaRequestObserved", "networkFailure", "permissionFailure", "postprocessObserved",
    "requestedFormatFailure", "safeFailureFamily", "signal", "validationReached", "writeFailure",
  ].sort());
});
