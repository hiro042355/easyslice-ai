import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const production = ["hooks/referenceWorkflowHookTypes.ts", "hooks/referenceWorkflowHookUtils.ts", "hooks/useReferenceWorkflowController.ts", "hooks/referenceWorkflowHookEnvironment.ts", "hooks/referenceWorkflowHookTimerAdapter.ts", "lib/workflowUi/referenceWorkflowViewProjector.ts", "lib/workflowUi/referenceWorkflowController.ts", "lib/workflowUi/referenceWorkflowSessionStore.ts", "lib/workflowUi/workflowUiUtils.ts"];
test("final static Hook boundary excludes server, transport, storage, randomness, and React internals", () => {
  const forbidden = [/from\s+["']node:/, /@\/lib\/server/, /\bfetch\s*\(/, /XMLHttpRequest/, /setInterval/, /console\.(log|error)/, /localStorage/, /sessionStorage/, /Date\.now/, /Math\.random/, /node:crypto/, /ReactCurrentDispatcher/, /__SECRET_INTERNALS/, /@\/app\//, /@\/components\//];
  for (const file of production) { const source = readFileSync(resolve(file), "utf8"); for (const pattern of forbidden) assert.equal(pattern.test(source), false, `static-contract:${file}`); if (file === "hooks/useReferenceWorkflowController.ts" || file === "hooks/referenceWorkflowHookEnvironment.ts" || file === "hooks/referenceWorkflowHookTimerAdapter.ts") assert.equal(source.startsWith('"use client"'), true); }
});

test("browser globals remain isolated to environment and timer adapters", () => {
  for (const file of production) { const source = readFileSync(resolve(file), "utf8"), adapter = file.endsWith("referenceWorkflowHookEnvironment.ts") || file.endsWith("referenceWorkflowHookTimerAdapter.ts"); if (!adapter) for (const token of ["window", "document", "navigator", "setTimeout", "clearTimeout"]) assert.equal(new RegExp(`\\b${token}\\b`).test(source), false, `browser-boundary:${file}`); }
});

test("V2 Hook ownership is Holder-only and keeps Controller internals private", () => {
  const types = readFileSync(resolve("hooks/referenceWorkflowHookTypes.ts"), "utf8");
  const hook = readFileSync(resolve("hooks/useReferenceWorkflowController.ts"), "utf8");
  const fetchBuilder = readFileSync(resolve("hooks/createReferenceWorkflowHookDependencies.ts"), "utf8");
  const fixtureBuilder = readFileSync(resolve("hooks/createReferenceWorkflowHookFixture.ts"), "utf8");
  assert.equal(types.includes("controllerFactory"), false);
  assert.equal(types.includes("controllerHolder"), true);
  assert.equal(hook.includes("controllerFactory"), false);
  assert.equal(hook.includes("createReferenceWorkflowController"), false);
  assert.equal(hook.includes(".getState()"), false);
  assert.equal(hook.includes("createReferenceWorkflowSemanticSnapshotCache"), false);
  assert.equal(hook.includes("useSyncExternalStore(holder.subscribe, holder.getSnapshot, holder.getServerSnapshot)"), true);
  assert.equal(hook.includes("holder.getPollingContext(ownerToken)"), true);
  assert.equal(hook.includes("eslint-disable"), false);
  assert.equal(fetchBuilder.includes("let created"), false);
  assert.equal(fetchBuilder.includes("controllerFactory"), false);
  assert.equal(fetchBuilder.includes("createReferenceWorkflowControllerHolder"), true);
  assert.equal(fixtureBuilder.includes("controllerFactory"), false);
  assert.equal(fixtureBuilder.includes("createReferenceWorkflowControllerHolder"), true);
  assert.equal(fixtureBuilder.includes("getControllerForTest"), false);
});
