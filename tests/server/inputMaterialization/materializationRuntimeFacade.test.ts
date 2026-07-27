import assert from "node:assert/strict";
import test from "node:test";

import {
  createMaterializationRuntimeFacade,
} from "../../../lib/server/inputMaterialization/materializationRuntimeFacade";
import {
  createDeterministicMaterializationRuntimeFacadeFixture,
} from "../../../lib/server/inputMaterialization/referenceDeterministicMaterializationRuntimeFacade";

const providerInput = () => ({
  providerInputVersion: "1.0",
  handoffResult: {
    resultVersion: "1.0",
    status: "ready",
    authorityLocatorBindingResult: {},
    locatorResult: {},
    workflowMaterializationRequest: {},
    executionContext: {},
  },
});

const facadeInput = () => ({
  facadeInputVersion: "1.0",
  providerInput: providerInput(),
});

const completedDecision = {
  decisionVersion: "1.0",
  classification: "materialized",
  reasonCode: "materialization-completed",
  materializedArtifactAvailable: true,
  materializedArtifact: {
    referenceVersion: "1.0",
    opaqueMaterializedArtifactReference: "artifact:1",
  },
  retryClassification: "retry-not-required",
  audit: {
    auditVersion: "1.0",
    entries: [],
  },
} as const;

test("facade validates then invokes provider exactly once", async () => {
  const fixture = createDeterministicMaterializationRuntimeFacadeFixture(
    completedDecision,
  );
  const result = await fixture.facade.invoke(facadeInput());

  assert.equal(result.status, "completed");
  assert.deepEqual(fixture.invocationOrder(), ["validation", "provider"]);
  assert.equal(fixture.validationInvocations(), 1);
  assert.equal(fixture.providerInvocations(), 1);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(
    result.status === "completed" && Object.isFrozen(result.providerDecision.audit),
    true,
  );
});

test("facade input failures short-circuit validation and provider", async () => {
  const fixture = createDeterministicMaterializationRuntimeFacadeFixture(
    completedDecision,
  );
  const cases = [
    [null, "invalid-facade-input"],
    [{ ...facadeInput(), facadeInputVersion: "9.0" }, "unsupported-facade-version"],
    [{ facadeInputVersion: "1.0" }, "missing-provider-input"],
  ] as const;

  for (const [input, failure] of cases) {
    const result = await fixture.facade.invoke(input);
    assert.equal(result.status === "rejected" && result.failure, failure);
  }
  assert.equal(fixture.validationInvocations(), 0);
  assert.equal(fixture.providerInvocations(), 0);
});

test("validation rejection and exception short-circuit provider", async () => {
  const rejected = createDeterministicMaterializationRuntimeFacadeFixture(
    completedDecision,
  );
  const invalid = await rejected.facade.invoke({
    facadeInputVersion: "1.0",
    providerInput: { ...providerInput(), providerInputVersion: "9.0" },
  });
  assert.equal(invalid.status === "rejected" && invalid.stage, "validation");
  assert.equal(rejected.validationInvocations(), 1);
  assert.equal(rejected.providerInvocations(), 0);

  const throwing = createDeterministicMaterializationRuntimeFacadeFixture(
    completedDecision,
    { throwOnValidation: true },
  );
  const failed = await throwing.facade.invoke(facadeInput());
  assert.equal(failed.status === "failed" && failed.failure, "validation-exception");
  assert.equal(throwing.validationInvocations(), 1);
  assert.equal(throwing.providerInvocations(), 0);
});

test("provider failure decision is preserved and provider exceptions are contained", async () => {
  const failedDecision = {
    ...completedDecision,
    classification: "failed",
    reasonCode: "copy-failed",
    materializedArtifactAvailable: false,
    materializedArtifact: undefined,
    retryClassification: "retry-external-policy",
  } as const;
  const failedFixture = createDeterministicMaterializationRuntimeFacadeFixture(
    failedDecision,
  );
  const failed = await failedFixture.facade.invoke(facadeInput());
  assert.equal(failed.status === "failed" && failed.stage, "provider");
  assert.deepEqual(
    failed.status === "failed" && failed.providerDecision,
    failedDecision,
  );

  const throwing = createDeterministicMaterializationRuntimeFacadeFixture(
    completedDecision,
    { throwOnProvider: true },
  );
  const exception = await throwing.facade.invoke(facadeInput());
  assert.equal(
    exception.status === "failed" && exception.failure,
    "provider-exception",
  );
  assert.deepEqual(throwing.invocationOrder(), ["validation", "provider"]);
});

test("facade copies provider input and isolates fixture state", async () => {
  let received: unknown;
  const facade = createMaterializationRuntimeFacade({
    validation: {
      validateProviderInput(input: unknown) {
        return {
          resultVersion: "1.0",
          status: "valid",
          input: input as never,
        };
      },
    },
    provider: {
      materialize(input) {
        received = input;
        return completedDecision;
      },
    },
  });
  const source = facadeInput();
  await facade.invoke(source);
  assert.notEqual(received, source.providerInput);
  assert.equal(Object.isFrozen(received), true);

  const first = createDeterministicMaterializationRuntimeFacadeFixture(
    completedDecision,
  );
  const second = createDeterministicMaterializationRuntimeFacadeFixture(
    completedDecision,
  );
  await first.facade.invoke(facadeInput());
  assert.equal(first.providerInvocations(), 1);
  assert.equal(second.providerInvocations(), 0);
});
