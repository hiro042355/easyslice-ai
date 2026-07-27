import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string): string => readFileSync(
  new URL(`../../../lib/server/sourceArtifactLocator/${name}`, import.meta.url),
  "utf8",
);

const typesSource = read("productionLocatorProviderTypes.ts");
const providerSource = read("productionLocatorProvider.ts");
const compositionSource = read("productionLocatorProviderComposition.ts");
const fixtureSource = read("referenceDeterministicProductionLocator.ts");

test("production provider types reuse runtime provider and Locator V2 contracts", () => {
  assert.doesNotMatch(typesSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(typesSource, /SourceArtifactLocatorV2RuntimeProviderCapability/);
  assert.match(typesSource, /SourceArtifactLocatorV2RuntimeProviderInput/);
  assert.match(typesSource, /SourceArtifactLocatorV2Result/);
  assert.doesNotMatch(typesSource, /type SourceArtifactLocatorV2Result\s*=/);
  assert.doesNotMatch(typesSource, /type .*ResolutionContext\s*=/);
});

test("provider, composition, and fixture contain no prohibited infrastructure", () => {
  const combined = `${providerSource}\n${compositionSource}\n${fixtureSource}`;
  assert.doesNotMatch(
    combined,
    /\b(?:node:fs|node:path|node:os|fetch|process\.env|database|SQL|network|filesystem|workspace|mkdir|realpath)\b/i,
  );
  assert.doesNotMatch(
    combined,
    /from\s+["'][^"']*(?:inputMaterialization|workflows?|runtimeBinding|app\/api|multi-cut)[^"']*["']/i,
  );
  assert.doesNotMatch(combined, /\b(?:join|resolve|relative|normalize)\s*\(/);
});
