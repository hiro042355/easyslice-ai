import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuthorityRuntimeFacade,
} from "../../../lib/server/authorityRuntimeFacade/authorityRuntimeFacade";
import {
  createProductionAuthorityProviderComposition,
} from "../../../lib/server/sourceArtifactAuthority/productionAuthorityProviderComposition";
import {
  createDeterministicProductionAuthorityPolicyFixture,
} from "../../../lib/server/sourceArtifactAuthority/referenceDeterministicProductionAuthorityPolicy";
import {
  createDeterministicPrincipalAwareRuntimeProviderFixture,
} from "../../../lib/server/sourceArtifactAuthority/referenceDeterministicPrincipalAwareRuntimeProviderFixture";
import type {
  PrincipalAwareAuthorityRuntimeProviderInput,
} from "../../../lib/server/sourceArtifactAuthority/principalAwareRuntimeProviderTypes";

const input = (): PrincipalAwareAuthorityRuntimeProviderInput => ({
  contractVersion: "2.0",
  sourceArtifactReference: {
    referenceVersion: "1.0",
    opaqueSourceArtifactReference: "source:1",
  },
  resolutionContext: {
    contextVersion: "2.0",
    sourceArtifact: {
      referenceVersion: "1.0",
      opaqueSourceArtifactReference: "source:1",
    },
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
    ownershipScope: {
      scopeVersion: "1.0",
      sourceTenantReference: "tenant:1",
      sourceOwnershipReference: "owner:1",
    },
    workflowScope: {
      scopeVersion: "1.0",
      workflowIdentity: "workflow:1",
    },
    authorizationEvidence: {
      evidenceVersion: "1.0",
      authorityDecisionReference: "decision:1",
      decision: "authorized",
    },
  },
});

const authorizedResult = {
  resultVersion: "1.0",
  status: "authorized",
  opaqueAuthorityRecordReference: "authority:1",
  opaqueResolutionReference: "resolution:1",
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

test("production provider delegates once and isolates input and result", async () => {
  const fixture = createDeterministicProductionAuthorityPolicyFixture(authorizedResult);
  const validation = createDeterministicPrincipalAwareRuntimeProviderFixture(
    authorizedResult,
  ).validation;
  const composition = createProductionAuthorityProviderComposition({
    policy: fixture.policy,
    validation,
  });
  const source = input();

  const result = await composition.provider.evaluateSourceArtifact(source);

  assert.deepEqual(result, authorizedResult);
  assert.equal(fixture.invocations().length, 1);
  assert.notEqual(fixture.invocations()[0], source);
  assert.equal(Object.isFrozen(fixture.invocations()[0].resolutionContext), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(
    result.status === "authorized" && Object.isFrozen(result.ownershipScope),
    true,
  );
});

test("production provider is replaceable behind Authority Runtime Facade", async () => {
  const fixture = createDeterministicProductionAuthorityPolicyFixture(authorizedResult);
  const validation = createDeterministicPrincipalAwareRuntimeProviderFixture(
    authorizedResult,
  ).validation;
  const composition = createProductionAuthorityProviderComposition({
    policy: fixture.policy,
    validation,
  });
  const facade = createAuthorityRuntimeFacade(composition);
  const providerInput = input();

  const result = await facade.evaluate({
    facadeVersion: "1.0",
    providerVersion: providerInput.contractVersion,
    sourceArtifactReference: providerInput.sourceArtifactReference,
    resolutionContext: providerInput.resolutionContext,
  });

  assert.equal(result.status, "evaluated");
  assert.equal(fixture.invocations().length, 1);
});

test("production provider normalizes missing policy and policy exceptions", async () => {
  const missing = createProductionAuthorityProviderComposition({
    policy: {} as never,
    validation: createDeterministicPrincipalAwareRuntimeProviderFixture(
      authorizedResult,
    ).validation,
  });
  assert.deepEqual(await missing.provider.evaluateSourceArtifact(input()), {
    resultVersion: "1.0",
    status: "rejected",
    classification: "unavailable",
  });

  const throwing = createProductionAuthorityProviderComposition({
    policy: {
      evaluate() {
        throw new Error("fixture policy failure");
      },
    },
    validation: createDeterministicPrincipalAwareRuntimeProviderFixture(
      authorizedResult,
    ).validation,
  });
  assert.deepEqual(await throwing.provider.evaluateSourceArtifact(input()), {
    resultVersion: "1.0",
    status: "rejected",
    classification: "unavailable",
  });
});
