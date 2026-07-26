import assert from "node:assert/strict";
import test from "node:test";

import { createDeterministicPrincipalAwareRuntimeProviderFixture } from "../../../lib/server/sourceArtifactAuthority/referenceDeterministicPrincipalAwareRuntimeProviderFixture";
import type { PrincipalAwareAuthorityRuntimeProviderInput } from "../../../lib/server/sourceArtifactAuthority/principalAwareRuntimeProviderTypes";

const input = (): PrincipalAwareAuthorityRuntimeProviderInput => ({
  contractVersion: "2.0",
  sourceArtifactReference: {
    referenceVersion: "1.0",
    opaqueSourceArtifactReference: "source-provider-v2",
  },
  resolutionContext: {
    contextVersion: "2.0",
    sourceArtifact: {
      referenceVersion: "1.0",
      opaqueSourceArtifactReference: "source-provider-v2",
    },
    requestIdentity: "request-provider-v2",
    operationIdentity: "operation-provider-v2",
    principalIdentity: {
      identityVersion: "1.0",
      authorityNamespace: "principal-authority-v2",
      principalReference: "principal-provider-v2",
    },
    tenantScope: {
      scopeVersion: "1.0",
      tenantReference: "tenant-provider-v2",
    },
    ownershipScope: {
      scopeVersion: "1.0",
      sourceTenantReference: "tenant-provider-v2",
      sourceOwnershipReference: "owner-provider-v2",
    },
    workflowScope: {
      scopeVersion: "1.0",
      workflowIdentity: "workflow-provider-v2",
    },
    authorizationEvidence: {
      evidenceVersion: "1.0",
      authorityDecisionReference: "evidence-provider-v2",
      decision: "authorized",
    },
  },
});

const fixedResult = {
  resultVersion: "1.0" as const,
  status: "authorized" as const,
  opaqueAuthorityRecordReference: "authority-record-v2",
  opaqueResolutionReference: "resolution-v2",
  ownershipScope: {
    scopeVersion: "1.0" as const,
    sourceTenantReference: "tenant-provider-v2",
    sourceOwnershipReference: "owner-provider-v2",
  },
  authorizationEvidence: {
    evidenceVersion: "1.0" as const,
    authorityDecisionReference: "evidence-provider-v2",
    decision: "authorized" as const,
  },
};

test("validates V2 input and returns immutable copies", () => {
  const fixture = createDeterministicPrincipalAwareRuntimeProviderFixture(fixedResult);
  const result = fixture.validation.validateProviderInput(input());

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;
  assert.deepEqual(result.input, input());
  assert.notEqual(result.input, input());
  assert.equal(Object.isFrozen(result.input), true);
  assert.equal(Object.isFrozen(result.input.resolutionContext), true);
});

test("classifies unsupported, missing, and invalid inputs separately from Authority results", () => {
  const fixture = createDeterministicPrincipalAwareRuntimeProviderFixture(fixedResult);

  assert.deepEqual(
    fixture.validation.validateProviderInput({ ...input(), contractVersion: "3.0" }),
    {
      resultVersion: "1.0",
      status: "rejected",
      failure: "unsupported-provider-input-version",
    },
  );
  assert.deepEqual(
    fixture.validation.validateProviderInput({
      ...input(),
      sourceArtifactReference: undefined,
    }),
    {
      resultVersion: "1.0",
      status: "rejected",
      failure: "missing-source-reference",
    },
  );
  assert.deepEqual(
    fixture.validation.validateProviderInput({
      ...input(),
      resolutionContext: undefined,
    }),
    {
      resultVersion: "1.0",
      status: "rejected",
      failure: "missing-resolution-context",
    },
  );
  assert.deepEqual(
    fixture.validation.validateProviderInput({
      ...input(),
      sourceArtifactReference: {
        referenceVersion: "1.0",
        opaqueSourceArtifactReference: "source-other",
      },
    }),
    {
      resultVersion: "1.0",
      status: "rejected",
      failure: "invalid-provider-input",
    },
  );
});

test("returns the fixed existing Authority result and captures deterministic invocations", () => {
  const fixture = createDeterministicPrincipalAwareRuntimeProviderFixture(fixedResult);
  const first = fixture.provider.evaluateSourceArtifact(input());
  const second = fixture.provider.evaluateSourceArtifact(input());

  assert.deepEqual(first, fixedResult);
  assert.deepEqual(second, fixedResult);
  assert.notEqual(first, fixedResult);
  assert.deepEqual(fixture.invocations(), [input(), input()]);
  assert.equal(Object.isFrozen(fixture.invocations()), true);
  assert.equal(Object.isFrozen(fixture.invocations()[0]), true);
});

test("isolates fixed results and captured input from caller mutation", () => {
  const fixture = createDeterministicPrincipalAwareRuntimeProviderFixture(fixedResult);
  const mutable = input();
  const result = fixture.provider.evaluateSourceArtifact(mutable);

  (mutable.resolutionContext.principalIdentity as {
    principalReference: string;
  }).principalReference = "mutated-principal";
  (mutable.resolutionContext.ownershipScope as {
    sourceOwnershipReference: string;
  }).sourceOwnershipReference = "mutated-owner";

  const captured = fixture.invocations()[0];
  assert.equal(
    captured.resolutionContext.principalIdentity.principalReference,
    "principal-provider-v2",
  );
  assert.equal(
    captured.resolutionContext.ownershipScope.sourceOwnershipReference,
    "owner-provider-v2",
  );
  assert.deepEqual(result, fixedResult);
});
