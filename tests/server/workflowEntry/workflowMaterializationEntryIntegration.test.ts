import assert from "node:assert/strict";
import test from "node:test";

import {
  createReferenceWorkflowMaterializationEntryIntegrationFixture,
} from "../../../lib/server/workflowEntry/referenceWorkflowMaterializationEntryIntegration";
import {
  createReferenceAuthorityShortCircuitResultFixture,
  createReferenceHandoffNonReadyResultFixture,
  createReferenceMaterializationExecutedResultFixture,
  createReferenceWorkflowMaterializationEntryInputFixture,
} from "../../../lib/server/workflowEntry/referenceWorkflowMaterializationEntryContractFixtures";
import type {
  MaterializationRuntimeComposition,
} from "../../../lib/server/inputMaterialization/materializationRuntimeCompositionTypes";
import type {
  LocatorMaterializationRuntimeBindingResult,
} from "../../../lib/server/locatorMaterializationRuntimeBinding/types";

const runtimeComposition = (): MaterializationRuntimeComposition =>
  Object.freeze({
    facade: Object.freeze({}) as never,
    provider: Object.freeze({}) as never,
    validation: Object.freeze({}) as never,
  });

test("success invokes authority, locator, handoff, and materialization once", async () => {
  const executed = createReferenceMaterializationExecutedResultFixture();
  const fixture = createReferenceWorkflowMaterializationEntryIntegrationFixture(
    {
      authorityLocatorBindingResult:
        executed.authorityLocatorBindingResult,
      handoffResult: executed.handoffResult,
      materializationRuntimeBindingResult:
        executed.materializationRuntimeBindingResult,
    },
    runtimeComposition(),
  );
  const input = createReferenceWorkflowMaterializationEntryInputFixture();
  const result = await fixture.execute(input);

  assert.deepEqual(fixture.invocationOrder(), [
    "authority",
    "locator",
    "handoff",
    "materialization",
  ]);
  assert.equal(fixture.authorityInvocations(), 1);
  assert.equal(fixture.locatorInvocations(), 1);
  assert.equal(fixture.handoffInvocations(), 1);
  assert.equal(fixture.materializationBindingInvocations(), 1);
  assert.equal(
    result.materializationRuntimeBindingResult,
    executed.materializationRuntimeBindingResult,
  );
  assert.equal(Object.isFrozen(result), true);
});

test("authority short circuit invokes no later stage", async () => {
  const stopped = createReferenceAuthorityShortCircuitResultFixture();
  const fixture = createReferenceWorkflowMaterializationEntryIntegrationFixture(
    {
      authorityLocatorBindingResult:
        stopped.authorityLocatorBindingResult,
    },
    runtimeComposition(),
  );
  const result = await fixture.execute(
    createReferenceWorkflowMaterializationEntryInputFixture(),
  );

  assert.deepEqual(fixture.invocationOrder(), ["authority"]);
  assert.equal(fixture.locatorInvocations(), 0);
  assert.equal(result.handoffResult, undefined);
  assert.equal(result.materializationRuntimeBindingResult, undefined);
});

test("locator short circuit invokes no handoff or materialization", async () => {
  const fixture = createReferenceWorkflowMaterializationEntryIntegrationFixture(
    {
      authorityLocatorBindingResult: Object.freeze({
        resultVersion: "1.0",
        status: "failed",
        stage: "locator",
      }),
    },
    runtimeComposition(),
  );
  await fixture.execute(
    createReferenceWorkflowMaterializationEntryInputFixture(),
  );

  assert.deepEqual(fixture.invocationOrder(), ["authority", "locator"]);
  assert.equal(fixture.locatorInvocations(), 1);
  assert.equal(fixture.handoffInvocations(), 0);
  assert.equal(fixture.materializationBindingInvocations(), 0);
});

test("non-ready handoff invokes no materialization", async () => {
  const stopped = createReferenceHandoffNonReadyResultFixture();
  const fixture = createReferenceWorkflowMaterializationEntryIntegrationFixture(
    {
      authorityLocatorBindingResult:
        stopped.authorityLocatorBindingResult,
      handoffResult: stopped.handoffResult,
    },
    runtimeComposition(),
  );
  const result = await fixture.execute(
    createReferenceWorkflowMaterializationEntryInputFixture(),
  );

  assert.deepEqual(fixture.invocationOrder(), [
    "authority",
    "locator",
    "handoff",
  ]);
  assert.equal(result.handoffResult, stopped.handoffResult);
  assert.equal(result.materializationRuntimeBindingResult, undefined);
});

test("materialization failure is retained without reclassification", async () => {
  const executed = createReferenceMaterializationExecutedResultFixture();
  const failed = Object.freeze({
    resultVersion: "1.0",
    status: "rejected",
    stage: "runtime",
    failure: "facade-exception",
    handoffResult: executed.handoffResult,
  }) satisfies LocatorMaterializationRuntimeBindingResult;
  const fixture = createReferenceWorkflowMaterializationEntryIntegrationFixture(
    {
      authorityLocatorBindingResult:
        executed.authorityLocatorBindingResult,
      handoffResult: executed.handoffResult,
      materializationRuntimeBindingResult: failed,
    },
    runtimeComposition(),
  );
  const result = await fixture.execute(
    createReferenceWorkflowMaterializationEntryInputFixture(),
  );

  assert.equal(result.materializationRuntimeBindingResult, failed);
  assert.equal(result.materializationRuntimeBindingResult?.status, "rejected");
});

test("input and fixture state remain isolated", async () => {
  const executed = createReferenceMaterializationExecutedResultFixture();
  const scenario = {
    authorityLocatorBindingResult:
      executed.authorityLocatorBindingResult,
    handoffResult: executed.handoffResult,
    materializationRuntimeBindingResult:
      executed.materializationRuntimeBindingResult,
  };
  const first = createReferenceWorkflowMaterializationEntryIntegrationFixture(
    scenario,
    runtimeComposition(),
  );
  const second = createReferenceWorkflowMaterializationEntryIntegrationFixture(
    scenario,
    runtimeComposition(),
  );
  const input = createReferenceWorkflowMaterializationEntryInputFixture();
  const snapshot = JSON.stringify(input);
  const firstResult = await first.execute(input);

  assert.equal(JSON.stringify(input), snapshot);
  assert.equal(first.receivedInputs()[0], input);
  assert.equal(first.authorityInvocations(), 1);
  assert.equal(second.authorityInvocations(), 0);
  assert.equal(Object.isFrozen(firstResult), true);
  assert.equal(
    Object.isFrozen(firstResult.materializationRuntimeBindingResult),
    true,
  );
});
