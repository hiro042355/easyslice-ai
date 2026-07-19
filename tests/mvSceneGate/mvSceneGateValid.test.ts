import assert from "node:assert/strict";
import test from "node:test";
import type { ReferenceMVAdapterInput } from "@/lib/providers/referenceMVAdapter";
import {
  REFERENCE_MV_CAPABILITY,
  validateReferenceMVInput,
} from "@/lib/providers/referenceMVAdapter";
import { cloneFixture, createGateFixture, runGate } from "./fixture";

test("formal planner output is ready, deterministic, and adapter-shape compatible", () => {
  const input = createGateFixture();
  assert.equal(input.plan.validation.status, "valid");
  assert.equal(input.plan.reviewRequired, false);
  assert.ok(input.plan.scenes.length >= 5);
  assert.equal(input.plan.scenes.filter((scene) => scene.isMainPeak).length, 1);
  assert.equal(input.plan.scenes.filter((scene) => scene.isAfterglow).length, 1);
  const before = structuredClone(input);
  const first = runGate(input);
  const second = runGate(input);
  assert.deepEqual(first, {
    allowed: true,
    reviewRequired: false,
    reasonCodes: ["scene-plan-ready"],
  });
  assert.deepEqual(second, first);
  assert.deepEqual(input, before);

  const adapterInput: ReferenceMVAdapterInput = {
    contractVersion: "1.0",
    projection: input.projection,
    scenePlan: input.plan,
    gate: first,
    assets: {
      audioAsset: {
        assetId: "audio-canonical",
        kind: "audio",
        mimeType: "audio/wav",
        durationSeconds: input.plan.durationSeconds,
      },
    },
    constraints: {
      durationSeconds: input.plan.durationSeconds,
      aspectRatio: input.plan.aspectRatio,
      resolution: "1080p",
      frameRate: 30,
      outputFormat: "mp4",
    },
    capability: REFERENCE_MV_CAPABILITY,
  };
  assert.notEqual(validateReferenceMVInput(adapterInput).status, "invalid");
  assert.deepEqual(cloneFixture(), input);
});
