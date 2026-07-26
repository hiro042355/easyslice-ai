import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const typesSource = readFileSync(
  new URL(
    "../../../lib/server/authorityRuntimeFacade/authorityRuntimeFacadeTypes.ts",
    import.meta.url,
  ),
  "utf8",
);
const facadeSource = readFileSync(
  new URL(
    "../../../lib/server/authorityRuntimeFacade/authorityRuntimeFacade.ts",
    import.meta.url,
  ),
  "utf8",
);

test("facade contract is type-only and reuses provider and Authority contracts", () => {
  assert.doesNotMatch(typesSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(typesSource, /PrincipalAwareAuthorityRuntimeProviderCapability/);
  assert.match(typesSource, /PrincipalAwareAuthorityRuntimeProviderInput/);
  assert.match(typesSource, /SourceArtifactPrincipalAwareResolutionContext/);
  assert.match(typesSource, /SourceArtifactAuthorityResolutionResult/);
  assert.match(typesSource, /SourceArtifactAuthorityResolutionInput/);
  assert.doesNotMatch(typesSource, /type SourceArtifactAuthorityResolutionResult\s*=/);
});

test("facade owns validation and delegation but no policy or infrastructure", () => {
  assert.match(facadeSource, /evaluateSourceArtifact/);
  assert.match(facadeSource, /validateProviderInput/);
  assert.doesNotMatch(facadeSource, /\b(?:authorize|permission|delegate|revoke|isAllowed|isAuthorized|evaluatePolicy)\s*\(/i);
  assert.doesNotMatch(facadeSource, /\b(?:node:fs|node:path|node:os|fetch|process\.env|Date\.now|new Date|Math\.random|randomUUID|setTimeout|setInterval)\b/);
  assert.doesNotMatch(facadeSource, /\b(?:JWT|Session|RBAC|ACL|database|network|credential|token|password|location|path|filename)\b/i);
  assert.doesNotMatch(facadeSource, /sourceArtifactLocator|inputMaterialization\/reference|workflowEntry\/reference|runtimeBinding/i);
});
