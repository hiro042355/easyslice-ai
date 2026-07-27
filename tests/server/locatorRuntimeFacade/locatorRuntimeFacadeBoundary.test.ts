import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string): string => readFileSync(
  new URL(`../../../lib/server/locatorRuntimeFacade/${name}`, import.meta.url),
  "utf8",
);

const typesSource = read("locatorRuntimeFacadeTypes.ts");
const facadeSource = read("locatorRuntimeFacade.ts");
const stubSource = read("referenceDeterministicLocatorRuntimeFacadeStub.ts");

test("facade contract reuses provider and Locator V2 contracts", () => {
  assert.doesNotMatch(typesSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(typesSource, /SourceArtifactLocatorV2RuntimeProviderCapability/);
  assert.match(typesSource, /SourceArtifactLocatorV2RuntimeProviderInput/);
  assert.match(typesSource, /SourceArtifactLocatorV2Request/);
  assert.match(typesSource, /SourceArtifactLocatorV2Result/);
  assert.match(typesSource, /SourceArtifactLocatorV2ResolutionContext/);
  assert.match(typesSource, /SourceArtifactLocatorV2Capability/);
  assert.doesNotMatch(typesSource, /type SourceArtifactLocatorV2Result\s*=/);
});

test("facade owns delegation only and has no locator or infrastructure behavior", () => {
  const combined = `${facadeSource}\n${stubSource}`;
  assert.match(facadeSource, /validateProviderInput/);
  assert.match(facadeSource, /locateSourceArtifact/);
  assert.doesNotMatch(
    combined,
    /\b(?:node:fs|node:path|node:os|fetch|process\.env|Date\.now|Math\.random|randomUUID|setTimeout|setInterval|database|filesystem|workspace)\b/i,
  );
  assert.doesNotMatch(
    combined,
    /\b(?:ownership-mismatch|workflow-mismatch|authorityDecisionReference\s*===|opaqueReference\s*===|resolve|lookup|location|path)\b/i,
  );
});
