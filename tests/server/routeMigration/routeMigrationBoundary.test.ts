import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../../lib/server/routeMigration/types.ts", import.meta.url),
  "utf8",
);

test("Route Migration contract is type-only and knows only HTTP projections and Composition", () => {
  assert.match(source, /^import type \{/);
  assert.match(source, /MediaExecutionCompositionCapability/);
  assert.match(source, /MediaExecutionCompositionInput/);
  assert.doesNotMatch(source, /import\s+(?!type)/);
  assert.doesNotMatch(source, /\b(?:function|class|enum|execute\s*\(|new Promise)\b/);
  assert.doesNotMatch(
    source,
    /from\s+["'][^"']*(?:workspace|inputMaterialization|ffmpegProcess|zipPackaging|provider)[^"']*["']/i,
  );
  assert.doesNotMatch(
    source,
    /\b(?:node:fs|filesystem|mkdir|unlink|spawn|stdout|stderr|archivePath|workspacePath|Buffer|Uint8Array|process\.env)\b/,
  );
});

test("public decision is limited to safe HTTP response projection", () => {
  const decision = source.slice(source.indexOf("export type RouteMigrationDecision"));
  assert.match(decision, /\bstatus:/);
  assert.match(decision, /\bhttpStatus:/);
  assert.match(decision, /\bheaders:/);
  assert.match(decision, /\bbody:/);
  assert.match(decision, /\breasonCode:/);
  assert.match(decision, /\baudit:/);
  assert.doesNotMatch(
    decision,
    /\b(?:path|workspace|stdout|stderr|process|filesystem|archive|Buffer|Uint8Array)\b/i,
  );
});
