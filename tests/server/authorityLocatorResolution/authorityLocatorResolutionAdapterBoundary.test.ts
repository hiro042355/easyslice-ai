import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const typesSource = readFileSync(
  new URL(
    "../../../lib/server/authorityLocatorResolution/authorityLocatorAdapterTypes.ts",
    import.meta.url,
  ),
  "utf8",
);
const adapterSource = readFileSync(
  new URL(
    "../../../lib/server/authorityLocatorResolution/authorityLocatorResolutionAdapter.ts",
    import.meta.url,
  ),
  "utf8",
);

test("adapter contract is type-only and reuses authority and locator contracts", () => {
  assert.doesNotMatch(typesSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(typesSource, /SourceArtifactAuthorityResolutionResult/);
  assert.match(typesSource, /SourceArtifactPrincipalAwareResolutionContext/);
  assert.match(typesSource, /SourceArtifactPrincipalAuthorizationBinding/);
  assert.match(typesSource, /SourceArtifactLocatorV2Request/);
  assert.match(typesSource, /SourceArtifactLocatorV2ResolutionContext/);
  assert.doesNotMatch(typesSource, /type .*PrincipalIdentity\s*=|type .*OwnershipScope\s*=/);
});

test("adapter has no runtime invocation, authorization engine, or infrastructure dependency", () => {
  assert.doesNotMatch(adapterSource, /\b(?:resolveSourceArtifact|locateSourceV2|materialize|authenticate|authorize|permission|delegate|lookup)\s*\(/i);
  assert.doesNotMatch(adapterSource, /\b(?:node:fs|node:path|node:os|fetch|process\.env|Date\.now|new Date|Math\.random|randomUUID|setTimeout|setInterval)\b/);
  assert.doesNotMatch(adapterSource, /\b(?:JWT|Session|RBAC|ACL|database|network|credential|token|password|location|path|filename)\b/i);
  assert.doesNotMatch(adapterSource, /\b(?:Map|Set|WeakMap|WeakSet|singleton|globalRegistry|defaultRegistry)\b/);
});
