import assert from "node:assert/strict";
import test from "node:test";

import {
  createMaterializationRuntimeComposition,
} from "../../../lib/server/inputMaterialization/materializationRuntimeComposition";
import {
  createProductionMaterializationProviderComposition,
} from "../../../lib/server/inputMaterialization/productionMaterializationProviderComposition";
import {
  createDeterministicMaterializationRuntimeCompositionFixture,
} from "../../../lib/server/inputMaterialization/referenceDeterministicMaterializationRuntimeComposition";
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
    opaqueMaterializedArtifactReference: "artifact:composition",
  },
  retryClassification: "retry-not-required",
  audit: {
    auditVersion: "1.0",
    entries: [],
  },
} as const;

test("composition wires the supplied provider and validation into its facade", async () => {
  const strategyFixture =
    createDeterministicProductionMaterializationStrategyFixture(decision);
  const providerComposition =
    createProductionMaterializationProviderComposition(
      strategyFixture.strategy,
    );
  const validation = createMaterializationRuntimeProviderInputValidation();
  const composition = createMaterializationRuntimeComposition({
    providerComposition,
    validation,
  });

  assert.equal(composition.provider, providerComposition.provider);
  assert.equal(composition.validation, validation);
  const result = await composition.facade.invoke({
    facadeInputVersion: "1.0",
    providerInput: providerInput(),
  });
  assert.equal(result.status, "completed");
  assert.equal(strategyFixture.invocations().length, 1);
});

test("composition and deterministic results are immutable", async () => {
  const fixture =
    createDeterministicMaterializationRuntimeCompositionFixture(decision);
  const result = await fixture.composition.facade.invoke({
    facadeInputVersion: "1.0",
    providerInput: providerInput(),
  });

  assert.equal(Object.isFrozen(fixture), true);
  assert.equal(Object.isFrozen(fixture.composition), true);
  assert.equal(Object.isFrozen(fixture.composition.facade), true);
  assert.equal(Object.isFrozen(fixture.composition.provider), true);
  assert.equal(Object.isFrozen(fixture.composition.validation), true);
  assert.equal(Object.isFrozen(result), true);
});

test("deterministic composition fixtures isolate nested state", async () => {
  const first =
    createDeterministicMaterializationRuntimeCompositionFixture(decision);
  const second =
    createDeterministicMaterializationRuntimeCompositionFixture(decision);
  const input = providerInput();

  const firstResult = await first.composition.facade.invoke({
    facadeInputVersion: "1.0",
    providerInput: input,
  });
  const secondResult = await second.composition.facade.invoke({
    facadeInputVersion: "1.0",
    providerInput: providerInput(),
  });

  assert.deepEqual(firstResult, secondResult);
  assert.notEqual(firstResult, secondResult);
  assert.equal(first.strategyFixture.invocations().length, 1);
  assert.equal(second.strategyFixture.invocations().length, 1);
  assert.notEqual(
    first.strategyFixture.invocations()[0],
    second.strategyFixture.invocations()[0],
  );
  assert.notEqual(first.strategyFixture.invocations()[0], input);
});

test("validation rejection prevents deterministic strategy invocation", async () => {
  const fixture =
    createDeterministicMaterializationRuntimeCompositionFixture(decision);
  const result = await fixture.composition.facade.invoke({
    facadeInputVersion: "1.0",
    providerInput: {
      ...providerInput(),
      providerInputVersion: "9.0",
    },
  });

  assert.equal(result.status, "rejected");
  assert.equal(fixture.strategyFixture.invocations().length, 0);
});
