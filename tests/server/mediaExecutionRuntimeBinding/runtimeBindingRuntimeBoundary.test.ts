import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL(
    "../../../lib/server/mediaExecutionRuntimeBinding/referenceMediaExecutionRuntimeBinding.ts",
    import.meta.url,
  ),
  "utf8",
);

test("runtime binding constructs only the composition with no infrastructure side effects", () => {
  assert.match(source, /new ReferenceMediaExecutionComposition/);
  assert.doesNotMatch(source, /ReferenceTemporaryWorkspaceAdapter|ReferenceFilesystemInputMaterializationAdapter/);
  assert.doesNotMatch(source, /ReferenceFFmpegProcessAdapter|ReferenceZipPackagingAdapter/);
  assert.doesNotMatch(source, /\b(?:node:fs|node:path|child_process|AdmZip|fetch|Blob)\b/);
  assert.doesNotMatch(source, /\b(?:process\.env|credential|token|Date\.now|Math\.random|randomUUID)\b/);
  assert.doesNotMatch(source, /\b(?:singleton|globalThis|defaultRegistry|serviceLocator)\b/);
  assert.doesNotMatch(source, /^const\s+\w+\s*=\s*new\s+ReferenceMediaExecutionComposition/m);
  assert.doesNotMatch(source, /\.execute\s*\(/);
  assert.doesNotMatch(source, /ResponseRepresentation|readArchive/);
  assert.match(source, /construction-failed/);
});
