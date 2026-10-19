import test from "node:test";
import assert from "node:assert/strict";
import { omitProperties } from "../../lib/omitProperties";

test("transport projection excludes private fields without mutating its source", () => {
  const source = { audioAssetId: "synthetic-private", scenes: ["synthetic-scene"], durationSeconds: 3, extra: { stable: true } };
  const projected = omitProperties(source, ["audioAssetId", "scenes"]);
  assert.deepEqual(projected, { durationSeconds: 3, extra: { stable: true } });
  assert.equal(source.audioAssetId, "synthetic-private");
  assert.equal("audioAssetId" in projected, false);
  assert.equal("scenes" in projected, false);
});

test("projection preserves other enumerable own fields, including symbols", () => {
  const marker = Symbol("synthetic");
  const source = { referenceAudioAssetId: undefined, outputFormat: "wav", [marker]: 2 };
  const projected = omitProperties(source, ["referenceAudioAssetId"]);
  assert.deepEqual(projected, { outputFormat: "wav", [marker]: 2 });
  assert.equal(Object.hasOwn(projected, "referenceAudioAssetId"), false);
  assert.equal(Object.hasOwn(source, "referenceAudioAssetId"), true);
});
