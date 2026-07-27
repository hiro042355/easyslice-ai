import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocatorRuntimeFacade,
} from "../../../lib/server/locatorRuntimeFacade/locatorRuntimeFacade";
import {
  createDeterministicLocatorRuntimeFacadeStub,
} from "../../../lib/server/locatorRuntimeFacade/referenceDeterministicLocatorRuntimeFacadeStub";
import {
  createSourceArtifactLocatorV2RuntimeProviderInputValidation,
} from "../../../lib/server/sourceArtifactLocator/locatorV2RuntimeProviderValidation";
import type {
  LocatorRuntimeFacadeInput,
} from "../../../lib/server/locatorRuntimeFacade/locatorRuntimeFacadeTypes";

const input = (): LocatorRuntimeFacadeInput => ({
  providerVersion: "1.0",
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

test("facade validates, delegates exactly once, and returns an isolated result", async () => {
  const fixedResult = {
    resultVersion: "2.0",
    status: "authorized",
    opaqueResolutionReference: "resolution:1",
  } as const;
  const stub = createDeterministicLocatorRuntimeFacadeStub(fixedResult);

  const result = await stub.facade.invoke(input());

  assert.deepEqual(result, {
    resultVersion: "1.0",
    status: "located",
    locatorResult: fixedResult,
  });
  assert.equal(stub.invocations().length, 1);
  assert.equal(Object.isFrozen(stub.invocations()[0]), true);
  assert.equal(Object.isFrozen(stub.invocations()[0].locatorRequest), true);
  assert.equal(result.status === "located" && Object.isFrozen(result.locatorResult), true);
});

test("facade uses provider validation classifications without invoking provider", async () => {
  const stub = createDeterministicLocatorRuntimeFacadeStub({
    resultVersion: "2.0",
    status: "not-found",
  });
  const cases: readonly [unknown, string][] = [
    [{ ...input(), providerVersion: "9.0" }, "unsupported-provider-version"],
    [{ providerVersion: "1.0" }, "missing-locator-request"],
    [{
      ...input(),
      locatorRequest: { ...input().locatorRequest, opaqueReference: undefined },
    }, "missing-source-reference"],
    [{
      ...input(),
      locatorRequest: { ...input().locatorRequest, resolutionContext: undefined },
    }, "missing-resolution-context"],
    [{
      ...input(),
      locatorRequest: { ...input().locatorRequest, version: "1.0" },
    }, "invalid-provider-input"],
  ];

  for (const [candidate, failure] of cases) {
    assert.deepEqual(await stub.facade.invoke(candidate), {
      resultVersion: "1.0",
      status: "rejected",
      failure,
    });
  }
  assert.equal(stub.invocations().length, 0);
});

test("facade contains provider exceptions as internal failure", async () => {
  const stub = createDeterministicLocatorRuntimeFacadeStub(
    { resultVersion: "2.0", status: "not-found" },
    { throwOnInvocation: true },
  );

  assert.deepEqual(await stub.facade.invoke(input()), {
    resultVersion: "1.0",
    status: "rejected",
    failure: "internal-failure",
  });
  assert.equal(stub.invocations().length, 1);
});

test("facade delegates validation instead of applying an independent rule set", async () => {
  let validations = 0;
  let invocations = 0;
  const validation = createSourceArtifactLocatorV2RuntimeProviderInputValidation();
  const facade = createLocatorRuntimeFacade({
    validation: {
      validateProviderInput(value: unknown) {
        validations += 1;
        return validation.validateProviderInput(value);
      },
    },
    provider: {
      locateSourceArtifact() {
        invocations += 1;
        return { resultVersion: "2.0", status: "not-found" };
      },
    },
  });

  await facade.invoke(input());
  assert.equal(validations, 1);
  assert.equal(invocations, 1);
});
