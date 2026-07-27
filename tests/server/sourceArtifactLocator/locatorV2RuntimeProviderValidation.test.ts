import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeterministicLocatorV2RuntimeProviderFixture,
} from "../../../lib/server/sourceArtifactLocator/referenceDeterministicLocatorV2RuntimeProviderFixture";
import {
  createSourceArtifactLocatorV2RuntimeProviderInputValidation,
} from "../../../lib/server/sourceArtifactLocator/locatorV2RuntimeProviderValidation";
import type {
  SourceArtifactLocatorV2RuntimeProviderInput,
} from "../../../lib/server/sourceArtifactLocator/locatorV2RuntimeProviderTypes";

const input = (): SourceArtifactLocatorV2RuntimeProviderInput => ({
  providerInputVersion: "1.0",
  locatorRequest: {
    version: "2.0",
    opaqueReference: "source:fixture:1",
    resolutionContext: {
      contextVersion: "2.0",
      requestIdentity: "request:1",
      operationIdentity: "operation:1",
      workflowIdentity: "workflow:1",
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
    },
  },
});

test("validation accepts and isolates a complete provider input", () => {
  const source = input();
  const result = createSourceArtifactLocatorV2RuntimeProviderInputValidation()
    .validateProviderInput(source);

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;
  assert.deepEqual(result.input, source);
  assert.notEqual(result.input, source);
  assert.notEqual(result.input.locatorRequest, source.locatorRequest);
  assert.equal(Object.isFrozen(result.input.locatorRequest.resolutionContext), true);
});

test("validation classifies missing and unsupported provider input", () => {
  const validate = createSourceArtifactLocatorV2RuntimeProviderInputValidation()
    .validateProviderInput;

  const cases: readonly [unknown, string][] = [
    [{ ...input(), providerInputVersion: "9.0" }, "unsupported-provider-input-version"],
    [{ providerInputVersion: "1.0" }, "missing-locator-request"],
    [{
      ...input(),
      locatorRequest: { ...input().locatorRequest, opaqueReference: undefined },
    }, "missing-source-reference"],
    [{
      ...input(),
      locatorRequest: { ...input().locatorRequest, resolutionContext: undefined },
    }, "missing-resolution-context"],
    [{
      ...input(),
      locatorRequest: { ...input().locatorRequest, version: "1.0" },
    }, "invalid-provider-input"],
  ];

  for (const [candidate, failure] of cases) {
    assert.deepEqual(validate(candidate), {
      resultVersion: "1.0",
      status: "rejected",
      failure,
    });
  }
});

test("provider fixture is deterministic, captures isolated input, and can throw", () => {
  const fixedResult = {
    resultVersion: "2.0",
    status: "authorized",
    opaqueResolutionReference: "resolution:1",
  } as const;
  const fixture = createDeterministicLocatorV2RuntimeProviderFixture(fixedResult);
  const source = input();

  assert.deepEqual(fixture.provider.locateSourceArtifact(source), fixedResult);
  assert.deepEqual(fixture.provider.locateSourceArtifact(source), fixedResult);
  assert.equal(fixture.invocations().length, 2);
  assert.notEqual(fixture.invocations()[0], source);
  assert.equal(Object.isFrozen(fixture.invocations()[0].locatorRequest), true);

  const throwing = createDeterministicLocatorV2RuntimeProviderFixture(
    fixedResult,
    { throwOnInvocation: true },
  );
  assert.throws(
    () => throwing.provider.locateSourceArtifact(source),
    /deterministic locator provider failure/,
  );
  assert.equal(throwing.invocations().length, 1);
});
