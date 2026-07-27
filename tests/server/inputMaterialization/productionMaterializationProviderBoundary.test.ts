import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string): string => readFileSync(
  new URL(`../../../lib/server/inputMaterialization/${name}`, import.meta.url),
  "utf8",
);

const typesSource = read("productionMaterializationProviderTypes.ts");
const providerSource = read("productionMaterializationProvider.ts");
const compositionSource = read("productionMaterializationProviderComposition.ts");
const strategySource = read(
  "referenceDeterministicProductionMaterializationStrategy.ts",
);

test("strategy and provider types reuse existing input and decision contracts", () => {
  assert.doesNotMatch(typesSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(typesSource, /MaterializationRuntimeProviderCapability/);
  assert.match(typesSource, /MaterializationRuntimeProviderInput/);
  assert.match(typesSource, /InputMaterializationDecision/);
  assert.doesNotMatch(typesSource, /type InputMaterializationDecision\s*=/);
});

test("provider delegates without validation, failure wrapping, or infrastructure", () => {
  const combined = `${providerSource}\n${compositionSource}\n${strategySource}`;
  assert.doesNotMatch(combined, /validateProviderInput|ValidationCapability/);
  assert.doesNotMatch(providerSource, /\bcatch\b/);
  assert.doesNotMatch(
    combined,
    /\b(?:node:fs|node:path|node:os|fetch|process\.env|database|network|filesystem|workspaceLookup|copyFile|lstat|opaqueResolutionReference)\b/i,
  );
  assert.doesNotMatch(combined, /ReferenceFilesystemInputMaterializationAdapter/);
});
