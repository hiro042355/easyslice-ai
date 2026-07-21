import assert from "node:assert/strict";
import test from "node:test";
import { referenceVocalMaterializer } from "@/lib/materializers/referenceVocalMaterializer";
import { referenceVocalMaterializationProfile } from "@/lib/materializers/referenceProfiles";
import { asset, BASELINE, EXPIRED, resolved, safeFailure, signed, vocalRequest } from "./materializerTestFixtures";
import { musicRequest } from "./materializerTestFixtures";

const materialize = (request: ReturnType<typeof vocalRequest>, assets = resolved()) => referenceVocalMaterializer.materialize({ contractVersion: "1.0", providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-vocal", adapterRequest: request, resolvedAssets: assets, profile: referenceVocalMaterializationProfile, context: { contextVersion: "1.0", baselineTime: BASELINE } });

test("Vocal materializes no, one, or both optional assets without changing meaning", () => {
  for (const selection of ["none", "voice", "melody", "both"] as const) {
    const request = vocalRequest();
    const assets = [];
    if (selection === "voice" || selection === "both") { request.referenceVoiceAssetId = "voice-1"; assets.push(asset("voice-1", "guide-vocal", "voice", signed("https://secret.example/voice"))); }
    if (selection === "melody" || selection === "both") { request.guideMelodyAssetId = "melody-1"; assets.push(asset("melody-1", "guide-melody", "melody", { mode: "provider-native-asset", handle: "secret-handle" })); }
    const before = structuredClone(request);
    const first = materialize(request, resolved(...assets));
    const second = materialize(request, resolved(...assets));
    assert.equal(first.status, "materialized");
    assert.deepEqual(first, second);
    assert.deepEqual(request, before);
    if (first.status === "materialized") {
      assert.equal("referenceVoiceAssetId" in first.request.body, false);
      assert.equal("guideMelodyAssetId" in first.request.body, false);
      assert.equal(first.request.body.lyrics, "private lyrics");
      assert.equal(first.request.assetAccessCount, assets.length);
    }
  }
});

test("Vocal failures are structured, safe, and contain no partial request", () => {
  const wrong = materialize(vocalRequest());
  assert.equal(wrong.status, "materialized");
  const request = vocalRequest(); request.referenceVoiceAssetId = "voice-1";
  const cases = [
    materialize({ ...request, requestSchemaVersion: "2.0" as "1.0" }),
    materialize(musicRequest() as unknown as ReturnType<typeof vocalRequest>),
    referenceVocalMaterializer.materialize({ contractVersion: "1.0", providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-music", adapterRequest: request, resolvedAssets: resolved(), profile: referenceVocalMaterializationProfile, context: { contextVersion: "1.0", baselineTime: BASELINE } }),
    materialize(request, resolved(asset("voice-1", "guide-vocal", "image", signed("https://secret.example/kind")))),
    materialize(request, resolved(asset("voice-1", "guide-vocal", "voice", { mode: "signed-url", url: "https://secret.example/expired", expiresAt: EXPIRED }))),
    materialize(request, resolved(asset("voice-1", "guide-vocal", "voice", signed("https://secret.example/a")), asset("voice-1", "guide-vocal", "voice", signed("https://secret.example/b")))),
  ];
  for (const result of cases) {
    assert.equal(result.status, "failed");
    assert.equal("request" in result, false);
    const safe = safeFailure(result);
    assert.equal(safe.includes("secret.example"), false);
    assert.equal(safe.includes("secret-handle"), false);
    assert.equal(safe.includes("private lyrics"), false);
  }
});

test("Vocal results are independently copied across calls", () => {
  const request = vocalRequest();
  const first = materialize(request);
  const second = materialize(request);
  assert.equal(first.status, "materialized"); assert.equal(second.status, "materialized");
  if (first.status === "materialized" && second.status === "materialized") {
    first.request.body.timeline[0].vocalIntensity = 0;
    assert.equal(second.request.body.timeline[0].vocalIntensity, 0.5);
    assert.equal(request.timeline[0].vocalIntensity, 0.5);
  }
});

test("Vocal ignores unrelated resolved assets without projecting them", () => {
  const result = materialize(vocalRequest(), resolved(asset("unused", "reference-image", "image", signed("https://secret.example/unused"))));
  assert.equal(result.status, "materialized");
  if (result.status === "materialized") assert.equal(result.request.assetAccessCount, 0);
});

test("Vocal rejects cyclic and accessor-bearing request data without throwing", () => {
  const cyclic = vocalRequest() as ReturnType<typeof vocalRequest> & { self?: unknown };
  cyclic.self = cyclic;
  const accessor = vocalRequest() as ReturnType<typeof vocalRequest> & { unsafe?: unknown };
  Object.defineProperty(accessor, "unsafe", { enumerable: true, get: () => { throw new Error("must-not-run"); } });
  for (const request of [cyclic, accessor]) {
    let result: ReturnType<typeof materialize> | undefined;
    assert.doesNotThrow(() => { result = materialize(request); });
    assert.equal(result?.status, "failed");
    if (result?.status === "failed") assert.equal(result.issues[0].reasonCode, "adapter-request-invalid");
  }
});
