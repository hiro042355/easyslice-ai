import assert from "node:assert/strict";
import test from "node:test";
import {
  extractSafeYtDlpStderrSignature,
  YtDlpProcessFailure,
} from "../../lib/server/packagedYtDlp";
import {
  emitAcquisitionWorkerSafeYtDlpFailureLog,
  projectAcquisitionWorkerYtDlpFailure,
  serializeAcquisitionWorkerSafeYtDlpFailureLog,
} from "../../worker/acquisition/safeYtDlpFailureLog";

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
    severity: "ERROR",
    event: "acquisition-process-failure",
    exitCode: 1,
    signal: null,
    safeFailureFamily: "unknown-yt-dlp-failure",
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
    "event", "exitCode", "ffmpegFailure", "has403", "has429", "has5xx", "networkFailure",
    "permissionFailure", "requestedFormatFailure", "safeFailureFamily", "severity", "signal", "writeFailure",
  ].sort());
});

test("Worker emits one single-line JSON event whose allowlisted fields are independently queryable", () => {
  const entry = projectAcquisitionWorkerYtDlpFailure(new YtDlpProcessFailure("network-failure", {
    exitCode: 7, signal: "SIGTERM", timedOut: false, aborted: false,
    stdoutLimitExceeded: false, stderrLimitExceeded: false,
    stderrSignature: extractSafeYtDlpStderrSignature("ERROR: network failure HTTP Error 503"),
  }));
  const lines: string[] = [];
  emitAcquisitionWorkerSafeYtDlpFailureLog(entry, (line) => lines.push(line));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].includes("\n"), false);
  const jsonPayload = JSON.parse(lines[0]) as Record<string, unknown>;
  const expected = entry as Readonly<Record<string, unknown>>;
  for (const field of Object.keys(entry)) assert.equal(jsonPayload[field], expected[field]);
  assert.equal(jsonPayload.event, "acquisition-process-failure");
  assert.equal(serializeAcquisitionWorkerSafeYtDlpFailureLog(entry), lines[0]);
});

test("Worker rejects arbitrary process metadata before structured logging", () => {
  assert.throws(() => projectAcquisitionWorkerYtDlpFailure(new YtDlpProcessFailure("extractor-failure", {
    exitCode: Number.NaN, signal: null, timedOut: false, aborted: false,
    stdoutLimitExceeded: false, stderrLimitExceeded: false,
    stderrSignature: extractSafeYtDlpStderrSignature(""),
  })), /unsafe acquisition process exit code/);
  assert.throws(() => projectAcquisitionWorkerYtDlpFailure(new YtDlpProcessFailure("extractor-failure", {
    exitCode: null, signal: "PRIVATE_PATH", timedOut: false, aborted: false,
    stdoutLimitExceeded: false, stderrLimitExceeded: false,
    stderrSignature: extractSafeYtDlpStderrSignature(""),
  })), /unsafe acquisition process signal/);
});
