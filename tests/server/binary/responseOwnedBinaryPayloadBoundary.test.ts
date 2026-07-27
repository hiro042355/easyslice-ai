import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sources = [
  "responseOwnedBinaryPayloadTypes.ts",
  "responseOwnedBinaryPayloadContract.ts",
  "referenceResponseOwnedBinaryPayloadFixtures.ts",
].map((name) =>
  readFileSync(
    new URL(`../../../lib/server/binary/${name}`, import.meta.url),
    "utf8",
  ),
);

test("binary payload foundation stays transport and infrastructure neutral", () => {
  const source = sources.join("\n");

  assert.doesNotMatch(
    source,
    /\b(?:Blob|NextResponse|ReadableStream|filesystem|child_process|fs\/promises|HTTP|httpStatus|header|Workflow|Route|MediaExecution)\b/,
  );
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:next|workflow|route|mediaExecution|zipPackaging)[^"']*["']/i);
  assert.doesNotMatch(source, /\b(?:path|filenamePath|archivePath|workspacePath)\b/);
  assert.doesNotMatch(source, /\b(?:ZIP|AdmZip|fetch|spawn|mkdir|unlink)\b/);
});

test("contract uses the established byte representation without singleton state", () => {
  const source = sources.join("\n");

  assert.match(source, /Readonly<Uint8Array>/);
  assert.match(source, /Uint8Array\.from/);
  assert.doesNotMatch(source, /\b(?:Buffer|SharedArrayBuffer|globalThis|singleton|cache)\b/i);
});
