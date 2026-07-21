import assert from "node:assert/strict";
import test from "node:test";
import { referenceMVMaterializer } from "@/lib/materializers/referenceMVMaterializer";
import { referenceMVMaterializationProfile } from "@/lib/materializers/referenceProfiles";
import { asset, BASELINE, mvRequest, resolved, safeFailure, signed } from "./materializerTestFixtures";
import { musicRequest } from "./materializerTestFixtures";

const materialize = (request: ReturnType<typeof mvRequest>, assets = resolved()) => referenceMVMaterializer.materialize({ contractVersion: "1.0", providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-mv", adapterRequest: request, resolvedAssets: assets, profile: referenceMVMaterializationProfile, context: { contextVersion: "1.0", baselineTime: BASELINE } });

test("MV binds required audio and preserves zero-asset scene order and timeline", () => {
  const request = mvRequest(); const before = structuredClone(request);
  const first = materialize(request, resolved(asset("audio-1", "audio-conditioning", "audio", signed("https://secret.example/audio"), "required")));
  const second = materialize(request, resolved(asset("audio-1", "audio-conditioning", "audio", signed("https://secret.example/audio"), "required")));
  assert.equal(first.status, "materialized"); assert.deepEqual(first, second); assert.deepEqual(request, before);
  if (first.status === "materialized") { assert.equal("audioAssetId" in first.request.body, false); assert.deepEqual(first.request.body.scenes.map((scene) => scene.sceneId), ["scene-1", "scene-2"]); assert.deepEqual(first.request.body.scenes.map((scene) => [scene.startSeconds, scene.endSeconds]), [[0, 15], [15, 30]]); assert.deepEqual(first.request.body.scenes.map((scene) => scene.assets), [[], []]); }
});

test("MV projects multiple scene assets deterministically", () => {
  const request = mvRequest(); request.scenes[0].assetIds = ["image-1", "video-1"];
  const result = materialize(request, resolved(asset("audio-1", "audio-conditioning", "audio", signed("https://secret.example/audio"), "required"), asset("image-1", "reference-image", "image", signed("https://secret.example/image")), asset("video-1", "reference-video", "video", { mode: "provider-native-asset", handle: "secret-handle" })));
  assert.equal(result.status, "materialized");
  if (result.status === "materialized") { assert.deepEqual(result.request.body.scenes[0].assets.map((value) => value.mode), ["signed-url", "provider-native-asset"]); assert.equal("assetIds" in result.request.body.scenes[0], false); assert.equal(result.request.assetAccessCount, 3); }
});

test("MV rejects missing, duplicate, ambiguous, and invalid assets safely", () => {
  const base = mvRequest();
  const withScene = mvRequest(); withScene.scenes[0].assetIds = ["scene-asset"];
  const cases = [
    materialize(musicRequest() as unknown as ReturnType<typeof mvRequest>),
    referenceMVMaterializer.materialize({ contractVersion: "1.0", providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-music", adapterRequest: base, resolvedAssets: resolved(), profile: referenceMVMaterializationProfile, context: { contextVersion: "1.0", baselineTime: BASELINE } }),
    materialize(base, resolved()),
    materialize(base, resolved(asset("audio-1", "audio-conditioning", "image", signed("https://secret.example/kind"), "required"))),
    materialize(base, resolved(asset("audio-1", "audio-conditioning", "audio", signed("https://secret.example/a"), "required"), asset("audio-1", "audio-conditioning", "audio", signed("https://secret.example/b"), "required"))),
    materialize(withScene, resolved(asset("audio-1", "audio-conditioning", "audio", signed("https://secret.example/audio"), "required"), asset("scene-asset", "reference-image", "image", signed("https://secret.example/image")), asset("scene-asset", "reference-video", "video", signed("https://secret.example/video")))),
  ];
  for (const result of cases) { assert.equal(result.status, "failed"); assert.equal("request" in result, false); const safe = safeFailure(result); assert.equal(safe.includes("secret.example"), false); assert.equal(safe.includes("secret-handle"), false); }
});

test("MV rejects scene asset cardinality above the frozen profile maximum", () => {
  const request = mvRequest();
  request.scenes[0].assetIds = Array.from({ length: 65 }, (_, index) => `scene-asset-${index}`);
  const result = materialize(request, resolved(asset("audio-1", "audio-conditioning", "audio", signed("https://secret.example/audio"), "required")));
  assert.equal(result.status, "failed");
  if (result.status === "failed") assert.equal(result.issues[0].reasonCode, "source-field-cardinality-invalid");
});

test("MV results are independently copied across calls", () => {
  const request = mvRequest(); const assets = resolved(asset("audio-1", "audio-conditioning", "audio", signed("https://secret.example/audio"), "required"));
  const first = materialize(request, assets); const second = materialize(request, assets);
  assert.equal(first.status, "materialized"); assert.equal(second.status, "materialized");
  if (first.status === "materialized" && second.status === "materialized") { first.request.body.scenes[0].sceneId = "changed"; assert.equal(second.request.body.scenes[0].sceneId, "scene-1"); assert.equal(request.scenes[0].sceneId, "scene-1"); }
});
