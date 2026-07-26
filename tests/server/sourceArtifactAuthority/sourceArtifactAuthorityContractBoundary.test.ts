import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contractSource = readFileSync(
  new URL("../../../lib/server/sourceArtifactAuthority/types.ts", import.meta.url),
  "utf8",
);
const fixtureSource = readFileSync(
  new URL(
    "../../../lib/server/sourceArtifactAuthority/referenceDeterministicSourceArtifactAuthority.ts",
    import.meta.url,
  ),
  "utf8",
);

test("source artifact authority contract is type-only and infrastructure-neutral", () => {
  assert.doesNotMatch(contractSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.doesNotMatch(contractSource, /\b(?:node:|next\/|react|app\/api|workflow|provider|upload|pendingUploads|acceptedPersistence)\b/i);
  assert.doesNotMatch(contractSource, /\b(?:filesystem|absolutePath|relativePath|filename|Buffer|Uint8Array|process\.env|fetch|database|JWT|Session|RBAC|ACL)\b/i);
  assert.match(contractSource, /^import type \{ SourceArtifactReference \}/m);
  assert.match(contractSource, /export type SourceArtifactAuthorityCapability/);
  assert.match(contractSource, /resultVersion: "1\.0"/);
});

test("deterministic fixture has no external runtime or mutable global state", () => {
  assert.doesNotMatch(fixtureSource, /\b(?:node:fs|node:path|node:os|fetch|process\.env|Date\.now|new Date|Math\.random|randomUUID|setTimeout|setInterval)\b/);
  assert.doesNotMatch(fixtureSource, /\b(?:Map|Set|WeakMap|WeakSet|singleton|globalRegistry|defaultRegistry)\b/);
  assert.doesNotMatch(fixtureSource, /app\/api|workflow|provider|upload|pendingUploads|acceptedPersistence/i);
  assert.match(fixtureSource, /Object\.freeze\(records\.map\(copyRecord\)\)/);
});
