import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  SourceArtifactPrincipalAuthorizationBinding,
  SourceArtifactPrincipalIdentity,
} from "../../../lib/server/sourceArtifactAuthority/principalTypes";
import type {
  SourceArtifactAuthorizationEvidence,
  SourceArtifactAuthorityCapability,
  SourceArtifactOwnershipScope,
  SourceArtifactResolutionContext,
} from "../../../lib/server/sourceArtifactAuthority/types";
import type { SourceArtifactLocatorV2ResolutionContext } from "../../../lib/server/sourceArtifactLocator/types";
import type { InputMaterializationRequest } from "../../../lib/server/inputMaterialization/types";

const principal: SourceArtifactPrincipalIdentity = {
  identityVersion: "1.0",
  authorityNamespace: "authority-compatibility",
  principalReference: "principal-compatibility",
};
const ownership: SourceArtifactOwnershipScope = {
  scopeVersion: "1.0",
  sourceTenantReference: "tenant-compatibility",
  sourceOwnershipReference: "owner-compatibility",
};
const evidence: SourceArtifactAuthorizationEvidence = {
  evidenceVersion: "1.0",
  authorityDecisionReference: "decision-compatibility",
  decision: "authorized",
};
const binding: SourceArtifactPrincipalAuthorizationBinding = {
  bindingVersion: "1.0",
  principalIdentity: principal,
  authorizationEvidence: evidence,
};

test("principal, ownership, workflow, and evidence remain distinct contracts", () => {
  assert.notDeepEqual(principal, ownership);
  assert.notDeepEqual(principal, evidence);
  assert.notDeepEqual(principal.principalReference, "workflow-compatibility");
  assert.equal(binding.principalIdentity, principal);
  assert.equal(binding.authorizationEvidence, evidence);
});

test("existing Authority V1, Locator V2, and Materialization types remain usable", () => {
  const legacyContext: SourceArtifactResolutionContext = {
    contextVersion: "1.0",
    requestIdentity: "request-compatibility",
    operationIdentity: "operation-compatibility",
    ownershipScope: ownership,
    authorizationEvidence: evidence,
  };
  const locatorContext: SourceArtifactLocatorV2ResolutionContext = {
    contextVersion: "2.0",
    requestIdentity: legacyContext.requestIdentity,
    operationIdentity: legacyContext.operationIdentity,
    workflowIdentity: "workflow-compatibility",
    ownershipScope: ownership,
    authorizationEvidence: evidence,
  };
  const acceptsAuthority = (value: SourceArtifactAuthorityCapability) => value;
  const acceptsMaterialization = (value: InputMaterializationRequest) => value;

  assert.equal(locatorContext.workflowIdentity, "workflow-compatibility");
  assert.equal(typeof acceptsAuthority, "function");
  assert.equal(typeof acceptsMaterialization, "function");
});

test("extension creates no reverse dependency in existing contracts", () => {
  for (const relativePath of [
    "../../../lib/server/sourceArtifactAuthority/types.ts",
    "../../../lib/server/sourceArtifactLocator/types.ts",
    "../../../lib/server/inputMaterialization/types.ts",
    "../../../lib/server/mediaExecutionRuntimeBinding/types.ts",
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /principalTypes|referenceDeterministicPrincipalContextFixture/);
  }
});
