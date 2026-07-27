import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sources = [
  "multiCutRouteContractTypes.ts",
  "multiCutRouteContract.ts",
  "referenceMultiCutRouteContractFixtures.ts",
].map((name) =>
  readFileSync(
    new URL(`../../../lib/server/multiCutRoute/${name}`, import.meta.url),
    "utf8",
  ),
);

test("multi-cut contract depends only on public shape and binary payload contracts", () => {
  const source = sources.join("\n");

  assert.match(source, /ResponseOwnedBinaryPayload/);
  assert.doesNotMatch(
    source,
    /from\s+["'][^"']*(?:workflowEntry|production|runtime|binding|provider|facade|routeMigration)[^"']*["']/i,
  );
  assert.doesNotMatch(
    source,
    /\b(?:Blob|NextRequest|NextResponse|ReadableStream|filesystem|child_process|fs\/promises|AdmZip|fetch|spawn|mkdir|unlink)\b/,
  );
  assert.doesNotMatch(source, /\bnew\s+Response\b|:\s*Response\b/);
  assert.doesNotMatch(source, /\b(?:singleton|registry|serviceLocator|cache)\b/i);
});

test("contract contains no adapter, projector, status decision, or error mapping", () => {
  const source = sources.join("\n");

  assert.doesNotMatch(
    source,
    /\b(?:WorkflowMaterializationEntry|ProductionExecution|RequestAdapter|ResultProjector|mapError|mapStatus|try\s*\{|catch\s*\()\b/,
  );
});
