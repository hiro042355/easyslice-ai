import assert from "node:assert/strict";
import test from "node:test";
import { referenceMusicMaterializer } from "@/lib/materializers/referenceMusicMaterializer";
import { referenceMusicMaterializationProfile } from "@/lib/materializers/referenceProfiles";
import { asset, BASELINE, EXPIRED, musicRequest, resolved, safeFailure, signed } from "./materializerTestFixtures";
import { vocalRequest } from "./materializerTestFixtures";

const materialize = (request: ReturnType<typeof musicRequest>, assets = resolved()) => referenceMusicMaterializer.materialize({ contractVersion: "1.0", providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-music", adapterRequest: request, resolvedAssets: assets, profile: referenceMusicMaterializationProfile, context: { contextVersion: "1.0", baselineTime: BASELINE } });

test("Music preserves duration, tempo, structure, and optional reference semantics", () => {
  for (const withReference of [false, true]) {
    const request = musicRequest();
    const assets = [];
    if (withReference) { request.referenceAudioAssetId = "audio-1"; assets.push(asset("audio-1", "audio-conditioning", "audio", signed("https://secret.example/audio"))); }
    const before = structuredClone(request);
    const first = materialize(request, resolved(...assets));
    const second = materialize(request, resolved(...assets));
    assert.equal(first.status, "materialized"); assert.deepEqual(first, second); assert.deepEqual(request, before);
    if (first.status === "materialized") { assert.equal("referenceAudioAssetId" in first.request.body, false); assert.deepEqual(first.request.body.tempo, before.tempo); assert.deepEqual(first.request.body.timeline, before.timeline); assert.equal(first.request.body.durationSeconds, 30); }
  }
});

test("Music rejects invalid mapping inputs without sensitive diagnostics", () => {
  const request = musicRequest(); request.referenceAudioAssetId = "audio-1";
  const cases = [
    materialize({ ...request, requestSchemaVersion: "2.0" as "1.0" }),
    materialize(vocalRequest() as unknown as ReturnType<typeof musicRequest>),
    referenceMusicMaterializer.materialize({ contractVersion: "1.0", providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-vocal", adapterRequest: request, resolvedAssets: resolved(), profile: referenceMusicMaterializationProfile, context: { contextVersion: "1.0", baselineTime: BASELINE } }),
    materialize(request, resolved(asset("audio-1", "audio-conditioning", "image", signed("https://secret.example/kind")))),
    materialize(request, resolved(asset("audio-1", "audio-conditioning", "audio", { mode: "signed-url", url: "https://secret.example/expired", expiresAt: EXPIRED }))),
    materialize(request, resolved(asset("audio-1", "audio-conditioning", "audio", signed("https://secret.example/a")), asset("audio-1", "audio-conditioning", "audio", signed("https://secret.example/b")))),
  ];
  for (const result of cases) { assert.equal(result.status, "failed"); assert.equal("request" in result, false); assert.equal(safeFailure(result).includes("secret.example"), false); }
});

test("Music results are independently copied across calls", () => {
  const request = musicRequest(); const first = materialize(request); const second = materialize(request);
  assert.equal(first.status, "materialized"); assert.equal(second.status, "materialized");
  if (first.status === "materialized" && second.status === "materialized") { first.request.body.tempo.targetBpm = 1; assert.equal(second.request.body.tempo.targetBpm, 100); assert.equal(request.tempo.targetBpm, 100); }
});
