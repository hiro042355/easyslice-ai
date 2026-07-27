import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sources = [
  "lib/server/inputMaterialization/materializationRuntimeCompositionTypes.ts",
  "lib/server/inputMaterialization/materializationRuntimeComposition.ts",
  "lib/server/inputMaterialization/referenceDeterministicMaterializationRuntimeComposition.ts",
].map((path) => readFileSync(path, "utf8"));

test("composition owns wiring only and exposes no infrastructure", () => {
  const combined = sources.join("\n");

  assert.doesNotMatch(
    combined,
    /\b(?:node:fs|node:path|node:os|fetch|process\.env|Date\.now|Math\.random|randomUUID|filesystem|workspaceLookup|copyFile|lstat)\b/,
  );
  assert.doesNotMatch(
    combined,
    /ReferenceFilesystemInputMaterializationAdapter|app\/api|workflow|runtimeBinding/i,
  );
  assert.doesNotMatch(combined, /\b(?:singleton|globalRegistry)\b/i);
});

test("composition reuses facade, provider, and validation contracts", () => {
  assert.match(sources[0], /MaterializationRuntimeFacade/);
  assert.match(sources[0], /MaterializationRuntimeProviderCapability/);
  assert.match(
    sources[0],
    /MaterializationRuntimeProviderInputValidationCapability/,
  );
  assert.match(sources[1], /createMaterializationRuntimeFacade/);
  assert.doesNotMatch(sources[1], /createDeterministic|strategy/);
});
