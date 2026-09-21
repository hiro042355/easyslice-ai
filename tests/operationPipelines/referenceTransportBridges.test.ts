import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { bridgeMusicRequest, bridgeMVRequest, bridgeVocalRequest } from "../../lib/operationPipelines/referenceTransportBridges";

const materialized = (operation: string, body: Record<string, unknown>, count = 0) => ({ requestVersion: "1.0", providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation, body, assetAccessCount: count, materialization: { status: "complete", unresolvedAssetCount: 0 } });

for (const [name, bridge, operation, kind, body] of [
  ["vocal", bridgeVocalRequest, "generate-vocal", "vocal", { durationSeconds: 30, outputFormat: "wav", timeline: [{}], lyrics: "private" }],
  ["music", bridgeMusicRequest, "generate-music", "music", { durationSeconds: 120, outputFormat: "mp3", timeline: [{}, {}] }],
  ["mv", bridgeMVRequest, "generate-mv", "mv", { durationSeconds: 240, outputFormat: "mp4", scenes: [{}, {}, {}] }],
] as const) {
  test(`bridges ${name} materialized input without executing transport`, () => {
    const mutableBody: Record<string, unknown> = { ...body };
    if (Array.isArray(body.timeline)) mutableBody.timeline = [...body.timeline];
    if (Array.isArray(body.scenes)) mutableBody.scenes = [...body.scenes];
    const expectedBody = structuredClone(mutableBody);
    const result = bridge(materialized(operation, mutableBody, 2) as never);
    assert.equal(result.status, "bridged");
    if (result.status !== "bridged") return;
    assert.equal(result.body.bodyVersion, "1.0");
    assert.equal(result.body.operation, operation);
    assert.deepEqual(result.body.materializedRequest, expectedBody);
    assert.equal(result.body.transportSummary.payloadKind, kind);
    assert.equal(result.body.transportSummary.inputAssetCount, 2);
    assert.equal(result.body.transportSummary.outputFormat, body.outputFormat);
    assert.equal(result.body.transportSummary.timelineCount, Array.isArray(body.timeline) ? body.timeline.length : 0);
    assert.equal(result.body.transportSummary.sceneCount, Array.isArray(body.scenes) ? body.scenes.length : 0);
    mutableBody.durationSeconds = 1;
    if (Array.isArray(mutableBody.timeline)) mutableBody.timeline.push({ changed: true });
    if (Array.isArray(mutableBody.scenes)) mutableBody.scenes.push({ changed: true });
    assert.deepEqual(result.body.materializedRequest, expectedBody);
  });
}

test("fails safely for operation mismatch", () => {
  const result = bridgeVocalRequest(materialized("generate-music", { durationSeconds: 30, outputFormat: "wav" }) as never);
  assert.equal(result.status, "failed");
  if (result.status === "failed") assert.equal(result.issues[0]?.reasonCode, "transport-bridge-failed");
});

test("bridge source has no network, credential, persistence, or idempotency authority", async () => {
  const source = await readFile(new URL("../../lib/operationPipelines/referenceTransportBridges.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|createReferenceProviderClient|credential|endpoint|persistence|idempotency/i);
});
