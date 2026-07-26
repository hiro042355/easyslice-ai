import assert from "node:assert/strict";
import test from "node:test";

import { createDeterministicSourceArtifactPrincipalContextFixture } from "../../../lib/server/sourceArtifactAuthority/referenceDeterministicPrincipalContextFixture";
import type { SourceArtifactPrincipalAwareResolutionContext } from "../../../lib/server/sourceArtifactAuthority/principalTypes";

const context = (): SourceArtifactPrincipalAwareResolutionContext => ({
  contextVersion: "2.0",
  sourceArtifact: {
    referenceVersion: "1.0",
    opaqueSourceArtifactReference: "source-principal-test",
  },
  requestIdentity: "request-principal-test",
  operationIdentity: "operation-principal-test",
  principalIdentity: {
    identityVersion: "1.0",
    authorityNamespace: "principal-authority",
    principalReference: "principal-logical-reference",
  },
  tenantScope: {
    scopeVersion: "1.0",
    tenantReference: "tenant-scope-reference",
  },
  ownershipScope: {
    scopeVersion: "1.0",
    sourceTenantReference: "source-tenant-reference",
    sourceOwnershipReference: "source-owner-reference",
  },
  workflowScope: {
    scopeVersion: "1.0",
    workflowIdentity: "workflow-scope-reference",
  },
  authorizationEvidence: {
    evidenceVersion: "1.0",
    authorityDecisionReference: "authorization-evidence-reference",
    decision: "authorized",
  },
});

const fixture = createDeterministicSourceArtifactPrincipalContextFixture();

test("validates and deterministically copies a complete principal-aware context", () => {
  const first = fixture.validatePrincipalContext(context());
  const second = fixture.validatePrincipalContext(context());

  assert.deepEqual(first, second);
  assert.equal(first.status, "valid");
  if (first.status !== "valid") return;
  assert.deepEqual(first.context, context());
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.context), true);
  assert.equal(Object.isFrozen(first.context.principalIdentity), true);
  assert.equal(Object.isFrozen(first.context.ownershipScope), true);
  assert.equal(Object.isFrozen(first.context.workflowScope), true);
  assert.equal(Object.isFrozen(first.context.authorizationEvidence), true);
});

test("classifies missing, empty, and unsupported principal identities", () => {
  const missing = { ...context(), principalIdentity: undefined };
  const empty = {
    ...context(),
    principalIdentity: {
      identityVersion: "1.0",
      authorityNamespace: "principal-authority",
      principalReference: "",
    },
  };
  const unsupported = {
    ...context(),
    principalIdentity: {
      identityVersion: "2.0",
      authorityNamespace: "principal-authority",
      principalReference: "principal-logical-reference",
    },
  };

  assert.deepEqual(fixture.validatePrincipalContext(missing), {
    resultVersion: "1.0",
    status: "rejected",
    failure: "missing-principal",
  });
  assert.deepEqual(fixture.validatePrincipalContext(empty), {
    resultVersion: "1.0",
    status: "rejected",
    failure: "invalid-principal-reference",
  });
  assert.deepEqual(fixture.validatePrincipalContext(unsupported), {
    resultVersion: "1.0",
    status: "rejected",
    failure: "unsupported-principal-version",
  });
});

test("classifies invalid namespace, principal shape, and surrounding context", () => {
  assert.deepEqual(
    fixture.validatePrincipalContext({
      ...context(),
      principalIdentity: {
        ...context().principalIdentity,
        authorityNamespace: "",
      },
    }),
    {
      resultVersion: "1.0",
      status: "rejected",
      failure: "invalid-authority-namespace",
    },
  );
  assert.deepEqual(
    fixture.validatePrincipalContext({ ...context(), principalIdentity: "principal" }),
    {
      resultVersion: "1.0",
      status: "rejected",
      failure: "invalid-principal",
    },
  );
  assert.deepEqual(
    fixture.validatePrincipalContext({
      ...context(),
      workflowScope: {
        scopeVersion: "1.0",
        workflowIdentity: "",
      },
    }),
    {
      resultVersion: "1.0",
      status: "rejected",
      failure: "invalid-context",
    },
  );
});

test("does not infer principal from ownership, workflow, tenant, or evidence", () => {
  const value = context();
  const withoutPrincipal = {
    ...value,
    principalIdentity: undefined,
    ownershipScope: {
      ...value.ownershipScope,
      sourceOwnershipReference: "principal-logical-reference",
    },
    workflowScope: {
      ...value.workflowScope,
      workflowIdentity: "principal-logical-reference",
    },
    tenantScope: {
      ...value.tenantScope,
      tenantReference: "principal-logical-reference",
    },
    authorizationEvidence: {
      ...value.authorizationEvidence,
      authorityDecisionReference: "principal-logical-reference",
    },
  };

  assert.deepEqual(fixture.validatePrincipalContext(withoutPrincipal), {
    resultVersion: "1.0",
    status: "rejected",
    failure: "missing-principal",
  });
});

test("isolates validation results from input mutation", () => {
  const input = context();
  const result = fixture.validatePrincipalContext(input);
  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  (input.principalIdentity as { principalReference: string }).principalReference = "mutated";
  (input.ownershipScope as { sourceOwnershipReference: string }).sourceOwnershipReference = "mutated";
  (input.workflowScope as { workflowIdentity: string }).workflowIdentity = "mutated";
  (input.authorizationEvidence as { authorityDecisionReference: string }).authorityDecisionReference = "mutated";

  assert.equal(result.context.principalIdentity.principalReference, "principal-logical-reference");
  assert.equal(result.context.ownershipScope.sourceOwnershipReference, "source-owner-reference");
  assert.equal(result.context.workflowScope.workflowIdentity, "workflow-scope-reference");
  assert.equal(
    result.context.authorizationEvidence.authorityDecisionReference,
    "authorization-evidence-reference",
  );
});

test("rejections contain classification only and expose no submitted values", () => {
  const secret = "credential-token-secret-path";
  const result = fixture.validatePrincipalContext({
    ...context(),
    principalIdentity: {
      ...context().principalIdentity,
      principalReference: "",
      extra: secret,
    },
  });

  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.deepEqual(Object.keys(result).sort(), ["failure", "resultVersion", "status"]);
});
