import assert from "node:assert/strict";
import test from "node:test";
import {
  createOperationBindingFoundation,
  listOperationBindingEdges,
  type OperationBindingEdge,
} from "../../lib/operationPipelines/operationBindings";
import type { OperationPipelineDefinition } from "../../lib/operationPipelines/types";

const pipeline = (dependencies = [
  { predecessorStageId: "prepare", successorStageId: "generate" },
  { predecessorStageId: "generate", successorStageId: "complete" },
]): OperationPipelineDefinition => ({
  contractVersion: "1.0",
  pipelineId: "reference-operation-pipeline",
  pipelineVersion: "1.0",
  operation: { operationId: "reference-operation", operationVersion: "1.0" },
  stages: [
    { stageId: "prepare", stageVersion: "1.0", order: 0, terminal: false },
    { stageId: "generate", stageVersion: "1.0", order: 1, terminal: false },
    { stageId: "complete", stageVersion: "1.0", order: 2, terminal: true },
  ],
  dependencies,
});

const edge = (bindingId: string, from: string, to: string, order: number): OperationBindingEdge => ({
  bindingVersion: "1.0",
  bindingId,
  order,
  predecessorStageId: from,
  successorStageId: to,
  mappings: [{
    mappingVersion: "1.0",
    source: { kind: "operation-output", path: ["result"] },
    target: { kind: "operation-input", path: ["input"] },
    required: true,
  }],
  cancellation: "propagate",
  retryRecommendation: "propagate",
});

test("creates deterministic bindings and preserves propagation markers", () => {
  const result = createOperationBindingFoundation(pipeline(), [
    edge("second", "generate", "complete", 2),
    edge("first", "prepare", "generate", 1),
  ]);
  assert.equal(result.status, "created");
  if (result.status !== "created") return;
  assert.deepEqual(result.foundation.edges.map((value) => value.bindingId), ["first", "second"]);
  assert.equal(result.foundation.edges.every((value) => value.cancellation === "propagate"), true);
  assert.equal(result.foundation.edges.every((value) => value.retryRecommendation === "propagate"), true);
});

test("returns deeply frozen isolated projections", () => {
  const candidate = edge("first", "prepare", "generate", 1);
  const result = createOperationBindingFoundation(
    pipeline([{ predecessorStageId: "prepare", successorStageId: "generate" }]),
    [candidate],
  );
  assert.equal(result.status, "created");
  if (result.status !== "created") return;
  const listed = listOperationBindingEdges(result.foundation);
  assert.notEqual(listed, result.foundation.edges);
  assert.notEqual(listed[0], result.foundation.edges[0]);
  assert.equal(Object.isFrozen(listed), true);
  assert.equal(Object.isFrozen(listed[0]?.mappings[0]?.source.path), true);
  assert.throws(() => ((listed[0] as { bindingId: string }).bindingId = "changed"), TypeError);
  assert.equal(result.foundation.edges[0]?.bindingId, "first");
});

test("rejects a missing dependency", () => {
  const result = createOperationBindingFoundation(pipeline(), [edge("first", "prepare", "generate", 1)]);
  assert.equal(result.status, "invalid");
  if (result.status === "invalid") assert.equal(result.issues.some((issue) => issue.reasonCode === "missing-dependency"), true);
});

test("rejects duplicate edges", () => {
  const result = createOperationBindingFoundation(
    pipeline([{ predecessorStageId: "prepare", successorStageId: "generate" }]),
    [edge("first", "prepare", "generate", 1), edge("duplicate", "prepare", "generate", 2)],
  );
  assert.equal(result.status, "invalid");
  if (result.status === "invalid") assert.equal(result.issues.some((issue) => issue.reasonCode === "duplicate-edge"), true);
});

test("rejects dependency cycles", () => {
  const cyclic = pipeline([
    { predecessorStageId: "prepare", successorStageId: "generate" },
    { predecessorStageId: "generate", successorStageId: "prepare" },
  ]);
  const result = createOperationBindingFoundation(cyclic, [
    edge("forward", "prepare", "generate", 1),
    edge("back", "generate", "prepare", 2),
  ]);
  assert.equal(result.status, "invalid");
  if (result.status === "invalid") assert.equal(result.issues.some((issue) => issue.reasonCode === "dependency-cycle"), true);
});
