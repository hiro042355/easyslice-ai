import assert from "node:assert/strict";
import test from "node:test";
import { ReferenceWorkflowRegistry, validateWorkflowDefinition } from "../../lib/workflows/referenceWorkflowRegistry";
import type { WorkflowDefinition } from "../../lib/workflows/types";

const definition = (workflowId: string, workflowVersion: string): WorkflowDefinition => ({
  contractVersion: "1.0",
  identity: { workflowId, workflowVersion },
  stages: [
    {
      identity: { workflow: { workflowId, workflowVersion }, stageId: "prepare", stageVersion: "1.0" },
      order: 0,
      requirement: "required",
      terminal: false,
      pipeline: {
        referenceVersion: "1.0",
        pipelineId: "prepare-pipeline",
        pipelineVersion: "1.0",
        operationId: "prepare-operation",
        operationVersion: "1.0",
        bindingId: "prepare-binding",
        bindingVersion: "1.0",
      },
    },
    {
      identity: { workflow: { workflowId, workflowVersion }, stageId: "complete", stageVersion: "1.0" },
      order: 1,
      requirement: "required",
      terminal: true,
      pipeline: {
        referenceVersion: "1.0",
        pipelineId: "complete-pipeline",
        pipelineVersion: "1.0",
        operationId: "complete-operation",
        operationVersion: "1.0",
        bindingId: "complete-binding",
        bindingVersion: "1.0",
      },
    },
  ],
  dependencies: [{ predecessorStageId: "prepare", successorStageId: "complete" }],
});

test("registers a valid workflow definition", () => {
  const registry = new ReferenceWorkflowRegistry();
  const result = registry.register(definition("workflow-a", "1.0"));
  assert.equal(result.status, "registered");
  assert.equal(registry.snapshot().definitions.length, 1);
});

test("rejects duplicate identity and version registration", () => {
  const registry = new ReferenceWorkflowRegistry();
  registry.register(definition("workflow-a", "1.0"));
  const duplicate = registry.register(definition("workflow-a", "1.0"));
  assert.deepEqual(duplicate, { status: "duplicate", identity: { workflowId: "workflow-a", workflowVersion: "1.0" } });
  assert.equal(registry.snapshot().definitions.length, 1);
});

test("looks up exact workflow identity and version", () => {
  const registry = new ReferenceWorkflowRegistry();
  registry.register(definition("workflow-a", "1.0"));
  registry.register(definition("workflow-a", "2.0"));
  assert.equal(registry.getByIdentity({ workflowId: "workflow-a", workflowVersion: "1.0" })?.identity.workflowVersion, "1.0");
  assert.equal(registry.getVersion("workflow-a", "2.0")?.identity.workflowVersion, "2.0");
});

test("returns undefined for unknown workflow lookup", () => {
  const registry = new ReferenceWorkflowRegistry();
  assert.equal(registry.getByIdentity({ workflowId: "missing", workflowVersion: "1.0" }), undefined);
  assert.equal(registry.getVersion("missing", "1.0"), undefined);
});

test("enumerates definitions deterministically", () => {
  const registry = new ReferenceWorkflowRegistry();
  registry.register(definition("workflow-z", "1.0"));
  registry.register(definition("workflow-a", "2.0"));
  registry.register(definition("workflow-a", "1.0"));
  assert.deepEqual(
    registry.snapshot().definitions.map((value) => `${value.identity.workflowId}@${value.identity.workflowVersion}`),
    ["workflow-a@1.0", "workflow-a@2.0", "workflow-z@1.0"],
  );
});

test("returns deeply frozen isolated snapshots", () => {
  const registry = new ReferenceWorkflowRegistry();
  const source = definition("workflow-a", "1.0");
  registry.register(source);
  const first = registry.snapshot();
  const second = registry.snapshot();
  assert.notEqual(first, second);
  assert.notEqual(first.definitions, second.definitions);
  assert.notEqual(first.definitions[0], second.definitions[0]);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.definitions[0]?.stages[0]?.pipeline), true);
  assert.throws(() => ((first.definitions[0] as { identity: { workflowId: string } }).identity.workflowId = "changed"), TypeError);
  assert.equal(registry.getVersion("workflow-a", "1.0")?.identity.workflowId, "workflow-a");
});

test("rejects invalid definitions with deterministic issues", () => {
  const invalid = definition("workflow-a", "1.0");
  const malformed = {
    ...invalid,
    stages: [invalid.stages[0], { ...invalid.stages[0] }],
    dependencies: [{ predecessorStageId: "prepare", successorStageId: "missing" }],
  } as WorkflowDefinition;
  const validation = validateWorkflowDefinition(malformed);
  assert.equal(validation.status, "invalid");
  if (validation.status === "invalid") {
    assert.deepEqual(validation.issues.map((value) => value.sequence), validation.issues.map((_, index) => index));
    assert.equal(validation.issues.some((value) => value.reasonCode === "duplicate-stage"), true);
    assert.equal(validation.issues.some((value) => value.reasonCode === "invalid-dependency"), true);
  }
  const registry = new ReferenceWorkflowRegistry();
  assert.equal(registry.register(malformed).status, "invalid");
  assert.equal(registry.snapshot().definitions.length, 0);
});

test("projects allowlisted secret-free definition fields only", () => {
  const registry = new ReferenceWorkflowRegistry();
  const raw = { ...definition("workflow-a", "1.0"), credential: "must-not-project" };
  registry.register(raw);
  const projected = registry.snapshot().definitions[0] as WorkflowDefinition & { credential?: string };
  assert.equal(projected.credential, undefined);
});
