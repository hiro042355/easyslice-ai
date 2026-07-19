import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  getMVScenePlanGateDescriptor,
  listMVScenePlanGateDescriptors,
} from "@/lib/mvSceneGate/mvSceneGateRegistry";

test("registry is safe, lookup-only, and mutation isolated", () => {
  const first = listMVScenePlanGateDescriptors();
  const second = listMVScenePlanGateDescriptors();
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);
  first[0].availability = "disabled";
  assert.equal(listMVScenePlanGateDescriptors()[0].availability, "available");
  assert.equal(getMVScenePlanGateDescriptor("missing"), undefined);
  assert.deepEqual(getMVScenePlanGateDescriptor("reference-mv-scene-plan-gate-v1"), second[0]);
  assert.doesNotMatch(JSON.stringify(first), /sceneId|assetId|story|lyrics|provider|operationRef/i);
});

test("production gate source stays inside the pure static boundary", () => {
  const root = join(process.cwd(), "lib", "mvSceneGate");
  const source = readdirSync(root)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => readFileSync(join(root, name), "utf8"))
    .join("\n");
  const forbidden = [
    "@/lib/server", "node:", "process.env", "fetch(", "XMLHttpRequest",
    "console.", "setInterval", "setTimeout", "Date.", "Math.random", "crypto",
    "localStorage", "sessionStorage", "ProviderClient", "WorkflowRuntime",
  ];
  for (const token of forbidden) assert.equal(source.includes(token), false, token);
  assert.equal(/\bas\s+any\b/.test(source), false);
  assert.equal(/unknown\s+as/.test(source), false);
});
