import assert from "node:assert/strict";
import test from "node:test";
import type { OperationPipelineResult, OperationPipelineRetryRecommendation } from "../../lib/operationPipelines/types";
import {
  ReferenceGenerationWorkflow,
  runReferenceGenerationWorkflow,
  type ReferenceWorkflowCancellation,
  type ReferenceWorkflowPipelineCapability,
} from "../../lib/workflows/referenceGenerationWorkflow";
import type { ReferenceWorkflowInput } from "../../lib/workflows/referenceWorkflowTypes";
import type { ReferenceWorkflowResult, WorkflowDefinition, WorkflowInput, WorkflowPipelineReference } from "../../lib/workflows/types";
import { runReferenceVocalWorkflow } from "../../lib/workflows/referenceVocalWorkflow";
import { runReferenceMusicWorkflow } from "../../lib/workflows/referenceMusicWorkflow";
import { runReferenceMVWorkflow } from "../../lib/workflows/referenceMVWorkflow";
import { createCanonicalMusicWorkflowFixture, createCanonicalMVWorkflowFixture, createCanonicalVocalWorkflowFixture } from "../../lib/workflowFixtures/canonicalWorkflowFixtures";

const workflowIdentity = { workflowId: "reference-workflow", workflowVersion: "1.0" } as const;
const pipelineReference = (stageId: string): WorkflowPipelineReference => ({
  referenceVersion: "1.0",
  pipelineId: `${stageId}-pipeline`,
  pipelineVersion: "1.0",
  operationId: `${stageId}-operation`,
  operationVersion: "1.0",
  bindingId: `${stageId}-binding`,
  bindingVersion: "1.0",
});
const definition: WorkflowDefinition = {
  contractVersion: "1.0",
  identity: workflowIdentity,
  stages: [
    { identity: { workflow: workflowIdentity, stageId: "prepare", stageVersion: "1.0" }, order: 0, requirement: "required", terminal: false, pipeline: pipelineReference("prepare") },
    { identity: { workflow: workflowIdentity, stageId: "enhance", stageVersion: "1.0" }, order: 1, requirement: "optional", terminal: false, pipeline: pipelineReference("enhance") },
    { identity: { workflow: workflowIdentity, stageId: "complete", stageVersion: "1.0" }, order: 2, requirement: "required", terminal: true, pipeline: pipelineReference("complete") },
  ],
  dependencies: [
    { predecessorStageId: "prepare", successorStageId: "enhance" },
    { predecessorStageId: "enhance", successorStageId: "complete" },
  ],
};
const input: WorkflowInput<Readonly<{ seed: string }>> = {
  inputVersion: "1.0",
  workflow: workflowIdentity,
  payload: { seed: "safe-seed" },
  context: {
    contextVersion: "1.0",
    workflowRef: "safe-workflow-ref",
    attempt: 1,
    baselineTime: "2026-01-01T00:00:00.000Z",
    cancellation: { status: "not-requested" },
  },
};
const noCancellation: ReferenceWorkflowCancellation = { check: () => false };
const noRetry: OperationPipelineRetryRecommendation = { recommendation: "do-not-retry" };

const pipelineAudit = (stageId: string) => ({
  auditVersion: "1.0" as const,
  operation: { operationId: `${stageId}-operation`, operationVersion: "1.0" },
  pipelineId: `${stageId}-pipeline`,
  pipelineVersion: "1.0",
  initialStageId: stageId,
  finalStageId: stageId,
  visitedStageIds: [stageId],
  transitionCount: 0,
  reasonCodes: [`${stageId}-complete`],
});
const completed = (
  stageId: string,
  result: string,
  retry: OperationPipelineRetryRecommendation = noRetry,
): OperationPipelineResult<Readonly<{ result: string }>> => ({
  status: "completed",
  output: {
    outputVersion: "1.0",
    operation: { operationId: `${stageId}-operation`, operationVersion: "1.0" },
    finalStageId: stageId,
    payload: { result },
    retry,
    audit: pipelineAudit(stageId),
  },
});
const failed = (
  stageId: string,
  status: "failed" | "cancelled" | "reconciliation-required" = "failed",
  retry: OperationPipelineRetryRecommendation = noRetry,
): OperationPipelineResult<Readonly<{ result: string }>> => ({
  status,
  finalStageId: stageId,
  retry,
  audit: pipelineAudit(stageId),
});

const capability = (
  run: ReferenceWorkflowPipelineCapability["execute"],
): ReferenceWorkflowPipelineCapability => ({ execute: run });

const createWorkflow = (
  handlers: Readonly<Record<string, ReferenceWorkflowPipelineCapability>>,
  cancellation: ReferenceWorkflowCancellation = noCancellation,
) => new ReferenceGenerationWorkflow({
  definition,
  pipelines: { resolve: (reference) => handlers[reference.bindingId] },
  cancellation,
});

test("executes workflows deterministically through declarative pipeline references", async () => {
  const calls: string[] = [];
  const workflow = createWorkflow({
    "complete-binding": capability(async ({ payload }) => { calls.push(`complete:${String(payload.result)}`); return completed("complete", "done"); }),
    "prepare-binding": capability(async ({ payload }) => { calls.push(`prepare:${String(payload.seed)}`); return completed("prepare", "prepared"); }),
    "enhance-binding": capability(async ({ payload }) => { calls.push(`enhance:${String(payload.result)}`); return completed("enhance", "enhanced"); }),
  });
  const result = await workflow.execute(input);
  assert.equal(result.status, "completed");
  assert.deepEqual(calls, ["prepare:safe-seed", "enhance:prepared", "complete:enhanced"]);
  assert.deepEqual(result.audit.entries.map((entry) => entry.stageId), ["prepare", "enhance", "complete"]);
});

test("returns an immutable isolated execution snapshot", async () => {
  const workflow = createWorkflow({
    "prepare-binding": capability(async () => completed("prepare", "prepared")),
    "enhance-binding": capability(async () => completed("enhance", "enhanced")),
    "complete-binding": capability(async () => completed("complete", "done")),
  });
  const result = await workflow.execute(input);
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.output.payload.stageOutputs), true);
  assert.throws(() => ((result.output.payload.stageOutputs[0] as { stageId: string }).stageId = "changed"), TypeError);
  assert.equal(result.output.payload.stageOutputs[0]?.stageId, "prepare");
});

test("stops on a required stage failure", async () => {
  let completeCalls = 0;
  const workflow = createWorkflow({
    "prepare-binding": capability(async () => failed("prepare", "failed", { recommendation: "retry", retryClass: "transient" })),
    "enhance-binding": capability(async () => completed("enhance", "enhanced")),
    "complete-binding": capability(async () => { completeCalls += 1; return completed("complete", "done"); }),
  });
  const result = await workflow.execute(input);
  assert.equal(result.status, "failed");
  assert.equal(completeCalls, 0);
  assert.equal(result.retry.recommendation, "retry");
});

test("continues after an optional stage failure and returns partial", async () => {
  const workflow = createWorkflow({
    "prepare-binding": capability(async () => completed("prepare", "prepared")),
    "enhance-binding": capability(async () => failed("enhance")),
    "complete-binding": capability(async () => completed("complete", "done")),
  });
  const result = await workflow.execute(input);
  assert.equal(result.status, "partial");
  if (result.status === "partial") assert.deepEqual(result.failedStageIds, ["enhance"]);
});

for (const scenario of ["before-workflow", "before-stage", "after-stage"] as const) {
  test(`propagates cancellation ${scenario}`, async () => {
    const calls: string[] = [];
    const cancellation: ReferenceWorkflowCancellation = {
      check: ({ point, stageId }) => point === scenario && (scenario === "before-workflow" || stageId === "prepare"),
    };
    const workflow = createWorkflow({
      "prepare-binding": capability(async () => { calls.push("prepare"); return completed("prepare", "prepared"); }),
      "enhance-binding": capability(async () => completed("enhance", "enhanced")),
      "complete-binding": capability(async () => completed("complete", "done")),
    }, cancellation);
    const result = await workflow.execute(input);
    assert.equal(result.status, "cancelled");
    assert.deepEqual(calls, scenario === "after-stage" ? ["prepare"] : []);
  });
}

test("aggregates retry recommendations without a retry loop", async () => {
  const counts = new Map<string, number>();
  const workflow = createWorkflow({
    "prepare-binding": capability(async () => { counts.set("prepare", 1); return completed("prepare", "prepared", { recommendation: "retry", retryClass: "transient" }); }),
    "enhance-binding": capability(async () => { counts.set("enhance", 1); return completed("enhance", "enhanced", { recommendation: "wait", retryClass: "external-state" }); }),
    "complete-binding": capability(async () => { counts.set("complete", 1); return completed("complete", "done"); }),
  });
  const result = await workflow.execute(input);
  assert.equal(result.retry.recommendation, "wait");
  assert.deepEqual(Object.fromEntries(counts), { prepare: 1, enhance: 1, complete: 1 });
});

test("projects reconciliation advice without executing reconciliation", async () => {
  const workflow = createWorkflow({
    "prepare-binding": capability(async () => failed("prepare", "reconciliation-required", { recommendation: "reconcile", retryClass: "outcome-unknown" })),
  });
  const result = await workflow.execute(input);
  assert.equal(result.status, "recovery-required");
  assert.equal(result.reconciliation.recommendation, "reconcile");
});

test("fails safely when a pipeline reference cannot be resolved", async () => {
  const workflow = createWorkflow({});
  const result = await workflow.execute(input);
  assert.equal(result.status, "failed");
  assert.deepEqual(result.audit.reasonCodes, ["pipeline-reference-unresolved"]);
});

const facadeInput = {
  contractVersion: "1.0",
  operation: "generate-music",
  providerId: "reference-provider",
  providerApiVersion: "reference-api-v1",
  durationSeconds: 30,
  adapterInput: { prompt: "safe" },
  assets: [],
  context: {
    contextVersion: "1.0",
    operationRef: "safe-operation",
    baselineTime: "2026-01-01T00:00:00.000Z",
    attempt: 1,
    scenario: "success",
  },
} as unknown as ReferenceWorkflowInput;

const safeAccepted: ReferenceWorkflowResult = {
  resultVersion: "1.0",
  operation: "generate-music",
  status: "accepted",
  acceptedKind: "generation-job",
  reference: { referenceVersion: "1.0", kind: "generation-job", reference: "opaque-safe-reference" },
  audit: { auditVersion: "1.0", status: "accepted", operation: "generate-music", finalStage: "workflow-orchestration", reasonCodes: [] },
};

test("delegates deterministic intent through the injected orchestration capability", async () => {
  const calls: unknown[] = [];
  const result = await runReferenceGenerationWorkflow(
    facadeInput,
    { build: () => ({ status: "ready", request: { prompt: "safe" } }), projectAssets: () => [] },
    { orchestration: { async execute(value) { calls.push(value); return safeAccepted; } } },
  );
  assert.deepEqual(result, safeAccepted);
  assert.equal(calls.length, 1);
  const projected = calls[0] as { operation: string; scenario: string; integrationBinding: { providerClientId: string }; logicalAssets: unknown[] };
  assert.equal(projected.operation, "generate-music");
  assert.equal(projected.scenario, "success");
  assert.equal(projected.integrationBinding.providerClientId, "reference-provider-client-v1");
  assert.deepEqual(projected.logicalAssets, []);
});

test("fails safely without orchestration and never falls back to asyncRuntime", async () => {
  let asyncRuntimeUsed = false;
  const result = await runReferenceGenerationWorkflow(
    facadeInput,
    { build: () => ({ status: "ready", request: { prompt: "safe" } }), projectAssets: () => [] },
    { asyncRuntime: { runtimeVersion: "1.0", supportedOperations: [], async startAccepted() { asyncRuntimeUsed = true; throw new Error("must not run"); }, entryPoints: {} } as never },
  );
  assert.equal(result.status, "failed");
  assert.equal(asyncRuntimeUsed, false);
});

test("rejects non-success caller scenario before invoking orchestration", async () => {
  let invoked = false;
  const inputWithCallerScenario = structuredClone(facadeInput) as unknown as { context: { scenario: string } };
  inputWithCallerScenario.context.scenario = "caller-selected";
  const result = await runReferenceGenerationWorkflow(
    inputWithCallerScenario as unknown as ReferenceWorkflowInput,
    { build: () => ({ status: "ready", request: { prompt: "safe" } }), projectAssets: () => [] },
    { orchestration: { async execute() { invoked = true; return safeAccepted; } } },
  );
  assert.equal(result.status, "failed");
  assert.equal(invoked, false);
  assert.doesNotMatch(JSON.stringify(result), /credential|secret|providerResponse|databaseId|providerJobId|pending|job/);
});

for (const wrapperCase of [
  ["generate-vocal", createCanonicalVocalWorkflowFixture, runReferenceVocalWorkflow],
  ["generate-music", createCanonicalMusicWorkflowFixture, runReferenceMusicWorkflow],
  ["generate-mv", createCanonicalMVWorkflowFixture, runReferenceMVWorkflow],
] as const) {
  test(`${wrapperCase[0]} wrapper delegates through orchestration capability`, async () => {
    const fixture = wrapperCase[1]();
    assert.equal(fixture.status, "ready");
    if (fixture.status !== "ready") return;
    let observedOperation = "";
    const result = await wrapperCase[2](fixture.input as never, {
      orchestration: {
        async execute(value) {
          observedOperation = value.operation;
          return { ...safeAccepted, operation: value.operation, audit: { ...safeAccepted.audit, operation: value.operation } } as ReferenceWorkflowResult;
        },
      },
    });
    assert.equal(result.status, "accepted");
    assert.equal(observedOperation, wrapperCase[0]);
  });
}
