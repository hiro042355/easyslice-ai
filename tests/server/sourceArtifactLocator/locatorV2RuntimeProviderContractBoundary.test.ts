import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string): string => readFileSync(
  new URL(`../../../lib/server/sourceArtifactLocator/${name}`, import.meta.url),
  "utf8",
);

const typesSource = read("locatorV2RuntimeProviderTypes.ts");
const capabilitySource = read("locatorV2RuntimeProviderCapability.ts");
const validationSource = read("locatorV2RuntimeProviderValidation.ts");
const fixtureSource = read("referenceDeterministicLocatorV2RuntimeProviderFixture.ts");

test("runtime provider contract is type-only and reuses Locator V2 contracts", () => {
  assert.doesNotMatch(typesSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.doesNotMatch(capabilitySource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(typesSource, /locatorRequest: SourceArtifactLocatorV2Request/);
  assert.match(capabilitySource, /SourceArtifactLocatorV2Result/);
  assert.doesNotMatch(typesSource, /type SourceArtifactLocatorV2Result\s*=/);
  assert.doesNotMatch(typesSource, /type .*ResolutionContext\s*=/);
  assert.doesNotMatch(typesSource, /type .*SourceReference\s*=/);
});

test("runtime provider boundary contains no resolution or infrastructure behavior", () => {
  const combined = `${validationSource}\n${fixtureSource}`;
  assert.doesNotMatch(
    combined,
    /\b(?:node:fs|node:path|node:os|fetch|process\.env|Date\.now|Math\.random|randomUUID|setTimeout|setInterval)\b/,
  );
  assert.doesNotMatch(
    fixtureSource,
    /\b(?:ownership-mismatch|workflow-mismatch|authorityDecisionReference\s*===|opaqueReference\s*===|resolve|lookup|filesystem|workspace|location|path)\b/i,
  );
});
