import assert from "node:assert/strict";
import test from "node:test";
import { projectExpectedOutput } from "../../lib/operationPipelines/referenceExpectedOutputs";

for (const [operation, request, kind, mime] of [
  ["generate-vocal", { requestSchemaVersion: "1.0", durationSeconds: 30, outputFormat: "wav" }, "voice", "audio/wav"],
  ["generate-music", { requestSchemaVersion: "1.0", durationSeconds: 60, outputFormat: "mp3" }, "audio", "audio/mpeg"],
  ["generate-mv", { requestSchemaVersion: "1.0", durationSeconds: 90, outputFormat: "mp4", resolution: "1080p", aspectRatio: "16:9" }, "video", "video/mp4"],
] as const) {
  test(`projects ${operation} expected output without claiming provider success`, () => {
    const result = projectExpectedOutput(operation, request as never);
    assert.equal(result.status, "projected");
    if (result.status !== "projected") return;
    assert.equal(result.expected.kind, kind);
    assert.deepEqual(result.expected.allowedMimeTypes, [mime]);
    assert.equal("providerResult" in result, false);
  });
}

test("fails safely for invalid or unsupported expected-output input", () => {
  for (const [operation, request] of [["generate-vocal", { requestSchemaVersion: "1.0", durationSeconds: 0 }], ["unsupported", { requestSchemaVersion: "1.0", durationSeconds: 30 }]] as const) {
    const result = projectExpectedOutput(operation, request as never);
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.equal(result.issues[0]?.reasonCode, "expected-output-invalid");
  }
});
