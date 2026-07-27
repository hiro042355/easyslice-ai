import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocatorMaterializationRuntimeBinding,
} from "../../../lib/server/locatorMaterializationRuntimeBinding/locatorMaterializationRuntimeBinding";
import {
  createDeterministicLocatorMaterializationRuntimeBindingFixture,
} from "../../../lib/server/locatorMaterializationRuntimeBinding/referenceDeterministicLocatorMaterializationRuntimeBinding";
import type {
  LocatorMaterializationRuntimeBindingInput,
} from "../../../lib/server/locatorMaterializationRuntimeBinding/types";
import type {
  ReadyLocatorMaterializationHandoffResult,
} from "../../../lib/server/inputMaterialization/materializationRuntimeProviderTypes";

const readyHandoff = (): ReadyLocatorMaterializationHandoffResult => ({
  resultVersion: "1.0",
  status: "ready",
  authorityLocatorBindingResult: {} as never,
  locatorResult: {} as never,
  workflowMaterializationRequest: {} as never,
  executionContext: {} as never,
});

const decision = {
  decisionVersion: "1.0",
  classification: "materialized",
  reasonCode: "materialization-completed",
  materializedArtifactAvailable: true,
  materializedArtifact: {
    referenceVersion: "1.0",
    opaqueMaterializedArtifactReference: "artifact:binding",
  },
  retryClassification: "retry-not-required",
  audit: {
    auditVersion: "1.0",
    entries: [],
  },
} as const;

const bindingInput = (
  fixture: ReturnType<
    typeof createDeterministicLocatorMaterializationRuntimeBindingFixture
  >,
): LocatorMaterializationRuntimeBindingInput => ({
  bindingInputVersion: "1.0",
  handoffResult: readyHandoff(),
  runtimeComposition: fixture.runtimeCompositionFixture.composition,
});

test("ready handoff is wrapped and delegated to facade exactly once", async () => {
  const fixture =
    createDeterministicLocatorMaterializationRuntimeBindingFixture(decision);
  const source = bindingInput(fixture);
  const result = await fixture.binding.bind(source);

  assert.equal(result.status, "completed");
  assert.equal(
    result.status === "completed" && result.facadeResult.status,
    "completed",
  );
  assert.equal(
    fixture.runtimeCompositionFixture.strategyFixture.invocations().length,
    1,
  );
  const providerInput =
    fixture.runtimeCompositionFixture.strategyFixture.invocations()[0];
  assert.equal(providerInput.providerInputVersion, "1.0");
  assert.deepEqual(providerInput.handoffResult, source.handoffResult);
  assert.notEqual(providerInput.handoffResult, source.handoffResult);
});

test("invalid input, version, handoff, and runtime short-circuit facade", async () => {
  const fixture =
    createDeterministicLocatorMaterializationRuntimeBindingFixture(decision);
  const cases = [
    [null, "invalid-binding-input"],
    [{ ...bindingInput(fixture), bindingInputVersion: "9.0" }, "unsupported-binding-version"],
    [{ bindingInputVersion: "1.0" }, "missing-handoff"],
    [{
      ...bindingInput(fixture),
      handoffResult: {
        resultVersion: "1.0",
        status: "rejected",
        failure: "invalid-handoff-input",
      },
    }, "handoff-not-ready"],
    [{
      bindingInputVersion: "1.0",
      handoffResult: readyHandoff(),
    }, "missing-runtime-composition"],
    [{
      bindingInputVersion: "1.0",
      handoffResult: readyHandoff(),
      runtimeComposition: {},
    }, "missing-runtime-facade"],
  ] as const;

  for (const [input, failure] of cases) {
    const result = await fixture.binding.bind(input);
    assert.equal(result.status === "rejected" && result.failure, failure);
  }
  assert.equal(
    fixture.runtimeCompositionFixture.strategyFixture.invocations().length,
    0,
  );
});

test("facade failure is preserved without binding reclassification", async () => {
  const failedDecision = {
    ...decision,
    classification: "failed",
    reasonCode: "copy-failed",
    materializedArtifactAvailable: false,
    materializedArtifact: undefined,
    retryClassification: "retry-external-policy",
  } as const;
  const fixture =
    createDeterministicLocatorMaterializationRuntimeBindingFixture(
      failedDecision,
    );
  const result = await fixture.binding.bind(bindingInput(fixture));

  assert.equal(result.status, "completed");
  assert.equal(
    result.status === "completed" && result.facadeResult.status,
    "failed",
  );
  assert.equal(
    result.status === "completed" &&
      result.facadeResult.status === "failed" &&
      result.facadeResult.providerDecision?.reasonCode,
    "copy-failed",
  );
});

test("facade exception is safely contained after exactly one invocation", async () => {
  let invocations = 0;
  const binding = createLocatorMaterializationRuntimeBinding();
  const result = await binding.bind({
    bindingInputVersion: "1.0",
    handoffResult: readyHandoff(),
    runtimeComposition: {
      facade: {
        async invoke() {
          invocations += 1;
          throw new Error("sensitive runtime detail");
        },
      },
    },
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.status === "rejected" && result.failure, "facade-exception");
  assert.equal(invocations, 1);
  assert.doesNotMatch(JSON.stringify(result), /sensitive runtime detail/);
});

test("binding result and nested projections are immutable and isolated", async () => {
  const first =
    createDeterministicLocatorMaterializationRuntimeBindingFixture(decision);
  const second =
    createDeterministicLocatorMaterializationRuntimeBindingFixture(decision);
  const source = bindingInput(first);
  const firstResult = await first.binding.bind(source);
  const secondResult = await second.binding.bind(bindingInput(second));

  assert.deepEqual(firstResult, secondResult);
  assert.notEqual(firstResult, secondResult);
  assert.equal(Object.isFrozen(firstResult), true);
  assert.equal(
    firstResult.status === "completed" &&
      Object.isFrozen(firstResult.handoffResult),
    true,
  );
  assert.equal(
    firstResult.status === "completed" &&
      Object.isFrozen(firstResult.facadeResult),
    true,
  );
  assert.notEqual(
    firstResult.status === "completed" && firstResult.handoffResult,
    source.handoffResult,
  );
});
