import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string): string => readFileSync(
  new URL(
    `../../../lib/server/authorityLocatorRuntimeBinding/${name}`,
    import.meta.url,
  ),
  "utf8",
);

const typesSource = read("types.ts");
const bindingSource = read("authorityLocatorRuntimeBinding.ts");
const fixtureSource = read(
  "referenceDeterministicAuthorityLocatorRuntimeBinding.ts",
);

test("binding contract wraps and reuses existing boundary results", () => {
  assert.doesNotMatch(typesSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(typesSource, /AuthorityLocatorRuntimeComposition/);
  assert.match(typesSource, /AuthorityRuntimeFacadeInput/);
  assert.match(typesSource, /LocatorRuntimeFacadeResult/);
  assert.match(typesSource, /AuthorityLocatorResolutionAdapterResult/);
  assert.match(typesSource, /SourceArtifactAuthorityResolutionResult/);
  assert.match(typesSource, /SourceArtifactLocatorV2Result/);
  assert.doesNotMatch(typesSource, /type SourceArtifactAuthorityResolutionResult\s*=/);
  assert.doesNotMatch(typesSource, /type SourceArtifactLocatorV2Result\s*=/);
});

test("binding contains no policy, resolution, or infrastructure dependency", () => {
  const combined = `${bindingSource}\n${fixtureSource}`;
  assert.doesNotMatch(
    combined,
    /\b(?:node:fs|node:path|node:os|fetch|process\.env|database|SQL|network|filesystem|workspace|authenticate|authorizationPolicy)\b/i,
  );
  assert.doesNotMatch(
    combined,
    /from\s+["'][^"']*(?:app\/api|routes?|inputMaterialization|workflows?)[^"']*["']/i,
  );
});
