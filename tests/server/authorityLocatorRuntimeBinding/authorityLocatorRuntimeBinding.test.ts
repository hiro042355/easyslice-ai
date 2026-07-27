import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuthorityLocatorRuntimeBinding,
} from "../../../lib/server/authorityLocatorRuntimeBinding/authorityLocatorRuntimeBinding";
import {
  createDeterministicAuthorityLocatorRuntimeBindingFixture,
} from "../../../lib/server/authorityLocatorRuntimeBinding/referenceDeterministicAuthorityLocatorRuntimeBinding";
import {
  createDeterministicAuthorityLocatorRuntimeCompositionFixture,
} from "../../../lib/server/authorityLocatorRuntimeComposition/referenceDeterministicAuthorityLocatorRuntimeComposition";
import {
  createAuthorityLocatorResolutionAdapter,
} from "../../../lib/server/authorityLocatorResolution/authorityLocatorResolutionAdapter";

const authorizedAuthority = {
  resultVersion: "1.0",
  status: "authorized",
  opaqueAuthorityRecordReference: "authority:1",
  opaqueResolutionReference: "authority-resolution:1",
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
} as const;

const authorizedLocator = {
  resultVersion: "2.0",
  status: "authorized",
  opaqueResolutionReference: "locator-resolution:1",
} as const;

const input = () => {
  const sourceArtifact = {
    referenceVersion: "1.0",
    opaqueSourceArtifactReference: "source:1",
  } as const;
  const principalIdentity = {
    identityVersion: "1.0",
    authorityNamespace: "fixture",
    principalReference: "principal:1",
  } as const;
  const authorityContext = {
    contextVersion: "2.0",
    sourceArtifact,
    requestIdentity: "request:1",
    operationIdentity: "operation:1",
    principalIdentity,
    tenantScope: {
      scopeVersion: "1.0",
      tenantReference: "tenant:1",
    },
    ownershipScope: authorizedAuthority.ownershipScope,
    workflowScope: {
      scopeVersion: "1.0",
      workflowIdentity: "workflow:1",
    },
    authorizationEvidence: authorizedAuthority.authorizationEvidence,
  } as const;

  return {
    bindingVersion: "1.0",
    authorityInput: {
      facadeVersion: "1.0",
      providerVersion: "2.0",
      sourceArtifactReference: sourceArtifact,
      resolutionContext: authorityContext,
    },
    adapterInput: {
      adapterVersion: "1.0",
      authorityContext,
      principalAuthorizationBinding: {
        bindingVersion: "1.0",
        principalIdentity,
        authorizationEvidence: authorizedAuthority.authorizationEvidence,
      },
      locatorVersion: "2.0",
      locatorContext: {
        contextVersion: "2.0",
        requestIdentity: "request:1",
        operationIdentity: "operation:1",
        workflowIdentity: "workflow:1",
        ownershipScope: authorizedAuthority.ownershipScope,
        authorizationEvidence: authorizedAuthority.authorizationEvidence,
      },
      sourceArtifact,
      requestIdentity: "request:1",
      operationIdentity: "operation:1",
    },
    locatorProviderVersion: "1.0",
  } as const;
};

test("authorized flow invokes authority, adapter, and locator exactly once", async () => {
  const fixture = createDeterministicAuthorityLocatorRuntimeBindingFixture(
    authorizedAuthority,
    authorizedLocator,
  );
  const result = await fixture.binding.execute(input());

  assert.equal(result.status, "completed");
  assert.deepEqual(fixture.invocationOrder(), ["authority", "adapter", "locator"]);
  assert.equal(fixture.authorityInvocations(), 1);
  assert.equal(fixture.adapterInvocations(), 1);
  assert.equal(fixture.locatorInvocations(), 1);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(
    result.status === "completed" && Object.isFrozen(result.adapterResult),
    true,
  );
});

test("non-authorized authority short-circuits adapter and locator", async () => {
  const fixture = createDeterministicAuthorityLocatorRuntimeBindingFixture(
    { resultVersion: "1.0", status: "rejected", classification: "unauthorized" },
    authorizedLocator,
  );
  const result = await fixture.binding.execute(input());

  assert.equal(result.status, "failed");
  assert.equal(result.status === "failed" && result.stage, "authority");
  assert.deepEqual(fixture.invocationOrder(), ["authority"]);
  assert.equal(fixture.adapterInvocations(), 0);
  assert.equal(fixture.locatorInvocations(), 0);
});

test("adapter failure short-circuits locator", async () => {
  const fixture = createDeterministicAuthorityLocatorRuntimeBindingFixture(
    authorizedAuthority,
    authorizedLocator,
  );
  const invalid = input();
  const result = await fixture.binding.execute({
    ...invalid,
    adapterInput: {
      ...invalid.adapterInput,
      requestIdentity: "request:mismatch",
    },
  });

  assert.equal(result.status === "failed" && result.stage, "adapter");
  assert.deepEqual(fixture.invocationOrder(), ["authority", "adapter"]);
  assert.equal(fixture.locatorInvocations(), 0);
});

test("locator failure is retained without replacing Locator V2 result", async () => {
  const locatorFailure = {
    resultVersion: "2.0",
    status: "not-found",
  } as const;
  const fixture = createDeterministicAuthorityLocatorRuntimeBindingFixture(
    authorizedAuthority,
    locatorFailure,
  );
  const result = await fixture.binding.execute(input());

  assert.equal(result.status === "failed" && result.stage, "locator");
  assert.deepEqual(
    result.status === "failed" && result.locatorResult,
    locatorFailure,
  );
  assert.deepEqual(fixture.invocationOrder(), ["authority", "adapter", "locator"]);
});

test("result copies and fixture invocation state remain isolated", async () => {
  const first = createDeterministicAuthorityLocatorRuntimeBindingFixture(
    authorizedAuthority,
    authorizedLocator,
  );
  const second = createDeterministicAuthorityLocatorRuntimeBindingFixture(
    authorizedAuthority,
    authorizedLocator,
  );
  const source = input();
  const result = await first.binding.execute(source);

  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.notEqual(result.authorityResult, authorizedAuthority);
  assert.notEqual(result.locatorResult, authorizedLocator);
  assert.equal(Object.isFrozen(result.authorityResult), true);
  assert.equal(Object.isFrozen(result.locatorResult), true);
  assert.equal(first.authorityInvocations(), 1);
  assert.equal(first.adapterInvocations(), 1);
  assert.equal(first.locatorInvocations(), 1);
  assert.equal(second.authorityInvocations(), 0);
  assert.equal(second.adapterInvocations(), 0);
  assert.equal(second.locatorInvocations(), 0);
});

test("exceptions are contained at their invocation stage", async () => {
  const composition = createDeterministicAuthorityLocatorRuntimeCompositionFixture(
    authorizedAuthority,
    authorizedLocator,
  ).composition;

  const authorityFailure = createAuthorityLocatorRuntimeBinding({
    composition: {
      ...composition,
      authority: {
        ...composition.authority,
        facade: { async evaluate() { throw new Error("authority"); } },
      },
    },
    adapter: createAuthorityLocatorResolutionAdapter(),
  });
  assert.equal(
    (await authorityFailure.execute(input()) as { stage?: string }).stage,
    "authority",
  );

  const adapterFailure = createAuthorityLocatorRuntimeBinding({
    composition,
    adapter: { adapt() { throw new Error("adapter"); } },
  });
  assert.equal(
    (await adapterFailure.execute(input()) as { stage?: string }).stage,
    "adapter",
  );

  const locatorFailure = createAuthorityLocatorRuntimeBinding({
    composition: {
      ...composition,
      locator: {
        ...composition.locator,
        facade: { async invoke() { throw new Error("locator"); } },
      },
    },
    adapter: createAuthorityLocatorResolutionAdapter(),
  });
  assert.equal(
    (await locatorFailure.execute(input()) as { stage?: string }).stage,
    "locator",
  );
});
