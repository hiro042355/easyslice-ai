import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../../lib/server/inputMaterialization/types.ts", import.meta.url),
  "utf8",
);

test("input materialization contract is type-only and opaque", () => {
  assert.doesNotMatch(source, /^export\s+(?:const|function|class|enum)\b/m);
  assert.doesNotMatch(source, /\b(?:node:fs|node:path|node:os|next\/|react|Buffer|Uint8Array|ArrayBuffer|stream)\b/);
  assert.doesNotMatch(source, /\b(?:absolutePath|relativePath|filename|extension|stdout|stderr|command|exception|stack)\b/i);
  assert.doesNotMatch(source, /\b(?:MediaExecutionAdapter|TemporaryWorkspaceAdapter)\b/);
  assert.match(source, /export type InputMaterializationCapability/);
});
