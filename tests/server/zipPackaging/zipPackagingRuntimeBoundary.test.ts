import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../../lib/server/zipPackaging/referenceZipPackagingAdapter.ts", import.meta.url),
  "utf8",
);

test("Reference ZIP Packaging Runtime owns only archive filesystem infrastructure", () => {
  assert.match(source, /from "adm-zip"/);
  assert.match(source, /from "node:fs\/promises"/);
  assert.match(source, /from "node:path"/);
  assert.doesNotMatch(source, /\b(?:child_process|spawn|exec|ffmpeg|ffprobe|fetch|process\.env|Date\.now|new Date|Math\.random|randomUUID)\b/i);
  assert.doesNotMatch(source, /\b(?:provider|database|http|workspace creation|mkdir|rm|unlink|cleanup)\b/i);
});
