import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const execution = readFileSync(
  "lib/server/workflowEntry/productionWorkflowMaterializationEntryExecution.ts",
  "utf8",
);
const fixture = readFileSync(
  "lib/server/workflowEntry/referenceProductionWorkflowMaterializationEntryExecution.ts",
  "utf8",
);

test("execution forwards only to the explicitly injected integration", () => {
  assert.match(execution, /\.integration\.execute\(input\)/);
  assert.doesNotMatch(
    execution,
    /authorityLocatorBinding|handoff|materializationBinding|filesystem|provider|facade/i,
  );
  assert.doesNotMatch(
    execution,
    /try\s*\{|catch\s*\(|\.\.\.input|\.\.\.result|validate|normalize|status:|failure:|audit|retry|fallback/i,
  );
});

test("execution has no route, HTTP, registry, or global dependency", () => {
  const combined = `${execution}\n${fixture}`;
  assert.doesNotMatch(
    combined,
    /app\/api|route|request\b|response\b|fetch\(|process\.env|singleton|globalRegistry|serviceLocator|dynamic import/i,
  );
});
