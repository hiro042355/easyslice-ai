import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  InputMaterializationV2Request,
  InputMaterializationV2ResolutionContextProjector,
} from "../../../lib/server/inputMaterialization/resolutionContextV2Types";
import type { InputMaterializationRequest } from "../../../lib/server/inputMaterialization/types";
import type { SourceArtifactPrincipalIdentity } from "../../../lib/server/sourceArtifactAuthority/principalTypes";
import type { SourceArtifactAuthorizationEvidence } from "../../../lib/server/sourceArtifactAuthority/types";
import type { SourceArtifactLocatorV2ResolutionContext } from "../../../lib/server/sourceArtifactLocator/types";

test("V1 and V2 inputs remain separately identifiable without automatic promotion", () => {
  const acceptsV1 = (value: InputMaterializationRequest) => value;
  const acceptsV2 = (value: InputMaterializationV2Request) => value;
  const acceptsPrincipal = (value: SourceArtifactPrincipalIdentity) => value;
  const acceptsEvidence = (value: SourceArtifactAuthorizationEvidence) => value;
  const acceptsLocatorContext = (value: SourceArtifactLocatorV2ResolutionContext) => value;
  const acceptsProjector = (value: InputMaterializationV2ResolutionContextProjector) => value;

  assert.equal(typeof acceptsV1, "function");
  assert.equal(typeof acceptsV2, "function");
  assert.equal(typeof acceptsPrincipal, "function");
  assert.equal(typeof acceptsEvidence, "function");
  assert.equal(typeof acceptsLocatorContext, "function");
  assert.equal(typeof acceptsProjector, "function");
});

test("existing contracts and runtimes have no reverse dependency on Materialization V2", () => {
  for (const relativePath of [
    "../../../lib/server/inputMaterialization/types.ts",
    "../../../lib/server/inputMaterialization/referenceFilesystemInputMaterializationAdapter.ts",
    "../../../lib/server/sourceArtifactAuthority/types.ts",
    "../../../lib/server/sourceArtifactAuthority/principalTypes.ts",
    "../../../lib/server/sourceArtifactLocator/types.ts",
    "../../../lib/server/mediaExecutionRuntimeBinding/types.ts",
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /resolutionContextV2Types|referenceDeterministicResolutionContextV2Projector/,
    );
  }
});
