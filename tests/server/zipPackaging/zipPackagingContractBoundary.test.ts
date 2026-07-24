import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../../lib/server/zipPackaging/types.ts", import.meta.url),
  "utf8",
);

test("ZIP Packaging contract is type-only and opaque", () => {
  assert.doesNotMatch(source, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(source, /archiveBytes\?: Uint8Array/);
  assert.doesNotMatch(source, /\b(?:node:fs|node:path|AdmZip|Buffer|stream|absolutePath|workspacePath|filenameList|directoryList|exception|stack)\b/i);
  assert.doesNotMatch(source, /\b(?:react|next\/|child_process|provider|database)\b/i);
  assert.match(source, /export type PackagingCapability/);
  assert.match(source, /export type ArchiveProjection/);
});
