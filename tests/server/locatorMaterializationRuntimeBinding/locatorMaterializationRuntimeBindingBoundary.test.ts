import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sources = [
  "lib/server/locatorMaterializationRuntimeBinding/types.ts",
  "lib/server/locatorMaterializationRuntimeBinding/locatorMaterializationRuntimeBinding.ts",
  "lib/server/locatorMaterializationRuntimeBinding/referenceDeterministicLocatorMaterializationRuntimeBinding.ts",
].map((path) => readFileSync(path, "utf8"));

test("binding depends only on handoff and materialization runtime contracts", () => {
  const combined = sources.join("\n");

  assert.doesNotMatch(
    combined,
    /\b(?:node:fs|node:path|node:os|fetch|process\.env|Date\.now|Math\.random|randomUUID|copyFile|mkdir|workspaceLookup|database|network)\b/,
  );
  assert.doesNotMatch(
    combined,
    /ReferenceFilesystemInputMaterializationAdapter|app\/api|workflow|route/i,
  );
  assert.doesNotMatch(combined, /opaqueResolutionReference\s*[.)\]}]/);
});

test("binding types reuse existing results without redefining decisions", () => {
  assert.match(sources[0], /LocatorMaterializationHandoffResult/);
  assert.match(sources[0], /ReadyLocatorMaterializationHandoffResult/);
  assert.match(sources[0], /MaterializationRuntimeComposition/);
  assert.match(sources[0], /MaterializationRuntimeFacadeResult/);
  assert.doesNotMatch(sources[0], /type InputMaterializationDecision\s*=/);
});
