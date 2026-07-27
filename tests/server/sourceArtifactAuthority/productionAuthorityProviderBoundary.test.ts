import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string): string => readFileSync(
  new URL(`../../../lib/server/sourceArtifactAuthority/${name}`, import.meta.url),
  "utf8",
);

const typesSource = read("productionAuthorityProviderTypes.ts");
const providerSource = read("productionAuthorityProvider.ts");
const compositionSource = read("productionAuthorityProviderComposition.ts");
const fixtureSource = read("referenceDeterministicProductionAuthorityPolicy.ts");

test("production provider types reuse existing provider input and result contracts", () => {
  assert.doesNotMatch(typesSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(typesSource, /PrincipalAwareAuthorityRuntimeProviderCapability/);
  assert.match(typesSource, /PrincipalAwareAuthorityRuntimeProviderInput/);
  assert.match(typesSource, /SourceArtifactAuthorityResolutionResult/);
  assert.doesNotMatch(typesSource, /type SourceArtifactAuthorityResolutionResult\s*=/);
  assert.doesNotMatch(typesSource, /type .*PrincipalIdentity\s*=/);
});

test("provider, composition, and fixture contain no prohibited infrastructure", () => {
  const combined = `${providerSource}\n${compositionSource}\n${fixtureSource}`;
  assert.doesNotMatch(
    combined,
    /\b(?:node:fs|node:path|node:os|fetch|process\.env|database|SQL|JWT|Session|RBAC|ACL|network|filesystem|runtimeBinding)\b/i,
  );
  assert.doesNotMatch(
    combined,
    /from\s+["'][^"']*(?:sourceArtifactLocator|inputMaterialization|workflows?|app\/api|multi-cut)[^"']*["']/i,
  );
});
