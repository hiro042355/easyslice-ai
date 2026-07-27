import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sources = [
  "lib/server/inputMaterialization/filesystemMaterializationStrategyAdapterTypes.ts",
  "lib/server/inputMaterialization/filesystemMaterializationStrategyAdapter.ts",
  "lib/server/inputMaterialization/referenceDeterministicFilesystemMaterializationStrategyAdapter.ts",
].map((path) => readFileSync(path, "utf8"));

test("strategy adapter owns extraction and delegation only", () => {
  const combined = sources.join("\n");

  assert.doesNotMatch(
    combined,
    /\b(?:node:fs|node:path|node:os|copyFile|mkdir|rename|lstat|fetch|process\.env|workspaceLookup|opaqueResolutionReference)\b/,
  );
  assert.doesNotMatch(
    sources[1],
    /validate|authorization|principal|collision|createMaterializationRuntime|createProductionMaterializationProvider/,
  );
  assert.doesNotMatch(combined, /\b(?:singleton|globalRegistry|serviceLocator)\b/i);
});

test("adapter types reuse the existing strategy and materialization contracts", () => {
  assert.match(
    sources[0],
    /ProductionMaterializationStrategyCapability/,
  );
  assert.match(sources[0], /InputMaterializationCapability/);
  assert.match(sources[0], /InputMaterializationDecision/);
  assert.doesNotMatch(
    sources[0],
    /type\s+(?:MaterializationRuntimeProviderInput|InputMaterializationDecision)\s*=/,
  );
});
