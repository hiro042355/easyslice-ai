import assert from "node:assert/strict";
import test from "node:test";
import {
  extractSafeYtDlpStderrSignature,
  YtDlpProcessFailure,
} from "../../lib/server/packagedYtDlp";
import { AcquisitionTelemetryCollector } from "../../lib/server/acquisitionWorker/telemetry";
import {
  emitAcquisitionWorkerSafeYtDlpFailureLog,
  projectAcquisitionWorkerYtDlpFailure,
  serializeAcquisitionWorkerSafeYtDlpFailureLog,
} from "../../worker/acquisition/safeYtDlpFailureLog";

const runtime = Object.freeze({ pluginArtifact: true, nodeConfigured: true, nodeExecutable: true,
  nodeVersionMatch: true, ejsAvailable: true });
const telemetry = (stage: "PLAYER" | "GVS" | "MEDIA" | "UNKNOWN" = "UNKNOWN") => {
  const collector = new AcquisitionTelemetryCollector(runtime);
  collector.providerTokenResponse(true, true, stage === "PLAYER" ? "PLAYER" : stage === "GVS" ? "GVS" : "UNKNOWN");
  collector.processEvidence({ tokenContext: stage === "GVS" ? "GVS" : stage === "PLAYER" ? "PLAYER" : "UNKNOWN",
    tokenConsumedByYtDlp: stage === "UNKNOWN" ? "UNKNOWN" : "YES", gvsRequestReached: stage === "GVS" || stage === "MEDIA" ? "YES" : "UNKNOWN",
    mediaRequestReached: stage === "MEDIA" ? "YES" : "UNKNOWN", http403Stage: stage });
  collector.failure("unknown-acquisition-failure");
  return collector.snapshot();
};

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
  assert.deepEqual(projectAcquisitionWorkerYtDlpFailure(error, telemetry()), {
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
    providerTokenResponseObserved: "YES",
    providerTokenSchemaValid: "YES",
    tokenContext: "UNKNOWN",
    tokenConsumedByYtDlp: "UNKNOWN",
    playerClient: "MWEB",
    gvsRequestReached: "UNKNOWN",
    mediaRequestReached: "UNKNOWN",
    http403Stage: "UNKNOWN",
    retryCount: 0,
    safeFailureCode: "unknown-acquisition-failure",
    failureStage: "UNKNOWN",
  });
});

test("Worker safe failure evidence contains no raw output or acquisition authority", () => {
  const projected = projectAcquisitionWorkerYtDlpFailure(new YtDlpProcessFailure("extractor-failure"), telemetry());
  const serialized = JSON.stringify(projected);
  assert.doesNotMatch(serialized, /https?:|youtu|video.?id|uid|poToken|tokenHash|tokenLength|cookie|credential|authorization|stdout|stderr|command|filesystem|path|gcs/i);
  assert.deepEqual(Object.keys(projected).sort(), [
    "event", "exitCode", "ffmpegFailure", "has403", "has429", "has5xx", "networkFailure",
    "permissionFailure", "requestedFormatFailure", "safeFailureFamily", "severity", "signal", "writeFailure",
    "providerTokenResponseObserved", "providerTokenSchemaValid", "tokenContext", "tokenConsumedByYtDlp",
    "playerClient", "gvsRequestReached", "mediaRequestReached", "http403Stage", "retryCount",
    "safeFailureCode", "failureStage",
  ].sort());
});

test("Worker emits one single-line JSON event whose allowlisted fields are independently queryable", () => {
  const entry = projectAcquisitionWorkerYtDlpFailure(new YtDlpProcessFailure("network-failure", {
    exitCode: 7, signal: "SIGTERM", timedOut: false, aborted: false,
    stdoutLimitExceeded: false, stderrLimitExceeded: false,
    stderrSignature: extractSafeYtDlpStderrSignature("ERROR: network failure HTTP Error 503"),
  }), telemetry("GVS"));
  const lines: string[] = [];
  emitAcquisitionWorkerSafeYtDlpFailureLog(entry, (line) => lines.push(line));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].includes("\n"), false);
  const jsonPayload = JSON.parse(lines[0]) as Record<string, unknown>;
  const expected = entry as Readonly<Record<string, unknown>>;
  for (const field of Object.keys(entry)) assert.equal(jsonPayload[field], expected[field]);
  assert.equal(jsonPayload.event, "acquisition-process-failure");
  assert.equal(serializeAcquisitionWorkerSafeYtDlpFailureLog(entry), lines[0]);
  assert.equal(jsonPayload.http403Stage, "GVS");
  assert.equal(jsonPayload.retryCount, 0);
});

test("Worker preserves closed PLAYER, GVS, MEDIA, and UNKNOWN stage evidence in the same event", () => {
  for (const stage of ["PLAYER", "GVS", "MEDIA", "UNKNOWN"] as const) {
    const entry = projectAcquisitionWorkerYtDlpFailure(new YtDlpProcessFailure("unknown-yt-dlp-failure"), telemetry(stage));
    assert.equal(entry.http403Stage, stage);
    assert.equal(entry.tokenContext, stage === "MEDIA" ? "UNKNOWN" : stage);
    assert.equal(entry.retryCount, 0);
  }
});

test("Worker rejects arbitrary process metadata before structured logging", () => {
  assert.throws(() => projectAcquisitionWorkerYtDlpFailure(new YtDlpProcessFailure("extractor-failure", {
    exitCode: Number.NaN, signal: null, timedOut: false, aborted: false,
    stdoutLimitExceeded: false, stderrLimitExceeded: false,
    stderrSignature: extractSafeYtDlpStderrSignature(""),
  }), telemetry()), /unsafe acquisition process exit code/);
  assert.throws(() => projectAcquisitionWorkerYtDlpFailure(new YtDlpProcessFailure("extractor-failure", {
    exitCode: null, signal: "PRIVATE_PATH", timedOut: false, aborted: false,
    stdoutLimitExceeded: false, stderrLimitExceeded: false,
    stderrSignature: extractSafeYtDlpStderrSignature(""),
  }), telemetry()), /unsafe acquisition process signal/);
});
