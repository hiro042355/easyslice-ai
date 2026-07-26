import assert from "node:assert/strict";
import test from "node:test";

import { createDeterministicAuthorityLocatorResolutionAdapterFixture } from "../../../lib/server/authorityLocatorResolution/referenceDeterministicAuthorityLocatorAdapterFixture";
import type { AuthorityLocatorResolutionAdapterInput } from "../../../lib/server/authorityLocatorResolution/authorityLocatorAdapterTypes";

const input = (): AuthorityLocatorResolutionAdapterInput => ({
  adapterVersion: "1.0",
  authorityResult: {
    resultVersion: "1.0",
    status: "authorized",
    opaqueAuthorityRecordReference: "authority-record",
    opaqueResolutionReference: "authority-resolution",
    ownershipScope: {
      scopeVersion: "1.0",
      sourceTenantReference: "tenant-resolution",
      sourceOwnershipReference: "owner-resolution",
    },
    authorizationEvidence: {
      evidenceVersion: "1.0",
      authorityDecisionReference: "decision-resolution",
      decision: "authorized",
    },
  },
  authorityContext: {
    contextVersion: "2.0",
    sourceArtifact: {
      referenceVersion: "1.0",
      opaqueSourceArtifactReference: "source-resolution",
    },
    requestIdentity: "request-resolution",
    operationIdentity: "operation-resolution",
    principalIdentity: {
      identityVersion: "1.0",
      authorityNamespace: "principal-authority",
      principalReference: "principal-resolution",
    },
    tenantScope: {
      scopeVersion: "1.0",
      tenantReference: "tenant-resolution",
    },
    ownershipScope: {
      scopeVersion: "1.0",
      sourceTenantReference: "tenant-resolution",
      sourceOwnershipReference: "owner-resolution",
    },
    workflowScope: {
      scopeVersion: "1.0",
      workflowIdentity: "workflow-resolution",
    },
    authorizationEvidence: {
      evidenceVersion: "1.0",
      authorityDecisionReference: "decision-resolution",
      decision: "authorized",
    },
  },
  principalAuthorizationBinding: {
    bindingVersion: "1.0",
    principalIdentity: {
      identityVersion: "1.0",
      authorityNamespace: "principal-authority",
      principalReference: "principal-resolution",
    },
    authorizationEvidence: {
      evidenceVersion: "1.0",
      authorityDecisionReference: "decision-resolution",
      decision: "authorized",
    },
  },
  locatorVersion: "2.0",
  locatorContext: {
    contextVersion: "2.0",
    requestIdentity: "request-resolution",
    operationIdentity: "operation-resolution",
    workflowIdentity: "workflow-resolution",
    ownershipScope: {
      scopeVersion: "1.0",
      sourceTenantReference: "tenant-resolution",
      sourceOwnershipReference: "owner-resolution",
    },
    authorizationEvidence: {
      evidenceVersion: "1.0",
      authorityDecisionReference: "decision-resolution",
      decision: "authorized",
    },
  },
  sourceArtifact: {
    referenceVersion: "1.0",
    opaqueSourceArtifactReference: "source-resolution",
  },
  requestIdentity: "request-resolution",
  operationIdentity: "operation-resolution",
});

const adapter = createDeterministicAuthorityLocatorResolutionAdapterFixture();

test("builds a deterministic Locator V2 invocation request from aligned inputs", () => {
  const first = adapter.adapt(input());
  const second = adapter.adapt(input());

  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    resultVersion: "1.0",
    status: "adapted",
    locatorRequest: {
      version: "2.0",
      opaqueReference: "source-resolution",
      resolutionContext: input().locatorContext,
    },
  });
});

test("preserves authority denial and rejects unsupported versions", () => {
  assert.deepEqual(
    adapter.adapt({
      ...input(),
      authorityResult: {
        resultVersion: "1.0",
        status: "rejected",
        classification: "unauthorized",
      },
    }),
    {
      resultVersion: "1.0",
      status: "rejected",
      failure: "authority-denied",
    },
  );
  assert.deepEqual(
    adapter.adapt({
      ...input(),
      authorityResult: {
        ...input().authorityResult,
        resultVersion: "2.0",
      },
    }),
    {
      resultVersion: "1.0",
      status: "rejected",
      failure: "unsupported-authority-version",
    },
  );
  assert.deepEqual(adapter.adapt({ ...input(), locatorVersion: "1.0" }), {
    resultVersion: "1.0",
    status: "rejected",
    failure: "unsupported-locator-version",
  });
});

test("classifies source, request, operation, principal, tenant, ownership, workflow, and evidence mismatch", () => {
  const cases: readonly [unknown, string][] = [
    [
      {
        ...input(),
        sourceArtifact: {
          referenceVersion: "1.0",
          opaqueSourceArtifactReference: "source-other",
        },
      },
      "source-mismatch",
    ],
    [{ ...input(), requestIdentity: "request-other" }, "request-mismatch"],
    [{ ...input(), operationIdentity: "operation-other" }, "operation-mismatch"],
    [
      {
        ...input(),
        principalAuthorizationBinding: {
          ...input().principalAuthorizationBinding,
          principalIdentity: {
            ...input().principalAuthorizationBinding.principalIdentity,
            principalReference: "principal-other",
          },
        },
      },
      "principal-mismatch",
    ],
    [
      {
        ...input(),
        authorityContext: {
          ...input().authorityContext,
          tenantScope: {
            scopeVersion: "1.0",
            tenantReference: "tenant-other",
          },
        },
      },
      "tenant-mismatch",
    ],
    [
      {
        ...input(),
        locatorContext: {
          ...input().locatorContext,
          ownershipScope: {
            ...input().locatorContext.ownershipScope,
            sourceOwnershipReference: "owner-other",
          },
        },
      },
      "ownership-mismatch",
    ],
    [
      {
        ...input(),
        locatorContext: {
          ...input().locatorContext,
          workflowIdentity: "workflow-other",
        },
      },
      "workflow-mismatch",
    ],
    [
      {
        ...input(),
        locatorContext: {
          ...input().locatorContext,
          authorizationEvidence: {
            ...input().locatorContext.authorizationEvidence,
            authorityDecisionReference: "decision-other",
          },
        },
      },
      "evidence-mismatch",
    ],
  ];

  for (const [value, failure] of cases) {
    assert.deepEqual(adapter.adapt(value), {
      resultVersion: "1.0",
      status: "rejected",
      failure,
    });
  }
});

test("classifies missing context fields without inferring them", () => {
  assert.deepEqual(adapter.adapt({ ...input(), authorityResult: undefined }), {
    resultVersion: "1.0",
    status: "rejected",
    failure: "missing-authority-result",
  });

  const cases = [
    ["principalIdentity", "missing-principal"],
    ["tenantScope", "missing-tenant"],
    ["ownershipScope", "missing-ownership"],
    ["workflowScope", "missing-workflow"],
    ["authorizationEvidence", "missing-evidence"],
  ] as const;
  for (const [field, failure] of cases) {
    const authorityContext = { ...input().authorityContext };
    delete (authorityContext as Record<string, unknown>)[field];
    assert.deepEqual(adapter.adapt({ ...input(), authorityContext }), {
      resultVersion: "1.0",
      status: "rejected",
      failure,
    });
  }
});

test("returns immutable copied Locator requests", () => {
  const mutable = input();
  const result = adapter.adapt(mutable);
  assert.equal(result.status, "adapted");
  if (result.status !== "adapted") return;

  (mutable.locatorContext.ownershipScope as {
    sourceOwnershipReference: string;
  }).sourceOwnershipReference = "mutated-owner";
  (mutable.locatorContext.authorizationEvidence as {
    authorityDecisionReference: string;
  }).authorityDecisionReference = "mutated-evidence";

  assert.equal(
    result.locatorRequest.resolutionContext.ownershipScope.sourceOwnershipReference,
    "owner-resolution",
  );
  assert.equal(
    result.locatorRequest.resolutionContext.authorizationEvidence.authorityDecisionReference,
    "decision-resolution",
  );
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.locatorRequest), true);
  assert.equal(Object.isFrozen(result.locatorRequest.resolutionContext), true);
});
