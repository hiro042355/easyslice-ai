import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { AuthorityLocatorResolutionAdapter } from "../../../lib/server/authorityLocatorResolution/authorityLocatorAdapterTypes";
import type { InputMaterializationV2Request } from "../../../lib/server/inputMaterialization/resolutionContextV2Types";
import type {
  SourceArtifactPrincipalAuthorizationBinding,
  SourceArtifactPrincipalAwareResolutionContext,
} from "../../../lib/server/sourceArtifactAuthority/principalTypes";
import type { SourceArtifactAuthorityResolutionResult } from "../../../lib/server/sourceArtifactAuthority/types";
import type {
  SourceArtifactLocatorV2Request,
  SourceArtifactLocatorV2ResolutionContext,
} from "../../../lib/server/sourceArtifactLocator/types";
import type { WorkflowEntryTrustedContextAdapter } from "../../../lib/server/workflowEntryMaterialization/adapterTypes";

test("adapter boundary remains compatible with existing contracts", () => {
  const acceptsAuthority = (value: SourceArtifactAuthorityResolutionResult) => value;
  const acceptsContext = (value: SourceArtifactPrincipalAwareResolutionContext) => value;
  const acceptsBinding = (value: SourceArtifactPrincipalAuthorizationBinding) => value;
  const acceptsLocatorContext = (value: SourceArtifactLocatorV2ResolutionContext) => value;
  const acceptsLocatorRequest = (value: SourceArtifactLocatorV2Request) => value;
  const acceptsMaterialization = (value: InputMaterializationV2Request) => value;
  const acceptsWorkflowAdapter = (value: WorkflowEntryTrustedContextAdapter) => value;
  const acceptsAdapter = (value: AuthorityLocatorResolutionAdapter) => value;

  assert.equal(typeof acceptsAuthority, "function");
  assert.equal(typeof acceptsContext, "function");
  assert.equal(typeof acceptsBinding, "function");
  assert.equal(typeof acceptsLocatorContext, "function");
  assert.equal(typeof acceptsLocatorRequest, "function");
  assert.equal(typeof acceptsMaterialization, "function");
  assert.equal(typeof acceptsWorkflowAdapter, "function");
  assert.equal(typeof acceptsAdapter, "function");
});

test("existing contracts have no reverse dependency on resolution adapter", () => {
  for (const relativePath of [
    "../../../lib/server/sourceArtifactAuthority/types.ts",
    "../../../lib/server/sourceArtifactAuthority/principalTypes.ts",
    "../../../lib/server/sourceArtifactLocator/types.ts",
    "../../../lib/server/inputMaterialization/types.ts",
    "../../../lib/server/inputMaterialization/resolutionContextV2Types.ts",
    "../../../lib/server/workflowEntryMaterialization/adapterTypes.ts",
    "../../../lib/server/mediaExecutionRuntimeBinding/types.ts",
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /authorityLocatorResolution|authorityLocatorResolutionAdapter/,
    );
  }
});
