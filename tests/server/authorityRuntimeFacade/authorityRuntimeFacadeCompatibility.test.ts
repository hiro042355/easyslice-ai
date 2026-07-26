import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { AuthorityRuntimeFacade } from "../../../lib/server/authorityRuntimeFacade/authorityRuntimeFacadeTypes";
import type { PrincipalAwareAuthorityRuntimeProviderCapability } from "../../../lib/server/sourceArtifactAuthority/principalAwareRuntimeProviderCapability";
import type { PrincipalAwareAuthorityRuntimeProviderInput } from "../../../lib/server/sourceArtifactAuthority/principalAwareRuntimeProviderTypes";
import type { SourceArtifactPrincipalAwareResolutionContext } from "../../../lib/server/sourceArtifactAuthority/principalTypes";
import type {
  SourceArtifactAuthorityCapability,
  SourceArtifactAuthorityResolutionResult,
} from "../../../lib/server/sourceArtifactAuthority/types";

test("facade remains compatible with provider V2 and Authority V1 result contracts", () => {
  const acceptsFacade = (value: AuthorityRuntimeFacade) => value;
  const acceptsProvider = (value: PrincipalAwareAuthorityRuntimeProviderCapability) => value;
  const acceptsProviderInput = (value: PrincipalAwareAuthorityRuntimeProviderInput) => value;
  const acceptsContext = (value: SourceArtifactPrincipalAwareResolutionContext) => value;
  const acceptsV1 = (value: SourceArtifactAuthorityCapability) => value;
  const acceptsResult = (value: SourceArtifactAuthorityResolutionResult) => value;

  assert.equal(typeof acceptsFacade, "function");
  assert.equal(typeof acceptsProvider, "function");
  assert.equal(typeof acceptsProviderInput, "function");
  assert.equal(typeof acceptsContext, "function");
  assert.equal(typeof acceptsV1, "function");
  assert.equal(typeof acceptsResult, "function");
});

test("existing contracts have no reverse dependency on facade", () => {
  for (const relativePath of [
    "../../../lib/server/sourceArtifactAuthority/types.ts",
    "../../../lib/server/sourceArtifactAuthority/principalTypes.ts",
    "../../../lib/server/sourceArtifactAuthority/principalAwareRuntimeProviderTypes.ts",
    "../../../lib/server/sourceArtifactAuthority/principalAwareRuntimeProviderCapability.ts",
    "../../../lib/server/sourceArtifactLocator/types.ts",
    "../../../lib/server/inputMaterialization/resolutionContextV2Types.ts",
    "../../../lib/server/authorityLocatorResolution/authorityLocatorAdapterTypes.ts",
    "../../../lib/server/mediaExecutionRuntimeBinding/types.ts",
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /authorityRuntimeFacade|AuthorityRuntimeFacade/);
  }
});
