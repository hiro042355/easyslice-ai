import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocatorRuntimeFacade,
} from "../../../lib/server/locatorRuntimeFacade/locatorRuntimeFacade";
import {
  createProductionLocatorProviderComposition,
} from "../../../lib/server/sourceArtifactLocator/productionLocatorProviderComposition";
import {
  createDeterministicProductionLocatorFixture,
} from "../../../lib/server/sourceArtifactLocator/referenceDeterministicProductionLocator";
import {
  createSourceArtifactLocatorV2RuntimeProviderInputValidation,
} from "../../../lib/server/sourceArtifactLocator/locatorV2RuntimeProviderValidation";
import type {
  SourceArtifactLocatorV2RuntimeProviderInput,
} from "../../../lib/server/sourceArtifactLocator/locatorV2RuntimeProviderTypes";

const input = (): SourceArtifactLocatorV2RuntimeProviderInput => ({
  providerInputVersion: "1.0",
  locatorRequest: {
    version: "2.0",
    opaqueReference: "source:1",
    resolutionContext: {
      contextVersion: "2.0",
      requestIdentity: "request:1",
      operationIdentity: "operation:1",
      workflowIdentity: "workflow:1",
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
    },
  },
});

const authorizedResult = {
  resultVersion: "2.0",
  status: "authorized",
  opaqueResolutionReference: "resolution:1",
} as const;

test("production provider delegates once and isolates input and result", async () => {
  const fixture = createDeterministicProductionLocatorFixture(authorizedResult);
  const composition = createProductionLocatorProviderComposition({
    strategy: fixture.strategy,
    validation: createSourceArtifactLocatorV2RuntimeProviderInputValidation(),
  });
  const source = input();

  const result = await composition.provider.locateSourceArtifact(source);

  assert.deepEqual(result, authorizedResult);
  assert.equal(fixture.invocations().length, 1);
  assert.notEqual(fixture.invocations()[0], source);
  assert.equal(Object.isFrozen(fixture.invocations()[0].locatorRequest), true);
  assert.equal(
    Object.isFrozen(fixture.invocations()[0].locatorRequest.resolutionContext),
    true,
  );
  assert.equal(Object.isFrozen(result), true);
});

test("production provider is replaceable behind Locator Runtime Facade", async () => {
  const fixture = createDeterministicProductionLocatorFixture(authorizedResult);
  const composition = createProductionLocatorProviderComposition({
    strategy: fixture.strategy,
    validation: createSourceArtifactLocatorV2RuntimeProviderInputValidation(),
  });
  const facade = createLocatorRuntimeFacade(composition);
  const providerInput = input();

  const result = await facade.invoke({
    providerVersion: providerInput.providerInputVersion,
    locatorRequest: providerInput.locatorRequest,
  });

  assert.equal(result.status, "located");
  assert.equal(fixture.invocations().length, 1);
});

test("production provider normalizes missing strategy and exceptions", async () => {
  const validation = createSourceArtifactLocatorV2RuntimeProviderInputValidation();
  const missing = createProductionLocatorProviderComposition({
    strategy: {} as never,
    validation,
  });
  assert.deepEqual(await missing.provider.locateSourceArtifact(input()), {
    resultVersion: "2.0",
    status: "internal-failure",
  });

  const throwing = createProductionLocatorProviderComposition({
    strategy: {
      locate() {
        throw new Error("fixture locator failure");
      },
    },
    validation,
  });
  assert.deepEqual(await throwing.provider.locateSourceArtifact(input()), {
    resultVersion: "2.0",
    status: "internal-failure",
  });
});
