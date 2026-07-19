import assert from "node:assert/strict";
import test from "node:test";
import { createMVScenePlanGate } from "@/lib/mvSceneGate/createMVScenePlanGate";
import { cloneFixture, runGate } from "./fixture";

test("unsafe identifiers and references are blocked without leakage", () => {
  const unsafeValues = ["", "https://secret.example/x", "line\nbreak", "control\u0000value"];
  for (const value of unsafeValues) {
    const sceneInput = cloneFixture();
    sceneInput.plan.scenes[0].sceneId = value;
    const sceneResult = runGate(sceneInput);
    assert.equal(sceneResult.allowed, false);
    assert.doesNotMatch(JSON.stringify(sceneResult), /secret\.example|line\nbreak|control/i);

    const assetInput = cloneFixture();
    assetInput.plan.scenes[0].assetRefs = [{ assetId: value, role: "subject" }];
    const assetResult = runGate(assetInput);
    assert.equal(assetResult.allowed, false);
    assert.doesNotMatch(JSON.stringify(assetResult), /secret|line|control|asset/i);
  }
});

test("operationRef, thrown getters, cycles, and prototypes fail closed", () => {
  const operation = cloneFixture();
  operation.context.operationRef = "https://private.example/op";
  assert.deepEqual(runGate(operation).reasonCodes, ["scene-plan-invalid"]);
  assert.doesNotMatch(JSON.stringify(runGate(operation)), /private|operation/i);

  const getter = Object.create(null);
  Object.defineProperty(getter, "inputVersion", { get() { throw new Error("secret raw error"); } });
  assert.doesNotThrow(() => Reflect.apply(createMVScenePlanGate, undefined, [getter]));
  assert.deepEqual(
    Reflect.apply(createMVScenePlanGate, undefined, [getter]).reasonCodes,
    ["scene-plan-invalid"],
  );

  const polluted = Object.create({ inputVersion: "1.0" });
  assert.deepEqual(
    Reflect.apply(createMVScenePlanGate, undefined, [polluted]).reasonCodes,
    ["scene-plan-invalid"],
  );
});
