import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string): string => readFileSync(
  new URL(`../../../lib/server/locatorMaterializationHandoff/${name}`, import.meta.url),
  "utf8",
);

const typesSource = read("types.ts");
const validationSource = read("validation.ts");
const handoffSource = read("locatorMaterializationHandoff.ts");
const fixtureSource = read("referenceDeterministicLocatorMaterializationHandoff.ts");

test("handoff contract is type-only and reuses existing contracts", () => {
  assert.doesNotMatch(typesSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(typesSource, /AuthorityLocatorRuntimeBindingResult/);
  assert.match(typesSource, /SourceArtifactLocatorV2AuthorizedResult/);
  assert.match(typesSource, /InputMaterializationV2Request/);
  assert.match(typesSource, /InputMaterializationContext/);
  assert.doesNotMatch(typesSource, /type SourceArtifactLocatorV2Result\s*=/);
  assert.doesNotMatch(typesSource, /type InputMaterializationDecision\s*=/);
});

test("handoff contains no resolution, execution, policy, or infrastructure behavior", () => {
  const combined = `${validationSource}\n${handoffSource}\n${fixtureSource}`;
  assert.doesNotMatch(
    combined,
    /\b(?:node:fs|node:path|node:os|fetch|process\.env|database|network|filesystem|workspaceLookup|materialize\s*\(|authorize\s*\()\b/i,
  );
  assert.doesNotMatch(combined, /\b(?:parse|normalize|concatenate|resolve|join)\s*\(/);
});
