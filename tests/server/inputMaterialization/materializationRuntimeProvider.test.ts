import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeterministicMaterializationRuntimeProviderFixture,
} from "../../../lib/server/inputMaterialization/referenceDeterministicMaterializationRuntimeProviderFixture";
import {
  createMaterializationRuntimeProviderInputValidation,
} from "../../../lib/server/inputMaterialization/materializationRuntimeProviderValidation";

const readyHandoff = () => ({
  resultVersion: "1.0",
  status: "ready",
  authorityLocatorBindingResult: {
    resultVersion: "1.0",
    status: "completed",
  },
  locatorResult: {
    resultVersion: "2.0",
    status: "authorized",
    opaqueResolutionReference: "resolution:1",
  },
  workflowMaterializationRequest: {
    version: "2.0",
    materializationRequest: {},
    sourceResolutionContext: {},
  },
  executionContext: {
    contextVersion: "1.0",
    executionWorkspaceReference: "workspace:1",
    executionOperationIdentity: "operation:1",
  },
});

const providerInput = () => ({
  providerInputVersion: "1.0",
  handoffResult: readyHandoff(),
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
    entries: [],
  },
} as const;

test("validation accepts and isolates a completed handoff provider input", () => {
  const source = providerInput();
  const result = createMaterializationRuntimeProviderInputValidation()
    .validateProviderInput(source);

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;
  assert.deepEqual(result.input, source);
  assert.notEqual(result.input, source);
  assert.notEqual(result.input.handoffResult, source.handoffResult);
  assert.equal(Object.isFrozen(result.input.handoffResult), true);
  assert.equal(Object.isFrozen(result.input.handoffResult.executionContext), true);
});

test("validation classifies version, handoff, request, and context failures", () => {
  const validate = createMaterializationRuntimeProviderInputValidation()
    .validateProviderInput;
  const cases: readonly [unknown, string][] = [
    [{ ...providerInput(), providerInputVersion: "9.0" }, "unsupported-provider-version"],
    [{ providerInputVersion: "1.0" }, "missing-handoff"],
    [{
      providerInputVersion: "1.0",
      handoffResult: { resultVersion: "1.0", status: "rejected" },
    }, "handoff-not-completed"],
    [{
      ...providerInput(),
      handoffResult: {
        ...readyHandoff(),
        workflowMaterializationRequest: undefined,
      },
    }, "missing-materialization-request"],
    [{
      ...providerInput(),
      handoffResult: { ...readyHandoff(), executionContext: undefined },
    }, "missing-execution-context"],
    [null, "invalid-provider-input"],
  ];

  for (const [input, failure] of cases) {
    const result = validate(input);
    assert.deepEqual(result.status === "rejected" && result.failure, failure);
  }
});

test("fixture returns deterministic copied decisions and captures isolated inputs", () => {
  const fixture = createDeterministicMaterializationRuntimeProviderFixture(decision);
  const source = providerInput() as never;
  const first = fixture.provider.materialize(source);
  const second = fixture.provider.materialize(source);

  assert.deepEqual(first, decision);
  assert.deepEqual(second, decision);
  assert.notEqual(first, decision);
  assert.equal(fixture.invocations().length, 2);
  assert.notEqual(fixture.invocations()[0], source);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(
    Object.isFrozen((first as typeof decision).audit),
    true,
  );
});

test("fixture can deterministically expose provider exception behavior", () => {
  const fixture = createDeterministicMaterializationRuntimeProviderFixture(
    decision,
    { throwOnInvocation: true },
  );
  assert.throws(
    () => fixture.provider.materialize(providerInput() as never),
    /deterministic materialization provider failure/,
  );
  assert.equal(fixture.invocations().length, 1);
});
