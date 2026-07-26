import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contractSource = readFileSync(
  new URL(
    "../../../lib/server/inputMaterialization/resolutionContextV2Types.ts",
    import.meta.url,
  ),
  "utf8",
);
const projectorSource = readFileSync(
  new URL(
    "../../../lib/server/inputMaterialization/referenceDeterministicResolutionContextV2Projector.ts",
    import.meta.url,
  ),
  "utf8",
);
const principalContractSource = readFileSync(
  new URL(
    "../../../lib/server/sourceArtifactAuthority/principalTypes.ts",
    import.meta.url,
  ),
  "utf8",
);

test("Materialization V2 contract is type-only and reuses authority and locator contracts", () => {
  assert.doesNotMatch(contractSource, /^export\s+(?:const|function|class|enum)\b/m);
  assert.match(contractSource, /import type \{/);
  assert.match(contractSource, /SourceArtifactPrincipalAwareResolutionContext/);
  assert.match(
    contractSource,
    /InputMaterializationV2ExplicitResolutionContext\s*=\s*\n\s*SourceArtifactPrincipalAwareResolutionContext/,
  );
  assert.match(contractSource, /SourceArtifactLocatorV2ResolutionContext/);
  assert.doesNotMatch(contractSource, /type MaterializationPrincipal|type .*AuthorizationEvidence\s*=/);
  assert.match(principalContractSource, /principalIdentity: SourceArtifactPrincipalIdentity/);
  assert.match(principalContractSource, /ownershipScope: SourceArtifactOwnershipScope/);
  assert.match(principalContractSource, /authorizationEvidence: SourceArtifactAuthorizationEvidence/);
});

test("projector has no runtime, authority, locator, identity-generation, or infrastructure behavior", () => {
  assert.doesNotMatch(projectorSource, /\b(?:resolveSourceArtifact|locateSourceV2|authenticate|authorize|permission|delegate|lookup)\s*\(/i);
  assert.doesNotMatch(projectorSource, /\b(?:node:fs|node:path|node:os|fetch|process\.env|Date\.now|new Date|Math\.random|randomUUID|setTimeout|setInterval)\b/);
  assert.doesNotMatch(projectorSource, /\b(?:credential|token|session|password|secret|location|path|filename|Buffer|Uint8Array)\b/i);
  assert.doesNotMatch(projectorSource, /\b(?:Map|Set|WeakMap|WeakSet|singleton|globalRegistry|defaultRegistry)\b/);
});
