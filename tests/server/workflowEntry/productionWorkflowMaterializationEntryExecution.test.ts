import assert from "node:assert/strict";
import test from "node:test";

import {
  createReferenceProductionWorkflowMaterializationEntryExecution,
} from "../../../lib/server/workflowEntry/referenceProductionWorkflowMaterializationEntryExecution";
import {
  createReferenceAuthorityShortCircuitResultFixture,
  createReferenceHandoffNonReadyResultFixture,
  createReferenceMaterializationExecutedResultFixture,
  createReferenceWorkflowMaterializationEntryInputFixture,
} from "../../../lib/server/workflowEntry/referenceWorkflowMaterializationEntryContractFixtures";
import type {
  LocatorMaterializationRuntimeBindingResult,
} from "../../../lib/server/locatorMaterializationRuntimeBinding/types";

test("execution preserves success input and result identities exactly once", async () => {
  const input = createReferenceWorkflowMaterializationEntryInputFixture();
  const configuredResult =
    createReferenceMaterializationExecutedResultFixture();
  const fixture =
    createReferenceProductionWorkflowMaterializationEntryExecution(
      configuredResult,
    );
  const result = await fixture.execution.execute(input);

  assert.equal(fixture.invocationCount(), 1);
  assert.deepEqual(fixture.invocationOrder(), [
    "workflow-materialization-entry-integration",
  ]);
  assert.equal(fixture.receivedInputs()[0], input);
  assert.equal(result, configuredResult);
  assert.equal(
    result.materializationRuntimeBindingResult,
    configuredResult.materializationRuntimeBindingResult,
  );
});

test("authority short-circuit result is returned unchanged", async () => {
  const configuredResult =
    createReferenceAuthorityShortCircuitResultFixture();
  const fixture =
    createReferenceProductionWorkflowMaterializationEntryExecution(
      configuredResult,
    );
  const result = await fixture.execution.execute(
    createReferenceWorkflowMaterializationEntryInputFixture(),
  );

  assert.equal(result, configuredResult);
  assert.equal(result.handoffResult, undefined);
  assert.equal(result.materializationRuntimeBindingResult, undefined);
});

test("handoff non-ready result is returned unchanged", async () => {
  const configuredResult =
    createReferenceHandoffNonReadyResultFixture();
  const fixture =
    createReferenceProductionWorkflowMaterializationEntryExecution(
      configuredResult,
    );
  const result = await fixture.execution.execute(
    createReferenceWorkflowMaterializationEntryInputFixture(),
  );

  assert.equal(result, configuredResult);
  assert.equal(result.handoffResult, configuredResult.handoffResult);
  assert.equal(result.materializationRuntimeBindingResult, undefined);
});

test("materialization failure, decision, and audit are not projected", async () => {
  const executed = createReferenceMaterializationExecutedResultFixture();
  const failedBinding = Object.freeze({
    resultVersion: "1.0",
    status: "rejected",
    stage: "runtime",
    failure: "facade-exception",
    handoffResult: executed.handoffResult,
    facadeResult:
      executed.materializationRuntimeBindingResult?.status === "completed"
        ? executed.materializationRuntimeBindingResult.facadeResult
        : undefined,
  }) satisfies LocatorMaterializationRuntimeBindingResult;
  const configuredResult = Object.freeze({
    workflowMaterializationEntryResultVersion: "1.0",
    authorityLocatorBindingResult:
      executed.authorityLocatorBindingResult,
    handoffResult: executed.handoffResult,
    materializationRuntimeBindingResult: failedBinding,
  });
  const fixture =
    createReferenceProductionWorkflowMaterializationEntryExecution(
      configuredResult,
    );
  const result = await fixture.execution.execute(
    createReferenceWorkflowMaterializationEntryInputFixture(),
  );

  assert.equal(result, configuredResult);
  assert.equal(result.materializationRuntimeBindingResult, failedBinding);
  assert.equal(
    result.materializationRuntimeBindingResult?.facadeResult,
    failedBinding.facadeResult,
  );
});

test("integration exceptions propagate without execution containment", async () => {
  const configuredResult =
    createReferenceAuthorityShortCircuitResultFixture();
  const error = new Error("deterministic integration exception");
  const fixture =
    createReferenceProductionWorkflowMaterializationEntryExecution(
      configuredResult,
      error,
    );

  await assert.rejects(
    async () => fixture.execution.execute(
      createReferenceWorkflowMaterializationEntryInputFixture(),
    ),
    (received) => received === error,
  );
  assert.equal(fixture.invocationCount(), 1);
});

test("execution factories and invocation state remain isolated", async () => {
  const configuredResult =
    createReferenceMaterializationExecutedResultFixture();
  const first =
    createReferenceProductionWorkflowMaterializationEntryExecution(
      configuredResult,
    );
  const second =
    createReferenceProductionWorkflowMaterializationEntryExecution(
      configuredResult,
    );

  await first.execution.execute(
    createReferenceWorkflowMaterializationEntryInputFixture(),
  );
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.execution), true);
  assert.equal(
    Object.isFrozen(
      first.productionWorkflowMaterializationEntryComposition,
    ),
    true,
  );
  assert.notEqual(first, second);
  assert.notEqual(first.execution, second.execution);
  assert.equal(first.invocationCount(), 1);
  assert.equal(second.invocationCount(), 0);
});
