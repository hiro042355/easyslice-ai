import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sources = [
  "multiCutSourceArtifactHandoffTypes.ts",
  "multiCutSourceArtifactHandoffContract.ts",
  "referenceMultiCutSourceArtifactHandoffFixtures.ts",
].map((name) =>
  readFileSync(
    new URL(`../../../lib/server/source/${name}`, import.meta.url),
    "utf8",
  ),
);

test("handoff remains a source and authority contract boundary", () => {
  const source = sources.join("\n");

  assert.match(source, /SourceArtifactAuthorityResolutionInput/);
  assert.doesNotMatch(
    source,
    /from\s+["'][^"']*(?:uploadBoundary|workflow|runtime|composition|provider|route|inputMaterialization\/reference)[^"']*["']/i,
  );
  assert.doesNotMatch(
    source,
    /\b(?:filesystem|child_process|fs\/promises|path|Blob|Response|NextResponse|fetch|download|upload|materialize|locate|resolveSourceArtifact)\b/,
  );
  assert.doesNotMatch(
    source,
    /\b(?:try\s*\{|catch\s*\(|singleton|registry|serviceLocator|cache)\b/i,
  );
});

test("handoff defines no new artifact or authority context model", () => {
  const types = sources[0];

  assert.doesNotMatch(types, /opaqueSourceArtifactReference\s*:/);
  assert.doesNotMatch(types, /authorizationEvidence\s*:/);
  assert.doesNotMatch(types, /ownershipScope\s*:/);
});
