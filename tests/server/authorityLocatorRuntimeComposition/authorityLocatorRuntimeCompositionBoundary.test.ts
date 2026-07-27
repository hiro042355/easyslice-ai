import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string): string => readFileSync(
  new URL(
    `../../../lib/server/authorityLocatorRuntimeComposition/${name}`,
    import.meta.url,
  ),
  "utf8",
);

const typesSource = read("types.ts");
const compositionSource = read("authorityLocatorRuntimeComposition.ts");
const fixtureSource = read(
  "referenceDeterministicAuthorityLocatorRuntimeComposition.ts",
);

test("composition types reuse existing facade and provider contracts", () => {
  assert.doesNotMatch(typesSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(typesSource, /AuthorityRuntimeFacade/);
  assert.match(typesSource, /LocatorRuntimeFacade/);
  assert.match(typesSource, /ProductionAuthorityProviderComposition/);
  assert.match(typesSource, /ProductionLocatorProviderComposition/);
});

test("composition owns wiring only and has no prohibited runtime dependency", () => {
  const combined = `${compositionSource}\n${fixtureSource}`;
  assert.doesNotMatch(
    combined,
    /\b(?:node:fs|node:path|node:os|fetch|process\.env|database|SQL|network|filesystem|authenticate|authorize|setTimeout|setInterval)\b/i,
  );
  assert.doesNotMatch(
    combined,
    /from\s+["'][^"']*(?:app\/api|routes?|runtimeBinding|inputMaterialization|workflows?)[^"']*["']/i,
  );
});
