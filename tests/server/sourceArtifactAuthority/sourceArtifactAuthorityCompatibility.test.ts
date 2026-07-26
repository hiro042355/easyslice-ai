import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  InputMaterializationCapability,
  SourceArtifactReference,
} from "../../../lib/server/inputMaterialization/types";
import type {
  SourceArtifactAuthorityCapability,
  SourceArtifactAuthorityResolutionInput,
} from "../../../lib/server/sourceArtifactAuthority/types";

const legacySourceReference: SourceArtifactReference = {
  referenceVersion: "1.0",
  opaqueSourceArtifactReference: "legacy-source",
};

const acceptsLegacyMaterializationCapability = (
  value: InputMaterializationCapability,
): InputMaterializationCapability => value;

const acceptsAuthorityCapability = (
  value: SourceArtifactAuthorityCapability,
): SourceArtifactAuthorityCapability => value;

test("authority contract preserves existing materialization source reference shape", () => {
  const authorityInput: SourceArtifactAuthorityResolutionInput = {
    inputVersion: "1.0",
    sourceArtifact: legacySourceReference,
    context: {
      contextVersion: "1.0",
      requestIdentity: "request-compatibility",
      operationIdentity: "operation-compatibility",
      ownershipScope: {
        scopeVersion: "1.0",
        sourceTenantReference: "tenant-compatibility",
        sourceOwnershipReference: "owner-compatibility",
      },
      authorizationEvidence: {
        evidenceVersion: "1.0",
        authorityDecisionReference: "decision-compatibility",
        decision: "authorized",
      },
    },
  };

  assert.equal(authorityInput.sourceArtifact, legacySourceReference);
  assert.equal(typeof acceptsLegacyMaterializationCapability, "function");
  assert.equal(typeof acceptsAuthorityCapability, "function");
});

test("authority foundation creates no reverse dependency from committed consumers", () => {
  const materializationTypes = readFileSync(
    new URL("../../../lib/server/inputMaterialization/types.ts", import.meta.url),
    "utf8",
  );
  const materializationRuntime = readFileSync(
    new URL(
      "../../../lib/server/inputMaterialization/referenceFilesystemInputMaterializationAdapter.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.doesNotMatch(materializationTypes, /sourceArtifactAuthority/);
  assert.doesNotMatch(materializationRuntime, /sourceArtifactAuthority/);
});
