import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contractSource = readFileSync(
  new URL("../../../lib/server/sourceArtifactLocator/types.ts", import.meta.url),
  "utf8",
);
const fixtureSource = readFileSync(
  new URL(
    "../../../lib/server/sourceArtifactLocator/referenceDeterministicSourceArtifactLocatorV2.ts",
    import.meta.url,
  ),
  "utf8",
);

test("source locator V2 contract is type-only and hides filesystem locations", () => {
  assert.doesNotMatch(contractSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(contractSource, /^import type \{/m);
  assert.match(contractSource, /version: "2\.0"/);
  assert.match(contractSource, /resolutionContext: SourceArtifactLocatorV2ResolutionContext/);
  assert.match(contractSource, /status: "authorized"/);
  for (const status of [
    "rejected",
    "not-found",
    "revoked",
    "expired",
    "ownership-mismatch",
    "workflow-mismatch",
    "invalid-reference",
    "internal-failure",
  ]) {
    assert.match(contractSource, new RegExp(`"${status}"`));
  }
  assert.doesNotMatch(contractSource, /\b(?:location|path|filename|Buffer|Uint8Array|filesystem)\b/i);
  assert.doesNotMatch(contractSource, /\b(?:workflow\/|upload|provider|pendingUploads|acceptedPersistence|app\/api|next\/|react)\b/i);
});

test("fixtures and compatibility adapter have no production infrastructure dependency", () => {
  assert.doesNotMatch(fixtureSource, /\b(?:node:fs|node:path|node:os|fetch|process\.env|Date\.now|new Date|Math\.random|randomUUID|setTimeout|setInterval)\b/);
  assert.doesNotMatch(fixtureSource, /app\/api|workflow\/|upload|provider|pendingUploads|acceptedPersistence/i);
  assert.doesNotMatch(fixtureSource, /\b(?:Map|Set|WeakMap|WeakSet|singleton|globalRegistry|defaultRegistry)\b/);
});
