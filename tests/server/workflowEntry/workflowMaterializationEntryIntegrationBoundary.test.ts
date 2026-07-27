import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const integration = readFileSync(
  "lib/server/workflowEntry/workflowMaterializationEntryIntegration.ts",
  "utf8",
);
const fixture = readFileSync(
  "lib/server/workflowEntry/referenceWorkflowMaterializationEntryIntegration.ts",
  "utf8",
);

test("integration owns ordered delegation without policy or infrastructure", () => {
  assert.doesNotMatch(
    integration,
    /try\s*\{|catch\s*\(|validate|authorization|retry|fallback|node:fs|node:path|fetch\(|process\.env|app\/api|route/i,
  );
  assert.doesNotMatch(
    `${integration}\n${fixture}`,
    /singleton|globalRegistry|serviceLocator/i,
  );
});

test("integration preserves existing results without new status or audit", () => {
  assert.doesNotMatch(integration, /audit|reasonCode|classification/);
  assert.doesNotMatch(
    integration,
    /status:\s*["'](?:success|failed|rejected|not-run)["']/,
  );
  assert.match(integration, /authorityLocatorBindingResult/);
  assert.match(integration, /handoffResult/);
  assert.match(integration, /materializationRuntimeBindingResult/);
});
