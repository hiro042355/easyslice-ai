import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("the boundary owns exactly one permitted Sensitive cast and no forbidden runtime", () => {
  const root = join(process.cwd(), "lib", "sensitiveBoundary");
  const source = readdirSync(root).filter((name) => name.endsWith(".ts"))
    .map((name) => readFileSync(join(root, name), "utf8")).join("\n");
  assert.equal((source.match(/as Sensitive<T>/g) ?? []).length, 1);
  assert.equal(/\bas any\b|unknown\s+as|Object\.defineProperty|JSON\.stringify|console\.|node:|lib\/server|process\.env|fetch\(|XMLHttpRequest|localStorage|sessionStorage/.test(source), false);
  assert.equal(/export\s+.*sensitiveBrand/.test(source), false);
  assert.equal(/function markSensitiveInternal/.test(source), true);
});

test("the ready-assets factory brands the validated collection without rebranding elements", () => {
  const source = readFileSync(
    join(process.cwd(), "lib", "sensitiveBoundary", "createSensitiveWorkflowFixtureInput.ts"),
    "utf8",
  );
  const start = source.indexOf("export function createSensitiveReadyAssetsCollection");
  assert.notEqual(start, -1);
  const factory = source.slice(start);

  assert.match(factory, /const\s+owned\s*:\s*readonly\s+ResolvedAsset\[\]\s*=\s*\[\s*\.\.\.values\s*\]/);
  assert.doesNotMatch(factory, /const\s+owned\s*:\s*readonly\s+Sensitive<ResolvedAsset>\[\]/);
  assert.match(factory, /markSensitiveInternal<readonly\s+ResolvedAsset\[\]>\(owned\)/);
  assert.doesNotMatch(factory, /as\s+Sensitive<ResolvedAsset>|\bas\s+(?:never|unknown|any)\b|unknown\s+as|@ts-(?:ignore|expect-error)/);
});
