import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../../lib/server/mediaExecutionComposition/types.ts", import.meta.url),
  "utf8",
);

test("composition contract references infrastructure contracts only", () => {
  assert.match(source, /import type/);
  assert.doesNotMatch(source, /import\s+(?!type)/);
  assert.doesNotMatch(source, /\b(?:React|Next|Route|HTTP|Provider|fetch|filesystem|child_process)\b/);
  assert.doesNotMatch(source, /\b(?:class|function|new Promise|spawn|mkdir|rm|unlink)\b/);
});
