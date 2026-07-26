import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { AuthorityLocatorResolutionAdapter } from "../../../lib/server/authorityLocatorResolution/authorityLocatorAdapterTypes";
import type { InputMaterializationV2Request } from "../../../lib/server/inputMaterialization/resolutionContextV2Types";
import type { PrincipalAwareAuthorityRuntimeProviderCapability } from "../../../lib/server/sourceArtifactAuthority/principalAwareRuntimeProviderCapability";
import type { PrincipalAwareAuthorityRuntimeProviderInput } from "../../../lib/server/sourceArtifactAuthority/principalAwareRuntimeProviderTypes";
import type { SourceArtifactPrincipalAwareResolutionContext } from "../../../lib/server/sourceArtifactAuthority/principalTypes";
import type {
  SourceArtifactAuthorityCapability,
  SourceArtifactAuthorityResolutionResult,
} from "../../../lib/server/sourceArtifactAuthority/types";
import type { SourceArtifactLocatorV2Request } from "../../../lib/server/sourceArtifactLocator/types";

test("V1 and principal-aware V2 provider contracts coexist without conversion", () => {
  const acceptsV1 = (value: SourceArtifactAuthorityCapability) => value;
  const acceptsV2 = (value: PrincipalAwareAuthorityRuntimeProviderCapability) => value;
  const acceptsV2Input = (value: PrincipalAwareAuthorityRuntimeProviderInput) => value;
  const acceptsContext = (value: SourceArtifactPrincipalAwareResolutionContext) => value;
  const acceptsResult = (value: SourceArtifactAuthorityResolutionResult) => value;
  const acceptsLocator = (value: SourceArtifactLocatorV2Request) => value;
  const acceptsMaterialization = (value: InputMaterializationV2Request) => value;
  const acceptsResolutionAdapter = (value: AuthorityLocatorResolutionAdapter) => value;

  assert.equal(typeof acceptsV1, "function");
  assert.equal(typeof acceptsV2, "function");
  assert.equal(typeof acceptsV2Input, "function");
  assert.equal(typeof acceptsContext, "function");
  assert.equal(typeof acceptsResult, "function");
  assert.equal(typeof acceptsLocator, "function");
  assert.equal(typeof acceptsMaterialization, "function");
  assert.equal(typeof acceptsResolutionAdapter, "function");
});

test("existing contracts have no reverse dependency on provider V2", () => {
  for (const relativePath of [
    "../../../lib/server/sourceArtifactAuthority/types.ts",
    "../../../lib/server/sourceArtifactAuthority/principalTypes.ts",
    "../../../lib/server/sourceArtifactLocator/types.ts",
    "../../../lib/server/inputMaterialization/types.ts",
    "../../../lib/server/inputMaterialization/resolutionContextV2Types.ts",
    "../../../lib/server/authorityLocatorResolution/authorityLocatorAdapterTypes.ts",
    "../../../lib/server/mediaExecutionRuntimeBinding/types.ts",
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /principalAwareRuntimeProvider|PrincipalAwareAuthorityRuntimeProvider/,
    );
  }
});
