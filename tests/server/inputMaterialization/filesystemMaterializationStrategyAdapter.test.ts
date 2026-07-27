import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeterministicFilesystemMaterializationStrategyAdapterFixture,
} from "../../../lib/server/inputMaterialization/referenceDeterministicFilesystemMaterializationStrategyAdapter";
import {
  createMaterializationRuntimeComposition,
} from "../../../lib/server/inputMaterialization/materializationRuntimeComposition";
import {
  createMaterializationRuntimeProviderInputValidation,
} from "../../../lib/server/inputMaterialization/materializationRuntimeProviderValidation";
import {
  createProductionMaterializationProviderComposition,
} from "../../../lib/server/inputMaterialization/productionMaterializationProviderComposition";
import type {
  MaterializationRuntimeProviderInput,
} from "../../../lib/server/inputMaterialization/materializationRuntimeProviderTypes";

const request = () => ({
  requestVersion: "1.0",
  requestIdentity: "request:strategy",
  operationIdentity: "operation:strategy",
  sourceArtifact: {
    referenceVersion: "1.0",
    opaqueSourceArtifactReference: "source_strategy",
  },
  workspace: {
    referenceVersion: "1.0",
    opaqueWorkspaceReference: "workspace_strategy",
  },
  materializedArtifact: {
    referenceVersion: "1.0",
    opaqueMaterializedArtifactReference: "artifact_strategy",
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
} as const);

const context = () => ({
  contextVersion: "1.0",
  executionWorkspaceReference: "workspace_strategy",
  executionOperationIdentity: "operation:strategy",
} as const);

const providerInput = (): MaterializationRuntimeProviderInput => ({
  providerInputVersion: "1.0",
  handoffResult: {
    resultVersion: "1.0",
    status: "ready",
    authorityLocatorBindingResult: {} as never,
    locatorResult: {} as never,
    workflowMaterializationRequest: {
      version: "2.0",
      materializationRequest: request(),
      sourceResolutionContext: {} as never,
    },
    executionContext: context(),
  },
});

const decision = {
  decisionVersion: "1.0",
  classification: "materialized",
  reasonCode: "materialization-completed",
  materializedArtifactAvailable: true,
  materializedArtifact: {
    referenceVersion: "1.0",
    opaqueMaterializedArtifactReference: "artifact_strategy",
  },
  retryClassification: "retry-not-required",
  audit: {
    auditVersion: "1.0",
    entries: [{
      entryVersion: "1.0",
      sequence: 0,
      stage: "result-projection",
      classification: "materialized",
      reasonCode: "materialization-completed",
      retryClassification: "retry-not-required",
    }],
  },
} as const;

for (const mode of ["synchronous", "asynchronous"] as const) {
  test(`${mode} decision is preserved after exactly-once delegation`, async () => {
    const fixture =
      createDeterministicFilesystemMaterializationStrategyAdapterFixture(
        decision,
        mode,
      );
    const input = providerInput();
    const result = await fixture.strategy.materialize(input);

    assert.deepEqual(result, decision);
    assert.notEqual(result, decision);
    assert.equal(fixture.invocationCount(), 1);
    assert.deepEqual(fixture.invocationOrder(), ["filesystem-adapter"]);
    const invocation = fixture.invocations()[0];
    assert.deepEqual(
      invocation.request,
      input.handoffResult.workflowMaterializationRequest.materializationRequest,
    );
    assert.deepEqual(invocation.context, input.handoffResult.executionContext);
    assert.notEqual(
      invocation.request,
      input.handoffResult.workflowMaterializationRequest.materializationRequest,
    );
    assert.notEqual(invocation.context, input.handoffResult.executionContext);
  });
}

for (const mode of ["throw", "reject"] as const) {
  test(`${mode} propagates without strategy containment`, async () => {
    const fixture =
      createDeterministicFilesystemMaterializationStrategyAdapterFixture(
        decision,
        mode,
      );

    await assert.rejects(
      async () => fixture.strategy.materialize(providerInput()),
      /deterministic filesystem adapter/,
    );
    assert.equal(fixture.invocationCount(), 1);
  });
}

test("input, handoff, request, context, decision, and audit remain isolated", async () => {
  const first =
    createDeterministicFilesystemMaterializationStrategyAdapterFixture(
      decision,
    );
  const second =
    createDeterministicFilesystemMaterializationStrategyAdapterFixture(
      decision,
    );
  const input = providerInput();
  const snapshot = JSON.stringify(input);
  const result = await first.strategy.materialize(input);

  assert.equal(JSON.stringify(input), snapshot);
  assert.equal(first.invocationCount(), 1);
  assert.equal(second.invocationCount(), 0);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.audit), true);
  assert.equal(Object.isFrozen(result.audit.entries), true);
  assert.equal(Object.isFrozen(result.audit.entries[0]), true);
  assert.equal(Object.isFrozen(first.invocations()[0].request), true);
  assert.equal(Object.isFrozen(first.invocations()[0].context), true);
});

test("provider propagates adapter rejection and existing facade contains it", async () => {
  const fixture =
    createDeterministicFilesystemMaterializationStrategyAdapterFixture(
      decision,
      "reject",
    );
  const providerComposition =
    createProductionMaterializationProviderComposition(fixture.strategy);
  const runtimeComposition = createMaterializationRuntimeComposition({
    providerComposition,
    validation: createMaterializationRuntimeProviderInputValidation(),
  });
  const result = await runtimeComposition.facade.invoke({
    facadeInputVersion: "1.0",
    providerInput: providerInput(),
  });

  assert.equal(result.status, "failed");
  assert.equal(
    result.status === "failed" && result.failure,
    "provider-exception",
  );
  assert.equal(fixture.invocationCount(), 1);
});
