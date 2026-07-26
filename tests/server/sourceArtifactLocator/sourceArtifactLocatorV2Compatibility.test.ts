import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { SourceArtifactLocatorCapability } from "../../../lib/server/inputMaterialization/referenceFilesystemInputMaterializationAdapter";
import type {
  SourceArtifactLocatorV2Capability,
} from "../../../lib/server/sourceArtifactLocator/types";

const legacy: SourceArtifactLocatorCapability = {
  locateSource(reference) {
    return { location: `internal:${reference.opaqueReference}` };
  },
};
const acceptsV2 = (value: SourceArtifactLocatorV2Capability): SourceArtifactLocatorV2Capability =>
  value;

test("existing V1 consumers remain structurally compatible and unchanged", () => {
  assert.equal(typeof legacy.locateSource, "function");
  assert.equal(typeof acceptsV2, "function");

  const materializationRuntime = readFileSync(
    new URL(
      "../../../lib/server/inputMaterialization/referenceFilesystemInputMaterializationAdapter.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(materializationRuntime, /sourceArtifactLocator/);
  assert.doesNotMatch(materializationRuntime, /locateSourceV2/);
});

test("V2 creates no reverse dependency in authority or committed runtime boundaries", () => {
  const authorityContract = readFileSync(
    new URL("../../../lib/server/sourceArtifactAuthority/types.ts", import.meta.url),
    "utf8",
  );
  const runtimeBinding = readFileSync(
    new URL("../../../lib/server/mediaExecutionRuntimeBinding/types.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(authorityContract, /sourceArtifactLocator/);
  assert.doesNotMatch(runtimeBinding, /sourceArtifactLocator/);
});
