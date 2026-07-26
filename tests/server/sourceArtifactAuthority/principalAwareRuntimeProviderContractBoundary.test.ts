import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const typesSource = readFileSync(
  new URL(
    "../../../lib/server/sourceArtifactAuthority/principalAwareRuntimeProviderTypes.ts",
    import.meta.url,
  ),
  "utf8",
);
const capabilitySource = readFileSync(
  new URL(
    "../../../lib/server/sourceArtifactAuthority/principalAwareRuntimeProviderCapability.ts",
    import.meta.url,
  ),
  "utf8",
);
const fixtureSource = readFileSync(
  new URL(
    "../../../lib/server/sourceArtifactAuthority/referenceDeterministicPrincipalAwareRuntimeProviderFixture.ts",
    import.meta.url,
  ),
  "utf8",
);

test("provider V2 contract is type-only and reuses existing context and result types", () => {
  assert.doesNotMatch(typesSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.doesNotMatch(capabilitySource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(typesSource, /SourceArtifactPrincipalAwareResolutionContext/);
  assert.match(typesSource, /SourceArtifactAuthorityResolutionInput/);
  assert.match(capabilitySource, /SourceArtifactAuthorityResolutionResult/);
  assert.doesNotMatch(typesSource, /type .*PrincipalIdentity\s*=|type .*OwnershipScope\s*=/);
  assert.doesNotMatch(capabilitySource, /type SourceArtifactAuthorityResolutionResult\s*=/);
});

test("fixture contains no authorization policy or production infrastructure", () => {
  assert.doesNotMatch(fixtureSource, /\b(?:authorize|permission|delegate|revoke|policy|isAllowed|isAuthorized)\s*\(/i);
  assert.doesNotMatch(fixtureSource, /\b(?:node:fs|node:path|node:os|fetch|process\.env|Date\.now|new Date|Math\.random|randomUUID|setTimeout|setInterval)\b/);
  assert.doesNotMatch(fixtureSource, /\b(?:JWT|Session|RBAC|ACL|database|network|credential|token|password|location|path|filename)\b/i);
  assert.doesNotMatch(fixtureSource, /sourceArtifactLocator|inputMaterialization\/reference|runtimeBinding/i);
});
