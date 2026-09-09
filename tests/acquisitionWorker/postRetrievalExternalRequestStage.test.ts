import assert from "node:assert/strict";
import test from "node:test";
import { extractClosedYtDlpStageTelemetry } from "../../lib/server/packagedYtDlp";

const retrieval = "[debug] [youtube] abc: Retrieved a player PO Token for mweb client";

test("retrieval followed by one authoritative stage projects its bounded enum", () => {
  const cases = [
    ["[youtube] abc: Downloading mweb player API JSON", "PLAYER_API"],
    ["ERROR: gvs request: HTTP Error 403", "GVS_ERROR"],
    ["[download] Destination: private-output", "MEDIA"],
    ["[youtube] abc: Downloading m3u8 information", "HLS_MANIFEST"],
    ["fragment 1 HTTP Error 403", "HLS_FRAGMENT"],
  ] as const;
  for (const [marker, expected] of cases) {
    const evidence = extractClosedYtDlpStageTelemetry(`${retrieval}\n${marker}`);
    assert.equal(evidence.postRetrievalExternalRequestStage, expected);
    assert.equal(evidence.tokenAttachedToOutboundRequest, "UNKNOWN");
    assert.equal(evidence.tokenConsumedByYtDlp, "UNKNOWN");
  }
});

test("stage before retrieval and retrieval without a later stage remain UNKNOWN", () => {
  assert.equal(extractClosedYtDlpStageTelemetry(
    `[youtube] abc: Downloading mweb player API JSON\n${retrieval}`,
  ).postRetrievalExternalRequestStage, "UNKNOWN");
  assert.equal(extractClosedYtDlpStageTelemetry(retrieval).postRetrievalExternalRequestStage, "UNKNOWN");
});

test("multiple retrievals or distinct later stages are ambiguous and remain UNKNOWN", () => {
  assert.equal(extractClosedYtDlpStageTelemetry([
    retrieval,
    "[youtube] abc: Downloading mweb player API JSON",
    "[download] Destination: private-output",
  ].join("\n")).postRetrievalExternalRequestStage, "UNKNOWN");
  assert.equal(extractClosedYtDlpStageTelemetry([
    retrieval,
    retrieval,
    "[download] Destination: private-output",
  ].join("\n")).postRetrievalExternalRequestStage, "UNKNOWN");
});

test("truncated output fails closed even when retrieval and stage markers are present", () => {
  assert.equal(extractClosedYtDlpStageTelemetry(
    `${retrieval}\n[download] Destination: private-output`,
    { outputComplete: false },
  ).postRetrievalExternalRequestStage, "UNKNOWN");
});

test("generic HTTP, 403, media-like text, and speculative player text remain UNKNOWN", () => {
  for (const marker of [
    "ERROR: HTTP Error 403",
    "generic media request started",
    "Downloading player API JSON",
    "[youtube] abc: Downloading web player API JSON",
    "GVS request completed",
  ]) {
    assert.equal(extractClosedYtDlpStageTelemetry(`${retrieval}\n${marker}`)
      .postRetrievalExternalRequestStage, "UNKNOWN");
  }
});

test("projection never retains token-shaped text, URLs, identifiers, or raw stderr", () => {
  const sensitive = "token-shaped-private-value";
  const evidence = extractClosedYtDlpStageTelemetry([
    `${retrieval}: ${sensitive}`,
    `[download] Destination: /tmp/${sensitive}/https-youtube-video-id`,
  ].join("\n"));
  assert.equal(evidence.postRetrievalExternalRequestStage, "MEDIA");
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /token-shaped|private-value|https-youtube|video-id|Destination|stderr/i);
  assert.equal(evidence.tokenAttachedToOutboundRequest, "UNKNOWN");
  assert.equal(evidence.tokenConsumedByYtDlp, "UNKNOWN");
});
