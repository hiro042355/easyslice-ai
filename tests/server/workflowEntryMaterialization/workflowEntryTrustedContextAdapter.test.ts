import assert from "node:assert/strict";
import test from "node:test";

import { createDeterministicWorkflowEntryTrustedContextAdapterFixture } from "../../../lib/server/workflowEntryMaterialization/referenceDeterministicTrustedContextAdapterFixture";
import type { WorkflowEntryTrustedContextAdapterInput } from "../../../lib/server/workflowEntryMaterialization/adapterTypes";

const input = (): WorkflowEntryTrustedContextAdapterInput => ({
  adapterVersion: "1.0",
  workflowEntry: {
    envelopeVersion: "1.0",
    request: {
      requestVersion: "1.0",
      requestId: "request-adapter",
    },
    selection: {
      selectionVersion: "1.0",
      workflow: {
        workflowId: "workflow-adapter",
        workflowVersion: "1.0",
      },
      mode: "exact",
    },
    input: {
      inputVersion: "1.0",
      payload: {
        requestVersion: "1.0",
        requestIdentity: "request-adapter",
        operationIdentity: "operation-adapter",
        sourceArtifact: {
          referenceVersion: "1.0",
          opaqueSourceArtifactReference: "source-adapter",
        },
        workspace: {
          referenceVersion: "1.0",
          opaqueWorkspaceReference: "workspace-adapter",
        },
        materializedArtifact: {
          referenceVersion: "1.0",
          opaqueMaterializedArtifactReference: "materialized-adapter",
        },
        ownership: {
          projectionVersion: "1.0",
          authenticatedTenantReference: "tenant-adapter",
          requestTenantReference: "tenant-adapter",
          sourceTenantReference: "tenant-adapter",
          workspaceTenantReference: "tenant-adapter",
          authenticatedOwnershipReference: "authenticated-owner-adapter",
          sourceOwnershipReference: "source-owner-adapter",
          workspaceOwnershipReference: "workspace-owner-adapter",
          operationOwnershipReference: "operation-owner-adapter",
        },
        policy: {
          policyVersion: "1.0",
          collisionPolicy: "reject-existing",
        },
      },
    },
    metadata: [],
    idempotency: {
      identityVersion: "1.0",
      keyIdentity: "key-adapter",
      requestFingerprintIdentity: "fingerprint-adapter",
      replayClassification: "new",
    },
  },
  trustedContext: {
    contextVersion: "2.0",
    sourceArtifact: {
      referenceVersion: "1.0",
      opaqueSourceArtifactReference: "source-adapter",
    },
    requestIdentity: "request-adapter",
    operationIdentity: "operation-adapter",
    principalIdentity: {
      identityVersion: "1.0",
      authorityNamespace: "principal-authority-adapter",
      principalReference: "principal-adapter",
    },
    tenantScope: {
      scopeVersion: "1.0",
      tenantReference: "tenant-adapter",
    },
    ownershipScope: {
      scopeVersion: "1.0",
      sourceTenantReference: "tenant-adapter",
      sourceOwnershipReference: "source-owner-adapter",
    },
    authorizationEvidence: {
      evidenceVersion: "1.0",
      authorityDecisionReference: "evidence-adapter",
      decision: "authorized",
    },
  },
});

const adapter = createDeterministicWorkflowEntryTrustedContextAdapterFixture();

test("builds a deterministic Materialization V2 request from explicit trusted input", () => {
  const first = adapter.adapt(input());
  const second = adapter.adapt(input());

  assert.deepEqual(first, second);
  assert.equal(first.status, "adapted");
  if (first.status !== "adapted") return;
  assert.equal(first.materializationRequest.version, "2.0");
  assert.equal(
    first.materializationRequest.sourceResolutionContext.workflowScope.workflowIdentity,
    "workflow-adapter",
  );
  assert.equal(first.locatorWorkflowIdentity, "workflow-adapter");
  assert.equal(
    first.materializationRequest.sourceResolutionContext.principalIdentity.principalReference,
    "principal-adapter",
  );
});

test("classifies missing trusted values without inference", () => {
  const cases = [
    ["principalIdentity", "missing-principal"],
    ["tenantScope", "missing-tenant"],
    ["ownershipScope", "missing-ownership"],
    ["authorizationEvidence", "missing-evidence"],
  ] as const;

  for (const [field, failure] of cases) {
    const trustedContext = { ...input().trustedContext };
    delete (trustedContext as Record<string, unknown>)[field];
    assert.deepEqual(adapter.adapt({ ...input(), trustedContext }), {
      resultVersion: "1.0",
      status: "rejected",
      failure,
    });
  }

  const workflowEntry = {
    ...input().workflowEntry,
    selection: {
      ...input().workflowEntry.selection,
      workflow: {
        ...input().workflowEntry.selection.workflow,
        workflowId: "",
      },
    },
  };
  assert.deepEqual(adapter.adapt({ ...input(), workflowEntry }), {
    resultVersion: "1.0",
    status: "rejected",
    failure: "missing-workflow",
  });
});

test("rejects unsupported and inconsistent inputs without evaluating authorization", () => {
  assert.deepEqual(adapter.adapt({ ...input(), adapterVersion: "2.0" }), {
    resultVersion: "1.0",
    status: "rejected",
    failure: "unsupported-version",
  });
  assert.deepEqual(
    adapter.adapt({
      ...input(),
      trustedContext: {
        ...input().trustedContext,
        requestIdentity: "other-request",
      },
    }),
    {
      resultVersion: "1.0",
      status: "rejected",
      failure: "invalid-context",
    },
  );
  assert.deepEqual(
    adapter.adapt({
      ...input(),
      trustedContext: {
        ...input().trustedContext,
        principalIdentity: undefined,
        ownershipScope: {
          ...input().trustedContext.ownershipScope,
          sourceOwnershipReference: "principal-adapter",
        },
        authorizationEvidence: {
          ...input().trustedContext.authorizationEvidence,
          authorityDecisionReference: "principal-adapter",
        },
      },
    }),
    {
      resultVersion: "1.0",
      status: "rejected",
      failure: "missing-principal",
    },
  );
});

test("returns immutable copies isolated from trusted caller mutation", () => {
  const mutable = input();
  const result = adapter.adapt(mutable);
  assert.equal(result.status, "adapted");
  if (result.status !== "adapted") return;

  (mutable.trustedContext.principalIdentity as {
    principalReference: string;
  }).principalReference = "mutated-principal";
  (mutable.workflowEntry.input.payload.ownership as {
    sourceOwnershipReference: string;
  }).sourceOwnershipReference = "mutated-owner";

  assert.equal(
    result.materializationRequest.sourceResolutionContext.principalIdentity.principalReference,
    "principal-adapter",
  );
  assert.equal(
    result.materializationRequest.materializationRequest.ownership.sourceOwnershipReference,
    "source-owner-adapter",
  );
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.materializationRequest), true);
  assert.equal(Object.isFrozen(result.materializationRequest.sourceResolutionContext), true);
});
