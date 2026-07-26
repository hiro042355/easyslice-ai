import assert from "node:assert/strict";
import test from "node:test";

import { createDeterministicInputMaterializationV2ResolutionContextProjector } from "../../../lib/server/inputMaterialization/referenceDeterministicResolutionContextV2Projector";
import type { InputMaterializationV2Request } from "../../../lib/server/inputMaterialization/resolutionContextV2Types";

const request = (): InputMaterializationV2Request => ({
  version: "2.0",
  materializationRequest: {
    requestVersion: "1.0",
    requestIdentity: "request-v2",
    operationIdentity: "operation-v2",
    sourceArtifact: {
      referenceVersion: "1.0",
      opaqueSourceArtifactReference: "source-v2",
    },
    workspace: {
      referenceVersion: "1.0",
      opaqueWorkspaceReference: "workspace-v2",
    },
    materializedArtifact: {
      referenceVersion: "1.0",
      opaqueMaterializedArtifactReference: "materialized-v2",
    },
    ownership: {
      projectionVersion: "1.0",
      authenticatedTenantReference: "tenant-v2",
      requestTenantReference: "tenant-v2",
      sourceTenantReference: "tenant-v2",
      workspaceTenantReference: "tenant-v2",
      authenticatedOwnershipReference: "authenticated-owner-v2",
      sourceOwnershipReference: "source-owner-v2",
      workspaceOwnershipReference: "workspace-owner-v2",
      operationOwnershipReference: "operation-owner-v2",
    },
    policy: {
      policyVersion: "1.0",
      collisionPolicy: "reject-existing",
    },
  },
  sourceResolutionContext: {
    contextVersion: "2.0",
    sourceArtifact: {
      referenceVersion: "1.0",
      opaqueSourceArtifactReference: "source-v2",
    },
    requestIdentity: "request-v2",
    operationIdentity: "operation-v2",
    principalIdentity: {
      identityVersion: "1.0",
      authorityNamespace: "principal-authority-v2",
      principalReference: "principal-v2",
    },
    tenantScope: {
      scopeVersion: "1.0",
      tenantReference: "tenant-v2",
    },
    ownershipScope: {
      scopeVersion: "1.0",
      sourceTenantReference: "tenant-v2",
      sourceOwnershipReference: "source-owner-v2",
    },
    workflowScope: {
      scopeVersion: "1.0",
      workflowIdentity: "workflow-v2",
    },
    authorizationEvidence: {
      evidenceVersion: "1.0",
      authorityDecisionReference: "decision-v2",
      decision: "authorized",
    },
  },
});

const projector = createDeterministicInputMaterializationV2ResolutionContextProjector();

test("projects a complete explicit context deterministically", () => {
  const first = projector.projectResolutionContext(request());
  const second = projector.projectResolutionContext(request());

  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    resultVersion: "1.0",
    status: "projected",
    resolutionContext: {
      contextVersion: "2.0",
      requestIdentity: "request-v2",
      operationIdentity: "operation-v2",
      workflowIdentity: "workflow-v2",
      ownershipScope: {
        scopeVersion: "1.0",
        sourceTenantReference: "tenant-v2",
        sourceOwnershipReference: "source-owner-v2",
      },
      authorizationEvidence: {
        evidenceVersion: "1.0",
        authorityDecisionReference: "decision-v2",
        decision: "authorized",
      },
    },
  });
});

test("classifies unsupported version and missing explicit context fields", () => {
  const missingCases = [
    ["principalIdentity", "missing-principal"],
    ["tenantScope", "missing-tenant"],
    ["ownershipScope", "missing-ownership"],
    ["workflowScope", "missing-workflow"],
    ["authorizationEvidence", "missing-evidence"],
  ] as const;

  assert.deepEqual(
    projector.projectResolutionContext({ ...request(), version: "3.0" }),
    {
      resultVersion: "1.0",
      status: "rejected",
      failure: "unsupported-version",
    },
  );

  for (const [field, failure] of missingCases) {
    const sourceResolutionContext = { ...request().sourceResolutionContext };
    delete (sourceResolutionContext as Record<string, unknown>)[field];
    assert.deepEqual(
      projector.projectResolutionContext({
        ...request(),
        sourceResolutionContext,
      }),
      {
        resultVersion: "1.0",
        status: "rejected",
        failure,
      },
    );
  }
});

test("rejects malformed or inconsistent context without inferring identities", () => {
  const malformed = request();
  const inconsistent = request();

  assert.deepEqual(
    projector.projectResolutionContext({
      ...malformed,
      sourceResolutionContext: {
        ...malformed.sourceResolutionContext,
        principalIdentity: {
          ...malformed.sourceResolutionContext.principalIdentity,
          principalReference: "",
        },
      },
    }),
    {
      resultVersion: "1.0",
      status: "rejected",
      failure: "invalid-context",
    },
  );
  assert.deepEqual(
    projector.projectResolutionContext({
      ...inconsistent,
      sourceResolutionContext: {
        ...inconsistent.sourceResolutionContext,
        principalIdentity: undefined,
        ownershipScope: {
          ...inconsistent.sourceResolutionContext.ownershipScope,
          sourceOwnershipReference: "principal-v2",
        },
        workflowScope: {
          ...inconsistent.sourceResolutionContext.workflowScope,
          workflowIdentity: "principal-v2",
        },
        authorizationEvidence: {
          ...inconsistent.sourceResolutionContext.authorizationEvidence,
          authorityDecisionReference: "principal-v2",
        },
      },
    }),
    {
      resultVersion: "1.0",
      status: "rejected",
      failure: "missing-principal",
    },
  );
  assert.deepEqual(
    projector.projectResolutionContext({
      ...request(),
      sourceResolutionContext: {
        ...request().sourceResolutionContext,
        requestIdentity: "other-request",
      },
    }),
    {
      resultVersion: "1.0",
      status: "rejected",
      failure: "invalid-context",
    },
  );
});

test("returns copy-isolated, immutable projections", () => {
  const input = request();
  const result = projector.projectResolutionContext(input);
  assert.equal(result.status, "projected");
  if (result.status !== "projected") return;

  (input.sourceResolutionContext.ownershipScope as {
    sourceOwnershipReference: string;
  }).sourceOwnershipReference = "mutated-owner";
  (input.sourceResolutionContext.authorizationEvidence as {
    authorityDecisionReference: string;
  }).authorityDecisionReference = "mutated-evidence";

  assert.equal(
    result.resolutionContext.ownershipScope.sourceOwnershipReference,
    "source-owner-v2",
  );
  assert.equal(
    result.resolutionContext.authorizationEvidence.authorityDecisionReference,
    "decision-v2",
  );
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.resolutionContext), true);
  assert.equal(Object.isFrozen(result.resolutionContext.ownershipScope), true);
  assert.equal(Object.isFrozen(result.resolutionContext.authorizationEvidence), true);
});

test("rejection output contains classification only and exposes no submitted values", () => {
  const secret = "credential-token-secret-path";
  const result = projector.projectResolutionContext({
    ...request(),
    sourceResolutionContext: {
      ...request().sourceResolutionContext,
      authorizationEvidence: undefined,
      extra: secret,
    },
  });

  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.deepEqual(Object.keys(result).sort(), ["failure", "resultVersion", "status"]);
});
