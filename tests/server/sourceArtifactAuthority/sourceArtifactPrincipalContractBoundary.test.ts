import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contractSource = readFileSync(
  new URL("../../../lib/server/sourceArtifactAuthority/principalTypes.ts", import.meta.url),
  "utf8",
);
const fixtureSource = readFileSync(
  new URL(
    "../../../lib/server/sourceArtifactAuthority/referenceDeterministicPrincipalContextFixture.ts",
    import.meta.url,
  ),
  "utf8",
);

test("principal extension contract is type-only and keeps identity concepts separate", () => {
  assert.doesNotMatch(contractSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(contractSource, /^import type \{/m);
  assert.match(contractSource, /export type SourceArtifactPrincipalIdentity/);
  assert.match(contractSource, /principalIdentity: SourceArtifactPrincipalIdentity/);
  assert.match(contractSource, /ownershipScope: SourceArtifactOwnershipScope/);
  assert.match(contractSource, /workflowScope: SourceArtifactWorkflowScope/);
  assert.match(contractSource, /authorizationEvidence: SourceArtifactAuthorizationEvidence/);
  assert.doesNotMatch(contractSource, /\b(?:credential|token|session|password|secret|location|path|filename|Buffer|Uint8Array)\b/i);
});

test("principal fixture performs no authentication, authorization evaluation, or infrastructure work", () => {
  assert.doesNotMatch(fixtureSource, /\b(?:authenticate|permission|delegate|revoke|authorize\s*\(|isAuthorized|evaluatePolicy)\b/i);
  assert.doesNotMatch(fixtureSource, /\b(?:node:fs|node:path|node:os|fetch|process\.env|Date\.now|new Date|Math\.random|randomUUID|setTimeout|setInterval)\b/);
  assert.doesNotMatch(fixtureSource, /app\/api|workflow\/|sourceArtifactLocator|runtimeBinding/i);
  assert.doesNotMatch(fixtureSource, /\b(?:Map|Set|WeakMap|WeakSet|singleton|globalRegistry|defaultRegistry)\b/);
});
