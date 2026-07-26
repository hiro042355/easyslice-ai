import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../../lib/server/mediaExecutionRuntimeBinding/types.ts", import.meta.url),
  "utf8",
);

test("runtime binding contract exposes only explicit capability binding types", () => {
  assert.doesNotMatch(source, /^export\s+(?:const|function|class|enum)\b/m);
  assert.doesNotMatch(source, /import\s+(?!type)/);
  assert.match(source, /workspace: WorkspaceCapability/);
  assert.match(source, /materialization: InputMaterializationCapability/);
  assert.match(source, /ffmpeg: FFmpegProcessCapability/);
  assert.match(source, /packaging: PackagingCapability/);
  assert.match(source, /createComposition\(dependencies: unknown\)/);
  assert.doesNotMatch(source, /\b(?:HTTP|Next|Route|Authentication|Blob|credential|filesystem|spawn)\b/i);
  assert.doesNotMatch(source, /ResponseRepresentation/);
});
