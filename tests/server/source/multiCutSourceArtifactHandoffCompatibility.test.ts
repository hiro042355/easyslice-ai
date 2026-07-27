import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type {
  SourceArtifactAuthorityResolutionInput,
} from "../../../lib/server/sourceArtifactAuthority/types";
import type {
  MultiCutSourceArtifactHandoff,
} from "../../../lib/server/source/multiCutSourceArtifactHandoffTypes";

test("handoff reuses the existing authority input without remodeling", () => {
  const authorityInput = {
    inputVersion: "1.0",
    sourceArtifact: {
      referenceVersion: "1.0",
      opaqueSourceArtifactReference: "source:compatibility",
    },
    context: {
      contextVersion: "1.0",
      requestIdentity: "request:compatibility",
      operationIdentity: "operation:compatibility",
      ownershipScope: {
        scopeVersion: "1.0",
        sourceTenantReference: "tenant:compatibility",
        sourceOwnershipReference: "ownership:compatibility",
      },
      authorizationEvidence: {
        evidenceVersion: "1.0",
        authorityDecisionReference: "decision:compatibility",
        decision: "authorized",
      },
    },
  } satisfies SourceArtifactAuthorityResolutionInput;
  const handoff: MultiCutSourceArtifactHandoff = {
    handoffVersion: "1.0",
    authorityInput,
  };

  assert.equal(handoff.authorityInput, authorityInput);
});

test("existing source, authority, upload, and route contracts have no reverse dependency", () => {
  const paths = [
    "../../../lib/server/inputMaterialization/types.ts",
    "../../../lib/server/sourceArtifactAuthority/types.ts",
    "../../../lib/server/sourceArtifactAuthority/principalTypes.ts",
    "../../../lib/server/uploadBoundary/types.ts",
    "../../../lib/server/multiCutRoute/multiCutRouteContractTypes.ts",
  ];

  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /multiCutSourceArtifactHandoff/);
  }
});
