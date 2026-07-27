import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeterministicLocatorMaterializationHandoffFixture,
} from "../../../lib/server/locatorMaterializationHandoff/referenceDeterministicLocatorMaterializationHandoff";

const input = () => {
  const ownershipScope = {
    scopeVersion: "1.0",
    sourceTenantReference: "tenant:1",
    sourceOwnershipReference: "owner:1",
  } as const;
  const evidence = {
    evidenceVersion: "1.0",
    authorityDecisionReference: "decision:1",
    decision: "authorized",
  } as const;
  const locatorContext = {
    contextVersion: "2.0",
    requestIdentity: "request:1",
    operationIdentity: "operation:1",
    workflowIdentity: "workflow:1",
    ownershipScope,
    authorizationEvidence: evidence,
  } as const;
  const locatorRequest = {
    version: "2.0",
    opaqueReference: "source:opaque:1",
    resolutionContext: locatorContext,
  } as const;
  const authorityResult = {
    resultVersion: "1.0",
    status: "authorized",
    opaqueAuthorityRecordReference: "authority:1",
    opaqueResolutionReference: "authority-resolution:1",
    ownershipScope,
    authorizationEvidence: evidence,
  } as const;
  const locatorResult = {
    resultVersion: "2.0",
    status: "authorized",
    opaqueResolutionReference: "../opaque://do-not-interpret",
  } as const;
  const sourceArtifact = {
    referenceVersion: "1.0",
    opaqueSourceArtifactReference: "source:opaque:1",
  } as const;

  return {
    handoffVersion: "1.0",
    authorityLocatorBindingResult: {
      resultVersion: "1.0",
      status: "completed",
      authorityResult,
      adapterResult: {
        resultVersion: "1.0",
        status: "adapted",
        locatorRequest,
      },
      locatorResult,
    },
    workflowMaterializationRequest: {
      version: "2.0",
      materializationRequest: {
        requestVersion: "1.0",
        requestIdentity: "request:1",
        operationIdentity: "operation:1",
        sourceArtifact,
        workspace: {
          referenceVersion: "1.0",
          opaqueWorkspaceReference: "workspace:1",
        },
        materializedArtifact: {
          referenceVersion: "1.0",
          opaqueMaterializedArtifactReference: "artifact:1",
        },
        ownership: {
          projectionVersion: "1.0",
          authenticatedTenantReference: "tenant:1",
          requestTenantReference: "tenant:1",
          sourceTenantReference: "tenant:1",
          workspaceTenantReference: "tenant:1",
          authenticatedOwnershipReference: "owner:1",
          sourceOwnershipReference: "owner:1",
          workspaceOwnershipReference: "owner:1",
          operationOwnershipReference: "owner:1",
        },
        policy: {
          policyVersion: "1.0",
          collisionPolicy: "reject-existing",
        },
      },
      sourceResolutionContext: {
        contextVersion: "2.0",
        sourceArtifact,
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
        ownershipScope,
        workflowScope: {
          scopeVersion: "1.0",
          workflowIdentity: "workflow:1",
        },
        authorizationEvidence: evidence,
      },
    },
    executionContext: {
      contextVersion: "1.0",
      executionWorkspaceReference: "workspace:1",
      executionOperationIdentity: "operation:1",
    },
  } as const;
};

test("valid handoff preserves opaque resolution reference and isolates output", () => {
  const fixture = createDeterministicLocatorMaterializationHandoffFixture();
  const source = input();
  const result = fixture.handoff.prepare(source);

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(
    result.locatorResult.opaqueResolutionReference,
    "../opaque://do-not-interpret",
  );
  assert.notEqual(result.authorityLocatorBindingResult, source.authorityLocatorBindingResult);
  assert.notEqual(result.workflowMaterializationRequest, source.workflowMaterializationRequest);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.workflowMaterializationRequest), true);
  assert.equal(Object.isFrozen(result.executionContext), true);
});

test("validation rejects unsuccessful binding and non-authorized locator", () => {
  const fixture = createDeterministicLocatorMaterializationHandoffFixture();
  const valid = input();
  assert.equal(fixture.handoff.prepare({
    ...valid,
    authorityLocatorBindingResult: {
      resultVersion: "1.0",
      status: "failed",
      stage: "authority",
    },
  }).status, "rejected");

  const nonAuthorized = input();
  const result = fixture.handoff.prepare({
    ...nonAuthorized,
    authorityLocatorBindingResult: {
      ...nonAuthorized.authorityLocatorBindingResult,
      locatorResult: { resultVersion: "2.0", status: "not-found" },
    },
  });
  assert.deepEqual(
    result.status === "rejected" && result.failure,
    "locator-not-authorized",
  );
});

test("validation classifies missing, unsupported, malformed, and mismatched inputs", () => {
  const fixture = createDeterministicLocatorMaterializationHandoffFixture();
  const valid = input();
  const cases: readonly [unknown, string][] = [
    [{ ...valid, handoffVersion: "9.0" }, "unsupported-handoff-version"],
    [{ handoffVersion: "1.0" }, "missing-binding-result"],
    [{
      ...valid,
      authorityLocatorBindingResult: {
        ...valid.authorityLocatorBindingResult,
        locatorResult: undefined,
      },
    }, "missing-locator-result"],
    [{ ...valid, workflowMaterializationRequest: undefined }, "missing-materialization-request"],
    [{ ...valid, executionContext: undefined }, "missing-execution-context"],
    [{
      ...valid,
      executionContext: {
        ...valid.executionContext,
        executionOperationIdentity: "operation:mismatch",
      },
    }, "identity-mismatch"],
    [null, "invalid-handoff-input"],
  ];

  for (const [candidate, failure] of cases) {
    const result = fixture.handoff.prepare(candidate);
    assert.deepEqual(result.status === "rejected" && result.failure, failure);
  }
});

test("deterministic fixture state is isolated", () => {
  const first = createDeterministicLocatorMaterializationHandoffFixture();
  const second = createDeterministicLocatorMaterializationHandoffFixture();

  first.handoff.prepare(input());
  assert.equal(first.invocations(), 1);
  assert.equal(first.results().length, 1);
  assert.equal(second.invocations(), 0);
  assert.equal(second.results().length, 0);
});
