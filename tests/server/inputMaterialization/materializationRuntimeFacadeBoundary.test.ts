import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string): string => readFileSync(
  new URL(`../../../lib/server/inputMaterialization/${name}`, import.meta.url),
  "utf8",
);

const typesSource = read("materializationRuntimeFacadeTypes.ts");
const facadeSource = read("materializationRuntimeFacade.ts");
const fixtureSource = read("referenceDeterministicMaterializationRuntimeFacade.ts");

test("facade contract is type-only and reuses provider and decision contracts", () => {
  assert.doesNotMatch(typesSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(typesSource, /MaterializationRuntimeProviderInput/);
  assert.match(typesSource, /MaterializationRuntimeProviderCapability/);
  assert.match(typesSource, /MaterializationRuntimeProviderInputValidationCapability/);
  assert.match(typesSource, /MaterializationRuntimeProviderInputValidationResult/);
  assert.match(typesSource, /InputMaterializationDecision/);
  assert.doesNotMatch(typesSource, /type InputMaterializationDecision\s*=/);
});

test("facade and fixture contain no filesystem, resolution, or execution semantics", () => {
  const combined = `${facadeSource}\n${fixtureSource}`;
  assert.doesNotMatch(
    combined,
    /\b(?:node:fs|node:path|node:os|fetch|process\.env|database|network|filesystem|workspaceLookup|copyFile|lstat|opaqueResolutionReference)\b/i,
  );
  assert.doesNotMatch(combined, /ReferenceFilesystemInputMaterializationAdapter/);
});
