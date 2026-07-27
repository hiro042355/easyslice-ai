import assert from "node:assert/strict";
import test from "node:test";

import {
  createReferenceProductionFilesystemMaterializationComposition,
} from "../../../lib/server/inputMaterialization/referenceProductionFilesystemMaterializationComposition";
import type {
  MaterializationRuntimeProviderInput,
} from "../../../lib/server/inputMaterialization/materializationRuntimeProviderTypes";

const providerInput = (): MaterializationRuntimeProviderInput => ({
  providerInputVersion: "1.0",
  handoffResult: {
    resultVersion: "1.0",
    status: "ready",
    authorityLocatorBindingResult: {} as never,
    locatorResult: {} as never,
    workflowMaterializationRequest: {
      version: "2.0",
      materializationRequest: {
        requestVersion: "1.0",
        requestIdentity: "request:production-composition",
        operationIdentity: "operation:production-composition",
        sourceArtifact: {
          referenceVersion: "1.0",
          opaqueSourceArtifactReference: "source_production",
        },
        workspace: {
          referenceVersion: "1.0",
          opaqueWorkspaceReference: "workspace_production",
        },
        materializedArtifact: {
          referenceVersion: "1.0",
          opaqueMaterializedArtifactReference: "artifact_production",
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
      sourceResolutionContext: {} as never,
    },
    executionContext: {
      contextVersion: "1.0",
      executionWorkspaceReference: "workspace_production",
      executionOperationIdentity: "operation:production-composition",
    },
  },
});

test("production composition wires adapter through strategy, provider, and facade", async () => {
  const fixture =
    createReferenceProductionFilesystemMaterializationComposition();
  const result = await fixture.composition.facade.invoke({
    facadeInputVersion: "1.0",
    providerInput: providerInput(),
  });

  assert.equal(result.status, "completed");
  assert.equal(
    result.status === "completed" &&
      result.providerDecision.classification,
    "materialized",
  );
  assert.equal(fixture.sourceLocatorInvocations(), 1);
  assert.equal(fixture.workspaceLocatorInvocations(), 1);
  assert.equal(fixture.inspectInvocations(), 3);
  assert.equal(fixture.copyInvocations(), 1);
  assert.deepEqual(fixture.invocationOrder(), [
    "source-locator",
    "workspace-locator",
    "filesystem-inspect",
    "filesystem-inspect",
    "filesystem-inspect",
    "filesystem-copy",
  ]);
});

test("composition and runtime result are immutable and fixture-local", async () => {
  const first =
    createReferenceProductionFilesystemMaterializationComposition();
  const second =
    createReferenceProductionFilesystemMaterializationComposition();
  const result = await first.composition.facade.invoke({
    facadeInputVersion: "1.0",
    providerInput: providerInput(),
  });

  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.composition), true);
  assert.equal(Object.isFrozen(first.composition.facade), true);
  assert.equal(Object.isFrozen(first.composition.provider), true);
  assert.equal(Object.isFrozen(first.composition.validation), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(
    result.status === "completed" &&
      Object.isFrozen(result.providerDecision.audit),
    true,
  );
  assert.equal(first.copyInvocations(), 1);
  assert.equal(second.copyInvocations(), 0);
});

test("filesystem dependency failures preserve the existing decision flow", async () => {
  const fixture =
    createReferenceProductionFilesystemMaterializationComposition();
  const input = providerInput();
  const result = await fixture.composition.facade.invoke({
    facadeInputVersion: "1.0",
    providerInput: {
      ...input,
      handoffResult: {
        ...input.handoffResult,
        workflowMaterializationRequest: {
          ...input.handoffResult.workflowMaterializationRequest,
          materializationRequest: {
            ...input.handoffResult.workflowMaterializationRequest
              .materializationRequest,
            requestIdentity: "request:production-composition:second",
            sourceArtifact: {
              referenceVersion: "1.0",
              opaqueSourceArtifactReference: "invalid/reference",
            },
          },
        },
      },
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(
    result.status === "failed" &&
      result.providerDecision?.classification,
    "invalid",
  );
});
