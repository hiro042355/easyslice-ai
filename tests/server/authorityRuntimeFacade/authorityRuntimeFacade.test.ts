import assert from "node:assert/strict";
import test from "node:test";

import { createAuthorityRuntimeFacade } from "../../../lib/server/authorityRuntimeFacade/authorityRuntimeFacade";
import { createDeterministicAuthorityRuntimeFacadeStub } from "../../../lib/server/authorityRuntimeFacade/referenceDeterministicAuthorityRuntimeFacadeStub";
import { createDeterministicPrincipalAwareRuntimeProviderFixture } from "../../../lib/server/sourceArtifactAuthority/referenceDeterministicPrincipalAwareRuntimeProviderFixture";
import type { AuthorityRuntimeFacadeInput } from "../../../lib/server/authorityRuntimeFacade/authorityRuntimeFacadeTypes";

const input = (): AuthorityRuntimeFacadeInput => ({
  facadeVersion: "1.0",
  providerVersion: "2.0",
  sourceArtifactReference: {
    referenceVersion: "1.0",
    opaqueSourceArtifactReference: "source-facade",
  },
  resolutionContext: {
    contextVersion: "2.0",
    sourceArtifact: {
      referenceVersion: "1.0",
      opaqueSourceArtifactReference: "source-facade",
    },
    requestIdentity: "request-facade",
    operationIdentity: "operation-facade",
    principalIdentity: {
      identityVersion: "1.0",
      authorityNamespace: "principal-authority",
      principalReference: "principal-facade",
    },
    tenantScope: {
      scopeVersion: "1.0",
      tenantReference: "tenant-facade",
    },
    ownershipScope: {
      scopeVersion: "1.0",
      sourceTenantReference: "tenant-facade",
      sourceOwnershipReference: "owner-facade",
    },
    workflowScope: {
      scopeVersion: "1.0",
      workflowIdentity: "workflow-facade",
    },
    authorizationEvidence: {
      evidenceVersion: "1.0",
      authorityDecisionReference: "evidence-facade",
      decision: "authorized",
    },
  },
});

const fixedResult = {
  resultVersion: "1.0" as const,
  status: "authorized" as const,
  opaqueAuthorityRecordReference: "authority-record-facade",
  opaqueResolutionReference: "resolution-facade",
  ownershipScope: {
    scopeVersion: "1.0" as const,
    sourceTenantReference: "tenant-facade",
    sourceOwnershipReference: "owner-facade",
  },
  authorizationEvidence: {
    evidenceVersion: "1.0" as const,
    authorityDecisionReference: "evidence-facade",
    decision: "authorized" as const,
  },
};

test("validates, delegates, captures, and returns deterministic Authority results", async () => {
  const stub = createDeterministicAuthorityRuntimeFacadeStub(fixedResult);
  const first = await stub.facade.evaluate(input());
  const second = await stub.facade.evaluate(input());

  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    resultVersion: "1.0",
    status: "evaluated",
    authorityResult: fixedResult,
  });
  assert.deepEqual(stub.invocations(), [
    {
      contractVersion: "2.0",
      sourceArtifactReference: input().sourceArtifactReference,
      resolutionContext: input().resolutionContext,
    },
    {
      contractVersion: "2.0",
      sourceArtifactReference: input().sourceArtifactReference,
      resolutionContext: input().resolutionContext,
    },
  ]);
});

test("classifies facade validation failures without invoking provider", async () => {
  const stub = createDeterministicAuthorityRuntimeFacadeStub(fixedResult);
  const cases: readonly [unknown, string][] = [
    [{ ...input(), providerVersion: "3.0" }, "unsupported-provider-version"],
    [{ ...input(), sourceArtifactReference: undefined }, "missing-source-reference"],
    [{ ...input(), resolutionContext: undefined }, "missing-resolution-context"],
    [{ ...input(), facadeVersion: "2.0" }, "invalid-provider-input"],
    [
      {
        ...input(),
        sourceArtifactReference: {
          referenceVersion: "1.0",
          opaqueSourceArtifactReference: "other-source",
        },
      },
      "invalid-provider-input",
    ],
  ];

  for (const [value, failure] of cases) {
    assert.deepEqual(await stub.facade.evaluate(value), {
      resultVersion: "1.0",
      status: "rejected",
      failure,
    });
  }
  assert.deepEqual(stub.invocations(), []);
});

test("validates required capabilities and normalizes provider failure", async () => {
  const fixture = createDeterministicPrincipalAwareRuntimeProviderFixture(fixedResult);
  const missingProvider = createAuthorityRuntimeFacade({
    provider: {} as never,
    validation: fixture.validation,
  });
  const throwingProvider = createAuthorityRuntimeFacade({
    provider: {
      evaluateSourceArtifact() {
        throw new Error("secret-provider-stack");
      },
    },
    validation: fixture.validation,
  });

  assert.deepEqual(await missingProvider.evaluate(input()), {
    resultVersion: "1.0",
    status: "rejected",
    failure: "internal-failure",
  });
  assert.deepEqual(await throwingProvider.evaluate(input()), {
    resultVersion: "1.0",
    status: "rejected",
    failure: "internal-failure",
  });
});

test("forwards immutable copies isolated from caller and provider result mutation", async () => {
  const mutable = input();
  const stub = createDeterministicAuthorityRuntimeFacadeStub(fixedResult);
  const result = await stub.facade.evaluate(mutable);

  (mutable.resolutionContext.principalIdentity as {
    principalReference: string;
  }).principalReference = "mutated-principal";
  (mutable.resolutionContext.ownershipScope as {
    sourceOwnershipReference: string;
  }).sourceOwnershipReference = "mutated-owner";

  const captured = stub.invocations()[0];
  assert.equal(
    captured.resolutionContext.principalIdentity.principalReference,
    "principal-facade",
  );
  assert.equal(
    captured.resolutionContext.ownershipScope.sourceOwnershipReference,
    "owner-facade",
  );
  assert.equal(Object.isFrozen(captured), true);
  assert.equal(Object.isFrozen(result), true);
  if (result.status === "evaluated") {
    assert.equal(Object.isFrozen(result.authorityResult), true);
  }
});
