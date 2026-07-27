import assert from "node:assert/strict";
import test from "node:test";

import {
  createReferenceProductionWorkflowMaterializationEntryComposition,
} from "../../../lib/server/workflowEntry/referenceProductionWorkflowMaterializationEntryComposition";

test("composition creates and wires every existing foundation", () => {
  const fixture =
    createReferenceProductionWorkflowMaterializationEntryComposition();
  const composition = fixture.composition;

  assert.equal(
    typeof composition.authorityLocatorRuntimeComposition.authority.facade
      .evaluate,
    "function",
  );
  assert.equal(
    typeof composition.authorityLocatorRuntimeComposition.locator.facade
      .invoke,
    "function",
  );
  assert.equal(typeof composition.authorityLocatorBinding.execute, "function");
  assert.equal(typeof composition.handoff.prepare, "function");
  assert.equal(
    typeof composition.materializationRuntimeComposition.facade.invoke,
    "function",
  );
  assert.equal(typeof composition.materializationBinding.bind, "function");
  assert.equal(typeof composition.integration.execute, "function");
  assert.equal(fixture.runtimeInvocations(), 0);
});

test("composition and every exposed dependency are immutable", () => {
  const fixture =
    createReferenceProductionWorkflowMaterializationEntryComposition();
  const composition = fixture.composition;

  assert.equal(Object.isFrozen(fixture), true);
  assert.equal(Object.isFrozen(composition), true);
  assert.equal(
    Object.isFrozen(composition.authorityLocatorRuntimeComposition),
    true,
  );
  assert.equal(Object.isFrozen(composition.authorityLocatorBinding), true);
  assert.equal(Object.isFrozen(composition.handoff), true);
  assert.equal(
    Object.isFrozen(composition.materializationRuntimeComposition),
    true,
  );
  assert.equal(Object.isFrozen(composition.materializationBinding), true);
  assert.equal(Object.isFrozen(composition.integration), true);
});

test("each factory call creates an isolated composition without execution", () => {
  const first =
    createReferenceProductionWorkflowMaterializationEntryComposition();
  const second =
    createReferenceProductionWorkflowMaterializationEntryComposition();

  assert.notEqual(first, second);
  assert.notEqual(first.composition, second.composition);
  assert.notEqual(
    first.composition.authorityLocatorRuntimeComposition,
    second.composition.authorityLocatorRuntimeComposition,
  );
  assert.notEqual(
    first.composition.materializationRuntimeComposition,
    second.composition.materializationRuntimeComposition,
  );
  assert.notEqual(
    first.composition.integration,
    second.composition.integration,
  );
  assert.equal(first.runtimeInvocations(), 0);
  assert.equal(second.runtimeInvocations(), 0);
  assert.deepEqual(first.constructionOrder(), second.constructionOrder());
});
