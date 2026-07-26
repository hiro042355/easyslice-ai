import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { InputMaterializationV2Request } from "../../../lib/server/inputMaterialization/resolutionContextV2Types";
import type { InputMaterializationRequest } from "../../../lib/server/inputMaterialization/types";
import type { SourceArtifactPrincipalIdentity } from "../../../lib/server/sourceArtifactAuthority/principalTypes";
import type { SourceArtifactAuthorizationEvidence } from "../../../lib/server/sourceArtifactAuthority/types";
import type { SourceArtifactLocatorV2ResolutionContext } from "../../../lib/server/sourceArtifactLocator/types";
import type { WorkflowEntryInputEnvelope } from "../../../lib/server/workflowEntry/types";
import type { WorkflowEntryTrustedContextAdapter } from "../../../lib/server/workflowEntryMaterialization/adapterTypes";

test("adapter boundary remains compatible with existing contracts", () => {
  const acceptsV1 = (value: InputMaterializationRequest) => value;
  const acceptsV2 = (value: InputMaterializationV2Request) => value;
  const acceptsEntry = (value: WorkflowEntryInputEnvelope<InputMaterializationRequest>) => value;
  const acceptsPrincipal = (value: SourceArtifactPrincipalIdentity) => value;
  const acceptsEvidence = (value: SourceArtifactAuthorizationEvidence) => value;
  const acceptsLocator = (value: SourceArtifactLocatorV2ResolutionContext) => value;
  const acceptsAdapter = (value: WorkflowEntryTrustedContextAdapter) => value;

  assert.equal(typeof acceptsV1, "function");
  assert.equal(typeof acceptsV2, "function");
  assert.equal(typeof acceptsEntry, "function");
  assert.equal(typeof acceptsPrincipal, "function");
  assert.equal(typeof acceptsEvidence, "function");
  assert.equal(typeof acceptsLocator, "function");
  assert.equal(typeof acceptsAdapter, "function");
});

test("existing contracts have no reverse dependency on trusted context adapter", () => {
  for (const relativePath of [
    "../../../lib/server/workflowEntry/types.ts",
    "../../../lib/server/inputMaterialization/types.ts",
    "../../../lib/server/inputMaterialization/resolutionContextV2Types.ts",
    "../../../lib/server/sourceArtifactAuthority/types.ts",
    "../../../lib/server/sourceArtifactAuthority/principalTypes.ts",
    "../../../lib/server/sourceArtifactLocator/types.ts",
    "../../../lib/server/mediaExecutionRuntimeBinding/types.ts",
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /workflowEntryMaterialization|trustedContextAdapter/,
    );
  }
});
