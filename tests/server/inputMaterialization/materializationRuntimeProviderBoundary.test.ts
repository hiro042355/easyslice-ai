import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string): string => readFileSync(
  new URL(`../../../lib/server/inputMaterialization/${name}`, import.meta.url),
  "utf8",
);

const typesSource = read("materializationRuntimeProviderTypes.ts");
const capabilitySource = read("materializationRuntimeProviderCapability.ts");
const validationSource = read("materializationRuntimeProviderValidation.ts");
const fixtureSource = read(
  "referenceDeterministicMaterializationRuntimeProviderFixture.ts",
);

test("provider contract is type-only and reuses handoff and decision contracts", () => {
  assert.doesNotMatch(typesSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.doesNotMatch(capabilitySource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(typesSource, /LocatorMaterializationHandoffResult/);
  assert.match(capabilitySource, /InputMaterializationDecision/);
  assert.doesNotMatch(capabilitySource, /type InputMaterializationDecision\s*=/);
});

test("validation and fixture contain no materialization or infrastructure execution", () => {
  const combined = `${validationSource}\n${fixtureSource}`;
  assert.doesNotMatch(
    combined,
    /\b(?:node:fs|node:path|node:os|fetch|process\.env|database|network|filesystem|workspaceLookup|copyFile|lstat)\b/i,
  );
  assert.doesNotMatch(combined, /ReferenceFilesystemInputMaterializationAdapter/);
});
