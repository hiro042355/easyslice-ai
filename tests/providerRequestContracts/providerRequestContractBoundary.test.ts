import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const readSource = (relativePath: string) =>
  readFileSync(resolve(repositoryRoot, relativePath), "utf8");

const contractSource = readSource("lib/providerRequests/types.ts");
const mvAdapterSource = readSource("lib/providers/referenceMVAdapter.ts");
const providerTypesSource = readSource("lib/providers/types.ts");

const importPattern =
  /import\s+(type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["'];/g;
const contractImports = [...contractSource.matchAll(importPattern)];

const permittedTypeDependencies = new Set([
  "@/lib/assets/types",
  "@/lib/directorDecisionEngine",
  "@/lib/emotionEngine",
  "@/lib/mvContracts",
]);

test("provider request contract is a type-only module with an allowlisted dependency boundary", () => {
  assert.equal(contractImports.length, 4);
  for (const match of contractImports) {
    assert.equal(match[1], "type ");
    assert.equal(permittedTypeDependencies.has(match[2]), true);
  }
  assert.deepEqual(
    new Set(contractImports.map((match) => match[2])),
    permittedTypeDependencies,
  );

  assert.equal(/\bimport\s*\(/.test(contractSource), false);
  assert.equal(/\brequire\s*\(/.test(contractSource), false);
  assert.equal(
    /^export\s+(?:const|let|var|function|class|enum)\b/m.test(contractSource),
    false,
  );
});

test("provider request contract owns every V1 request envelope and operation DTO", () => {
  const requiredTypeExports = [
    "ProviderOperation",
    "MaterializedProviderRequest",
    "ExecutableProviderRequest",
    "ReferenceVocalDelivery",
    "ReferenceVocalDynamics",
    "ReferenceVocalArticulation",
    "ReferenceVocalPeakTreatment",
    "ReferenceVocalOutroTreatment",
    "ReferenceVocalSectionInstruction",
    "ReferenceVocalRequest",
    "MusicLyricsMode",
    "ReferenceMusicEnergyCurve",
    "ReferenceMusicDynamicRange",
    "ReferenceMusicPeakTreatment",
    "ReferenceMusicAfterglowTreatment",
    "ReferenceMusicDensityChange",
    "ReferenceMusicTransition",
    "ReferenceMusicSectionInstruction",
    "ReferenceMusicRequest",
    "ReferenceMVGlobalDirection",
    "ReferenceMVSceneInstruction",
    "ReferenceMVRequest",
  ] as const;

  for (const typeName of requiredTypeExports) {
    assert.match(
      contractSource,
      new RegExp(`export\\s+type\\s+${typeName}\\b`),
    );
  }
});

test("provider request contract has no runtime, orchestration, transport, or persistence dependency", () => {
  const forbiddenSourcePatterns: readonly RegExp[] = [
    /@\/lib\/providerClients/,
    /@\/lib\/materializers/,
    /@\/lib\/providers\/reference/,
    /@\/lib\/providerUploads?/,
    /@\/lib\/workflows?/,
    /referenceWorkflow/,
    /(?:node:)?fs(?:\/promises)?/,
    /(?:node:)?https?/,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bprocess\.env\b/,
    /\bDate\.now\s*\(/,
    /\bMath\.random\s*\(/,
    /\b(?:registry|cache)\s*=\s*new\s+(?:Map|Set)\b/i,
  ];

  for (const forbidden of forbiddenSourcePatterns) {
    assert.equal(forbidden.test(contractSource), false);
  }
});

test("tracked compatibility consumers import and re-export the extracted public types", () => {
  assert.match(
    mvAdapterSource,
    /import\s+type\s*\{[\s\S]*?ReferenceMVRequest[\s\S]*?ReferenceMVSceneInstruction[\s\S]*?\}\s+from\s+"@\/lib\/providerRequests\/types";/,
  );
  assert.match(
    mvAdapterSource,
    /export\s+type\s*\{[\s\S]*?ReferenceMVGlobalDirection[\s\S]*?ReferenceMVRequest[\s\S]*?ReferenceMVSceneInstruction[\s\S]*?\}\s+from\s+"@\/lib\/providerRequests\/types";/,
  );
  assert.equal(
    /^export\s+type\s+ReferenceMV(?:GlobalDirection|Request|SceneInstruction)\b/m.test(
      mvAdapterSource,
    ),
    false,
  );

  assert.match(
    providerTypesSource,
    /import\s+type\s*\{\s*MusicLyricsMode\s*\}\s+from\s+"@\/lib\/providerRequests\/types";/,
  );
  assert.match(
    providerTypesSource,
    /export\s+type\s*\{\s*MusicLyricsMode\s*\}\s+from\s+"@\/lib\/providerRequests\/types";/,
  );
  assert.equal(
    /^export\s+type\s+MusicLyricsMode\b/m.test(providerTypesSource),
    false,
  );
});
