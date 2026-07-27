import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeterministicAuthorityLocatorRuntimeCompositionFixture,
} from "../../../lib/server/authorityLocatorRuntimeComposition/referenceDeterministicAuthorityLocatorRuntimeComposition";

const authorityResult = {
  resultVersion: "1.0",
  status: "authorized",
  opaqueAuthorityRecordReference: "authority:1",
  opaqueResolutionReference: "authority-resolution:1",
  ownershipScope: {
    scopeVersion: "1.0",
    sourceTenantReference: "tenant:1",
    sourceOwnershipReference: "owner:1",
  },
  authorizationEvidence: {
    evidenceVersion: "1.0",
    authorityDecisionReference: "decision:1",
    decision: "authorized",
  },
} as const;

const locatorResult = {
  resultVersion: "2.0",
  status: "authorized",
  opaqueResolutionReference: "locator-resolution:1",
} as const;

const authorityInput = () => ({
  facadeVersion: "1.0",
  providerVersion: "2.0",
  sourceArtifactReference: {
    referenceVersion: "1.0",
    opaqueSourceArtifactReference: "source:1",
  },
  resolutionContext: {
    contextVersion: "2.0",
    sourceArtifact: {
      referenceVersion: "1.0",
      opaqueSourceArtifactReference: "source:1",
    },
    requestIdentity: "request:1",
    operationIdentity: "operation:1",
    principalIdentity: {
      identityVersion: "1.0",
      authorityNamespace: "fixture",
      principalReference: "principal:1",
    },
    tenantScope: {
      scopeVersion: "1.0",
      tenantReference: "tenant:1",
    },
    ownershipScope: authorityResult.ownershipScope,
    workflowScope: {
      scopeVersion: "1.0",
      workflowIdentity: "workflow:1",
    },
    authorizationEvidence: authorityResult.authorizationEvidence,
  },
} as const);

const locatorInput = () => ({
  providerVersion: "1.0",
  locatorRequest: {
    version: "2.0",
    opaqueReference: "source:1",
    resolutionContext: {
      contextVersion: "2.0",
      requestIdentity: "request:1",
      operationIdentity: "operation:1",
      workflowIdentity: "workflow:1",
      ownershipScope: authorityResult.ownershipScope,
      authorizationEvidence: authorityResult.authorizationEvidence,
    },
  },
} as const);

test("composition constructs and wires both facades deterministically", async () => {
  const fixture = createDeterministicAuthorityLocatorRuntimeCompositionFixture(
    authorityResult,
    locatorResult,
  );

  const authority = await fixture.composition.authority.facade.evaluate(
    authorityInput(),
  );
  const locator = await fixture.composition.locator.facade.invoke(locatorInput());

  assert.equal(authority.status, "evaluated");
  assert.equal(locator.status, "located");
  assert.equal(fixture.authorityInvocations().length, 1);
  assert.equal(fixture.locatorInvocations().length, 1);
});

test("composition and nested boundaries are immutable", () => {
  const fixture = createDeterministicAuthorityLocatorRuntimeCompositionFixture(
    authorityResult,
    locatorResult,
  );

  assert.equal(Object.isFrozen(fixture), true);
  assert.equal(Object.isFrozen(fixture.composition), true);
  assert.equal(Object.isFrozen(fixture.composition.authority), true);
  assert.equal(Object.isFrozen(fixture.composition.locator), true);
  assert.equal(Object.isFrozen(fixture.composition.authority.facade), true);
  assert.equal(Object.isFrozen(fixture.composition.locator.facade), true);
});

test("each composition owns isolated deterministic fixture state", async () => {
  const first = createDeterministicAuthorityLocatorRuntimeCompositionFixture(
    authorityResult,
    locatorResult,
  );
  const second = createDeterministicAuthorityLocatorRuntimeCompositionFixture(
    authorityResult,
    locatorResult,
  );

  await first.composition.authority.facade.evaluate(authorityInput());
  await first.composition.locator.facade.invoke(locatorInput());

  assert.equal(first.authorityInvocations().length, 1);
  assert.equal(first.locatorInvocations().length, 1);
  assert.equal(second.authorityInvocations().length, 0);
  assert.equal(second.locatorInvocations().length, 0);
});
