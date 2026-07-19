import assert from "node:assert/strict";
import test from "node:test";
import { createMVScenePlanGate } from "@/lib/mvSceneGate/createMVScenePlanGate";
import { validTimeline } from "@/lib/mvSceneGate/mvSceneGateUtils";
import { cloneFixture, runGate } from "./fixture";

const invalid = { allowed: false, reviewRequired: false, reasonCodes: ["scene-plan-invalid"] };

test("structural and timeline failures are safely blocked", () => {
  const cases = [
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes = []; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes = input.plan.scenes.slice(0, 4); },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes[1].sceneId = input.plan.scenes[0].sceneId; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes[1].order = 1; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes.reverse(); },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes[0].startSeconds = -1; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes[0].endSeconds = 0; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes[0].endSeconds = -1; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes[0].startRatio = -0.1; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes[1].startSeconds += 0.01; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes[1].startSeconds -= 0.01; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.scenes.at(-1)!.endSeconds += 1; },
    (input: ReturnType<typeof cloneFixture>) => { input.plan.durationSeconds += 1; },
  ];
  for (const mutate of cases) {
    const input = cloneFixture();
    mutate(input);
    assert.deepEqual(runGate(input), invalid);
  }
  assert.deepEqual(Reflect.apply(createMVScenePlanGate, undefined, [null]), invalid);
  assert.deepEqual(Reflect.apply(createMVScenePlanGate, undefined, [{ inputVersion: "2.0" }]), invalid);
});

test("300,002 unique ratio and seconds boundary assertions", () => {
  const input = cloneFixture();
  const scene = input.plan.scenes[1];
  const validRatio = input.plan.scenes[0].endRatio;
  const validSeconds = input.plan.scenes[0].endSeconds;
  for (let index = 0; index <= 150_000; index += 1) {
    scene.startRatio = validRatio + (index - 75_000) / 10_000_000;
    assert.equal(validTimeline(input.plan), index === 75_000);
  }
  scene.startRatio = validRatio;
  for (let index = 0; index <= 150_000; index += 1) {
    scene.startSeconds = validSeconds + (index - 75_000) / 1_000_000;
    assert.equal(validTimeline(input.plan), index === 75_000);
  }
});
