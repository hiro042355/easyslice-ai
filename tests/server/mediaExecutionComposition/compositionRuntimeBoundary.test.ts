import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../../lib/server/mediaExecutionComposition/referenceMediaExecutionComposition.ts", import.meta.url),
  "utf8",
);

test("composition runtime owns sequencing without infrastructure implementation", () => {
  assert.doesNotMatch(source, /from\s+["'](?:node:|react|next|[^"']*provider)/i);
  assert.doesNotMatch(source, /\b(?:spawn|exec|mkdir|unlink|readFile|writeFile|rm|fetch)\s*\(|\b(?:AdmZip|process\.env)\b/);
  assert.doesNotMatch(source, /\b(?:Date\.now|new Date|Math\.random|randomUUID|setTimeout|setInterval)\b/);
  assert.doesNotMatch(source, /\b(?:workspace path|archive path|raw output path|Buffer|stream)\b/i);
});
