import assert from "node:assert/strict";
import test from "node:test";
import { cloneFixture, runGate } from "./fixture";

const blocked = { allowed: false, reviewRequired: false, reasonCodes: ["scene-plan-invalid"] };

test("decision, projection, peak, and afterglow mismatches are blocked", () => {
  const cases = [
    (input: ReturnType<typeof cloneFixture>) => { input.decision.overallDirection.confidence -= 1; },
    (input: ReturnType<typeof cloneFixture>) => { input.projection.direction.cameraEnergy -= 1; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes.find((scene) => scene.isMainPeak)!.isMainPeak = false; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes[0].isMainPeak = true; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes.find((scene) => scene.isMainPeak)!.section = "verse"; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes.find((scene) => scene.isAfterglow)!.isAfterglow = false; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes[0].isAfterglow = true; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes.at(-1)!.section = "bridge"; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes.at(-1)!.narrativePurpose = "resolve"; },
  ];
  for (const mutate of cases) {
    const input = cloneFixture();
    mutate(input);
    assert.deepEqual(runGate(input), blocked);
  }
});

test("review-required uses only existing canonical reasons", () => {
  const normalized = cloneFixture();
  normalized.plan.validation.status = "normalized";
  normalized.plan.reviewRequired = true;
  assert.deepEqual(runGate(normalized), {
    allowed: false,
    reviewRequired: true,
    reasonCodes: ["scene-plan-review-pending", "scene-plan-normalized-review-required"],
  });
  const fallback = cloneFixture();
  fallback.plan.validation.status = "fallback";
  fallback.plan.reviewRequired = true;
  assert.deepEqual(runGate(fallback), {
    allowed: false,
    reviewRequired: true,
    reasonCodes: ["scene-plan-review-pending", "scene-plan-fallback-review-required"],
  });
});
