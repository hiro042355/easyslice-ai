import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../../lib/server/ffmpegProcess/referenceFFmpegProcessAdapter.ts", import.meta.url),
  "utf8",
);

test("Reference FFmpeg Process Runtime uses spawn without shell or unrelated infrastructure", () => {
  assert.match(source, /from "node:child_process"/);
  assert.match(source, /\bspawn\(/);
  assert.match(source, /shell:\s*false/);
  assert.match(source, /stdio:\s*\["ignore", "pipe", "pipe"\]/);
  assert.doesNotMatch(source, /\b(?:exec|execFile|fork)\s*\(/);
  assert.doesNotMatch(source, /\b(?:node:fs|node:os|mkdir|unlink|copyFile|AdmZip|fetch|process\.env|Date\.now|new Date|Math\.random|randomUUID)\b/);
  assert.doesNotMatch(source, /\b(?:provider|database|app\/api|temporaryWorkspace\/reference|inputMaterialization\/reference)\b/i);
});
