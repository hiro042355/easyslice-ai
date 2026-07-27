import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const production = readFileSync(
  "lib/server/inputMaterialization/productionFilesystemMaterializationComposition.ts",
  "utf8",
);
const fixture = readFileSync(
  "lib/server/inputMaterialization/referenceProductionFilesystemMaterializationComposition.ts",
  "utf8",
);

test("production composition owns construction and wiring only", () => {
  assert.match(
    production,
    /new ReferenceFilesystemInputMaterializationAdapter\(dependencies\)/,
  );
  assert.match(production, /createFilesystemMaterializationStrategyAdapter/);
  assert.match(production, /createProductionMaterializationProviderComposition/);
  assert.match(production, /createMaterializationRuntimeComposition/);
  assert.doesNotMatch(
    production,
    /materializationRequest|executionContext|opaqueResolutionReference|try\s*\{|catch\s*\(|\bvalidate\b/,
  );
});

test("composition introduces no workflow, route, registry, or global state", () => {
  const combined = `${production}\n${fixture}`;
  assert.doesNotMatch(
    combined,
    /app\/api|workflow|route|serviceLocator|globalRegistry|singleton/i,
  );
  assert.doesNotMatch(
    production,
    /\b(?:copyFile|mkdir|rename|lstat|fetch|process\.env)\b/,
  );
});
