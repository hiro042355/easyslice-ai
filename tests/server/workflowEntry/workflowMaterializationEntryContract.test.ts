import assert from "node:assert/strict";
import test from "node:test";

import {
  isWorkflowMaterializationEntryInput,
  isWorkflowMaterializationEntryResult,
} from "../../../lib/server/workflowEntry/workflowMaterializationEntryContract";
import {
  createReferenceAuthorityShortCircuitResultFixture,
  createReferenceHandoffNonReadyResultFixture,
  createReferenceMaterializationExecutedResultFixture,
  createReferenceWorkflowMaterializationEntryInputFixture,
} from "../../../lib/server/workflowEntry/referenceWorkflowMaterializationEntryContractFixtures";

test("input fixture exposes the versioned existing inputs without mapping", () => {
  const input = createReferenceWorkflowMaterializationEntryInputFixture();

  assert.equal(input.workflowMaterializationEntryInputVersion, "1.0");
  assert.equal(isWorkflowMaterializationEntryInput(input), true);
  assert.equal(Object.isFrozen(input), true);
  assert.equal(Object.isFrozen(input.authorityLocatorBindingInput), true);
  assert.equal(Object.isFrozen(input.materializationRequest), true);
  assert.equal(Object.isFrozen(input.materializationExecutionContext), true);
});

test("authority short circuit omits all unexecuted stages", () => {
  const result = createReferenceAuthorityShortCircuitResultFixture();

  assert.equal(result.workflowMaterializationEntryResultVersion, "1.0");
  assert.equal(isWorkflowMaterializationEntryResult(result), true);
  assert.equal(result.authorityLocatorBindingResult.status, "failed");
  assert.equal(result.handoffResult, undefined);
  assert.equal(result.materializationRuntimeBindingResult, undefined);
});

test("handoff non-ready preserves handoff and omits materialization", () => {
  const result = createReferenceHandoffNonReadyResultFixture();

  assert.equal(result.authorityLocatorBindingResult.status, "completed");
  assert.equal(result.handoffResult?.status, "rejected");
  assert.equal(result.materializationRuntimeBindingResult, undefined);
});

test("materialization execution preserves decision and nested audit", () => {
  const result = createReferenceMaterializationExecutedResultFixture();
  const runtime = result.materializationRuntimeBindingResult;

  assert.equal(runtime?.status, "completed");
  assert.equal(
    runtime?.status === "completed" && runtime.facadeResult.status,
    "completed",
  );
  assert.equal(
    runtime?.status === "completed" &&
      runtime.facadeResult.status === "completed" &&
      runtime.facadeResult.providerDecision.reasonCode,
    "materialization-completed",
  );
  assert.equal(
    runtime?.status === "completed" &&
      runtime.facadeResult.status === "completed" &&
      Object.isFrozen(runtime.facadeResult.providerDecision.audit.entries[0]),
    true,
  );
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(runtime), true);
});

test("fixtures are copy-isolated and share no mutable state", () => {
  const firstInput = createReferenceWorkflowMaterializationEntryInputFixture();
  const secondInput = createReferenceWorkflowMaterializationEntryInputFixture();
  const firstResult = createReferenceMaterializationExecutedResultFixture();
  const secondResult = createReferenceMaterializationExecutedResultFixture();

  assert.deepEqual(firstInput, secondInput);
  assert.notEqual(firstInput, secondInput);
  assert.notEqual(
    firstInput.materializationRequest,
    secondInput.materializationRequest,
  );
  assert.deepEqual(firstResult, secondResult);
  assert.notEqual(firstResult, secondResult);
  assert.notEqual(
    firstResult.materializationRuntimeBindingResult,
    secondResult.materializationRuntimeBindingResult,
  );
});
