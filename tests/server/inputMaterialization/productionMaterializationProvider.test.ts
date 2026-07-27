import assert from "node:assert/strict";
import test from "node:test";

import {
  createMaterializationRuntimeFacade,
} from "../../../lib/server/inputMaterialization/materializationRuntimeFacade";
import {
  createProductionMaterializationProviderComposition,
} from "../../../lib/server/inputMaterialization/productionMaterializationProviderComposition";
import {
  createDeterministicProductionMaterializationStrategyFixture,
} from "../../../lib/server/inputMaterialization/referenceDeterministicProductionMaterializationStrategy";
import {
  createMaterializationRuntimeProviderInputValidation,
} from "../../../lib/server/inputMaterialization/materializationRuntimeProviderValidation";

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

const decision = {
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
    entries: [{
      entryVersion: "1.0",
      sequence: 0,
      stage: "result-projection",
      classification: "materialized",
      reasonCode: "materialization-completed",
      retryClassification: "retry-not-required",
    }],
  },
} as const;

test("provider delegates exactly once and returns an isolated existing decision", async () => {
  const fixture = createDeterministicProductionMaterializationStrategyFixture(
    decision,
  );
  const composition = createProductionMaterializationProviderComposition(
    fixture.strategy,
  );
  const source = providerInput() as never;

  const result = await composition.provider.materialize(source);

  assert.deepEqual(result, decision);
  assert.notEqual(result, decision);
  assert.equal(fixture.invocations().length, 1);
  assert.notEqual(fixture.invocations()[0], source);
  assert.equal(Object.isFrozen(fixture.invocations()[0]), true);
  assert.equal(Object.isFrozen(result.audit), true);
  assert.equal(Object.isFrozen(result.audit.entries[0]), true);
});

test("provider propagates strategy exceptions without fabricating a decision", async () => {
  const fixture = createDeterministicProductionMaterializationStrategyFixture(
    decision,
    { throwOnInvocation: true },
  );
  const composition = createProductionMaterializationProviderComposition(
    fixture.strategy,
  );

  await assert.rejects(
    async () => composition.provider.materialize(providerInput() as never),
    /deterministic production materialization strategy failure/,
  );
  assert.equal(fixture.invocations().length, 1);
});

test("composition is immutable and fixture state is isolated", async () => {
  const firstFixture =
    createDeterministicProductionMaterializationStrategyFixture(decision);
  const secondFixture =
    createDeterministicProductionMaterializationStrategyFixture(decision);
  const first = createProductionMaterializationProviderComposition(
    firstFixture.strategy,
  );
  const second = createProductionMaterializationProviderComposition(
    secondFixture.strategy,
  );

  await first.provider.materialize(providerInput() as never);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(second), true);
  assert.equal(firstFixture.invocations().length, 1);
  assert.equal(secondFixture.invocations().length, 0);
});

test("facade validates once before provider and strategy success", async () => {
  const fixture = createDeterministicProductionMaterializationStrategyFixture(
    decision,
  );
  const composition = createProductionMaterializationProviderComposition(
    fixture.strategy,
  );
  const validation =
    createMaterializationRuntimeProviderInputValidation();
  let validationCount = 0;
  let providerCount = 0;
  const facade = createMaterializationRuntimeFacade({
    validation: {
      validateProviderInput(input: unknown) {
        validationCount += 1;
        return validation.validateProviderInput(input);
      },
    },
    provider: {
      materialize(input) {
        providerCount += 1;
        return composition.provider.materialize(input);
      },
    },
  });

  const result = await facade.invoke({
    facadeInputVersion: "1.0",
    providerInput: providerInput(),
  });
  assert.equal(result.status, "completed");
  assert.equal(validationCount, 1);
  assert.equal(providerCount, 1);
  assert.equal(fixture.invocations().length, 1);
});

test("facade rejection and strategy exception preserve invocation ownership", async () => {
  const normalFixture =
    createDeterministicProductionMaterializationStrategyFixture(decision);
  const normal = createProductionMaterializationProviderComposition(
    normalFixture.strategy,
  );
  const validation = createMaterializationRuntimeProviderInputValidation();
  let rejectedProviderCount = 0;
  const rejectingFacade = createMaterializationRuntimeFacade({
    validation,
    provider: {
      materialize(input) {
        rejectedProviderCount += 1;
        return normal.provider.materialize(input);
      },
    },
  });
  const rejected = await rejectingFacade.invoke({
    facadeInputVersion: "1.0",
    providerInput: { ...providerInput(), providerInputVersion: "9.0" },
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejectedProviderCount, 0);
  assert.equal(normalFixture.invocations().length, 0);

  const throwingFixture =
    createDeterministicProductionMaterializationStrategyFixture(
      decision,
      { throwOnInvocation: true },
    );
  const throwing = createProductionMaterializationProviderComposition(
    throwingFixture.strategy,
  );
  let throwingProviderCount = 0;
  const containingFacade = createMaterializationRuntimeFacade({
    validation,
    provider: {
      materialize(input) {
        throwingProviderCount += 1;
        return throwing.provider.materialize(input);
      },
    },
  });
  const contained = await containingFacade.invoke({
    facadeInputVersion: "1.0",
    providerInput: providerInput(),
  });
  assert.equal(
    contained.status === "failed" && contained.failure,
    "provider-exception",
  );
  assert.equal(throwingProviderCount, 1);
  assert.equal(throwingFixture.invocations().length, 1);
});
