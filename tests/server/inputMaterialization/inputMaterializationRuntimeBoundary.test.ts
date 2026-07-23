import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../../lib/server/inputMaterialization/referenceFilesystemInputMaterializationAdapter.ts", import.meta.url),
  "utf8",
);

test("filesystem adapter owns only bounded materialization infrastructure", () => {
  assert.match(source, /from "node:fs\/promises"/);
  assert.match(source, /from "node:path"/);
  assert.doesNotMatch(source, /node:os|tmpdir|child_process|\bspawn\b|\bexec(?:File)?\b|ffmpeg|ffprobe|AdmZip/i);
  assert.doesNotMatch(source, /\b(?:mkdir|rm|unlink|readFile|writeFile|appendFile|createReadStream|createWriteStream)\b/);
  assert.doesNotMatch(source, /\b(?:fetch|process\.env|Date\.now|new Date|Math\.random|randomUUID|setTimeout|setInterval)\b/);
  assert.doesNotMatch(source, /app\/api|temporaryWorkspace\/reference|mediaExecution\/reference/);
  assert.doesNotMatch(source, /\b(?:singleton|globalRegistry|defaultRegistry)\b/i);
});
