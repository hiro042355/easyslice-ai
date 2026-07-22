import assert from "node:assert/strict";
import test from "node:test";
import type { OperationBindingEdge } from "../../lib/operationPipelines/operationBindings";
import {
  ReferenceOperationPipeline,
  type ReferenceOperation,
  type ReferenceOperationCancellation,
  type ReferenceOperationResult,
} from "../../lib/operationPipelines/referenceOperationPipeline";
import type {
  OperationPipelineDefinition,
  OperationPipelineInput,
  OperationPipelineRetryRecommendation,
} from "../../lib/operationPipelines/types";

const definition: OperationPipelineDefinition = {
  contractVersion: "1.0",
  pipelineId: "reference-pipeline",
  pipelineVersion: "1.0",
  operation: { operationId: "reference-operation", operationVersion: "1.0" },
  stages: [
    { stageId: "prepare", stageVersion: "1.0", order: 0, terminal: false },
    { stageId: "optional", stageVersion: "1.0", order: 1, terminal: false },
    { stageId: "complete", stageVersion: "1.0", order: 2, terminal: true },
  ],
  dependencies: [
    { predecessorStageId: "prepare", successorStageId: "optional" },
    { predecessorStageId: "optional", successorStageId: "complete" },
  ],
};

const binding = (id: string, from: string, to: string, order: number): OperationBindingEdge => ({
  bindingVersion: "1.0",
  bindingId: id,
  order,
  predecessorStageId: from,
  successorStageId: to,
  mappings: [{
    mappingVersion: "1.0",
    source: { kind: "operation-output", path: ["result"] },
    target: { kind: "operation-input", path: ["value"] },
    required: true,
  }],
  cancellation: "propagate",
  retryRecommendation: "propagate",
});

const bindings = [binding("prepare-optional", "prepare", "optional", 0), binding("optional-complete", "optional", "complete", 1)];
const input: OperationPipelineInput<Readonly<{ seed: string }>> = {
  inputVersion: "1.0",
  operation: definition.operation,
  initialStageId: "prepare",
  payload: { seed: "safe-seed" },
  context: {
    contextVersion: "1.0",
    operationRef: "safe-operation-ref",
    attempt: 1,
    baselineTime: "2026-01-01T00:00:00.000Z",
    cancellation: { status: "active" },
  },
};

const noCancellation: ReferenceOperationCancellation = { check: () => false };
const noRetry: OperationPipelineRetryRecommendation = { recommendation: "do-not-retry" };

const completed = (
  result: string,
  retry: OperationPipelineRetryRecommendation = noRetry,
): ReferenceOperationResult => ({
  status: "completed",
  output: { result },
  retry,
  reasonCodes: [`${result}-completed`],
});

const operation = (
  stageId: string,
  requirement: "required" | "optional",
  run: ReferenceOperation["execute"],
): ReferenceOperation => ({ stageId, requirement, execute: run });

const createRuntime = (
  operations: readonly ReferenceOperation[],
  cancellation: ReferenceOperationCancellation = noCancellation,
) => new ReferenceOperationPipeline({ definition, bindingEdges: bindings, operations, cancellation });

test("executes stages deterministically and maps operation output to input", async () => {
  const calls: string[] = [];
  const runtime = createRuntime([
    operation("complete", "required", async ({ value }) => { calls.push(`complete:${String(value.value)}`); return completed("done"); }),
    operation("prepare", "required", async ({ value }) => { calls.push(`prepare:${String(value.seed)}`); return completed("prepared"); }),
    operation("optional", "optional", async ({ value }) => { calls.push(`optional:${String(value.value)}`); return completed("enriched"); }),
  ]);
  const result = await runtime.execute(input);
  assert.equal(result.status, "completed");
  assert.deepEqual(calls, ["prepare:safe-seed", "optional:prepared", "complete:enriched"]);
  if (result.status === "completed") {
    assert.equal(result.output.payload.status, "completed");
    assert.deepEqual(result.output.audit.visitedStageIds, ["prepare", "optional", "complete"]);
    assert.equal(result.output.audit.transitionCount, 2);
  }
});

test("returns an immutable isolated execution snapshot", async () => {
  const runtime = createRuntime([
    operation("prepare", "required", async () => completed("prepared")),
    operation("optional", "optional", async () => completed("enriched")),
    operation("complete", "required", async () => completed("done")),
  ]);
  const result = await runtime.execute(input);
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.output.payload.stageOutputs), true);
  assert.equal(Object.isFrozen(result.output.payload.stageOutputs[0]?.output), true);
  assert.throws(() => ((result.output.payload.stageOutputs[0] as { stageId: string }).stageId = "changed"), TypeError);
  assert.equal(result.output.payload.stageOutputs[0]?.stageId, "prepare");
});

test("stops on a required operation failure", async () => {
  const calls: string[] = [];
  const runtime = createRuntime([
    operation("prepare", "required", async () => completed("prepared")),
    operation("optional", "required", async () => ({ status: "failed", retry: { recommendation: "retry", retryClass: "transient" }, reasonCodes: ["required-failed"] })),
    operation("complete", "required", async () => { calls.push("complete"); return completed("done"); }),
  ]);
  const result = await runtime.execute(input);
  assert.equal(result.status, "failed");
  assert.deepEqual(calls, []);
  if (result.status === "failed") assert.equal(result.retry.recommendation, "retry");
});

test("continues after an optional failure and projects degraded status", async () => {
  const runtime = createRuntime([
    operation("prepare", "required", async () => completed("prepared")),
    operation("optional", "optional", async () => ({ status: "failed", retry: noRetry, reasonCodes: ["optional-failed"] })),
    operation("complete", "required", async () => completed("done")),
  ]);
  const result = await runtime.execute(input);
  assert.equal(result.status, "completed");
  if (result.status === "completed") {
    assert.equal(result.output.payload.status, "degraded");
    assert.deepEqual(result.output.payload.optionalFailureStageIds, ["optional"]);
  }
});

for (const scenario of ["before-pipeline", "before-operation", "after-operation"] as const) {
  test(`propagates cancellation ${scenario}`, async () => {
    const calls: string[] = [];
    const cancellation: ReferenceOperationCancellation = {
      check: ({ point, stageId }) => point === scenario && (scenario === "before-pipeline" || stageId === "prepare"),
    };
    const runtime = createRuntime([
      operation("prepare", "required", async () => { calls.push("prepare"); return completed("prepared"); }),
      operation("optional", "optional", async () => completed("enriched")),
      operation("complete", "required", async () => completed("done")),
    ], cancellation);
    const result = await runtime.execute(input);
    assert.equal(result.status, "cancelled");
    assert.deepEqual(calls, scenario === "after-operation" ? ["prepare"] : []);
  });
}

test("aggregates retry recommendations without retrying operations", async () => {
  const counts = new Map<string, number>();
  const count = (stage: string) => counts.set(stage, (counts.get(stage) ?? 0) + 1);
  const runtime = createRuntime([
    operation("prepare", "required", async () => { count("prepare"); return completed("prepared", { recommendation: "retry", retryClass: "transient" }); }),
    operation("optional", "optional", async () => { count("optional"); return completed("enriched", { recommendation: "wait", retryClass: "external-state" }); }),
    operation("complete", "required", async () => { count("complete"); return completed("done", { recommendation: "reconcile", retryClass: "outcome-unknown" }); }),
  ]);
  const result = await runtime.execute(input);
  assert.equal(result.status, "completed");
  if (result.status === "completed") assert.equal(result.output.retry.recommendation, "reconcile");
  assert.deepEqual(Object.fromEntries(counts), { prepare: 1, optional: 1, complete: 1 });
});

test("rejects invalid bindings before invoking operations", async () => {
  let called = false;
  const runtime = new ReferenceOperationPipeline({
    definition,
    bindingEdges: bindings.slice(0, 1),
    operations: [operation("prepare", "required", async () => { called = true; return completed("prepared"); })],
    cancellation: noCancellation,
  });
  const result = await runtime.execute(input);
  assert.equal(result.status, "failed");
  assert.equal(called, false);
  assert.deepEqual(result.audit.reasonCodes, ["operation-binding-invalid"]);
});
