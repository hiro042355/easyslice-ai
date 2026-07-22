import assert from "node:assert/strict";
import test from "node:test";
import type { WorkflowDefinition, WorkflowResult } from "../../../lib/workflows/types";
import {
  ReferenceWorkflowEntryRuntime,
  type WorkflowEntryExecutionRequest,
  type WorkflowEntryRuntimeCapability,
  type WorkflowEntryValue,
} from "../../../lib/server/workflowEntry/referenceWorkflowEntryRuntime";

const definition = (version = "1.0"): WorkflowDefinition => ({
  contractVersion: "1.0",
  identity: { workflowId: "generation", workflowVersion: version },
  stages: [{
    identity: { workflow: { workflowId: "generation", workflowVersion: version }, stageId: "generate", stageVersion: "1.0" },
    order: 0,
    requirement: "required",
    terminal: true,
    pipeline: {
      referenceVersion: "1.0",
      pipelineId: "generation",
      pipelineVersion: "1.0",
      operationId: "generate",
      operationVersion: "1.0",
      bindingId: "generation",
      bindingVersion: "1.0",
    },
  }],
  dependencies: [],
});

const request = (): WorkflowEntryExecutionRequest => ({
  envelope: {
    envelopeVersion: "1.0",
    request: { requestId: "request", requestVersion: "1.0" },
    selection: {
      selectionVersion: "1.0",
      workflow: { workflowId: "generation", workflowVersion: "1.0" },
      mode: "exact",
    },
    input: { inputVersion: "1.0", payload: { prompt: "safe" } },
    metadata: [{ name: "locale", value: "ja-JP" }],
    idempotency: {
      identityVersion: "1.0",
      keyIdentity: "key",
      requestFingerprintIdentity: "fingerprint",
      replayClassification: "new",
    },
  },
  context: {
    contextVersion: "1.0",
    callerClassification: "authenticated-user",
    requestClassification: "start",
    executionMode: "synchronous",
    correlationIdentity: "correlation",
    attempt: { attemptVersion: "1.0", attempt: 0, attemptIdentity: "attempt" },
    cancellation: { status: "not-requested" },
  },
  authorization: { decisionVersion: "1.0", decision: "allow", reasonCode: "allowed", policyIdentity: "policy" },
});

const audit = (status: "completed" | "partial" | "failed" | "cancelled" | "recovery-required") => ({
  auditVersion: "1.0" as const,
  workflow: { workflowId: "generation", workflowVersion: "1.0" },
  initialStageId: "generate",
  finalStageId: "generate",
  entries: [{ entryVersion: "1.0" as const, sequence: 0, stageId: "generate", state: status === "partial" ? "failed" as const : status, reasonCode: status }],
  reasonCodes: [status],
});

const workflowResult = (status: "completed" | "partial" | "failed" | "cancelled" | "recovery-required"): WorkflowResult<WorkflowEntryValue> => {
  const base = {
    resultVersion: "1.0" as const,
    workflow: { workflowId: "generation", workflowVersion: "1.0" },
    retry: status === "failed"
      ? { recommendation: "retry" as const, retryClass: "transient" as const }
      : { recommendation: "do-not-retry" as const },
    reconciliation: status === "recovery-required"
      ? { recommendation: "reconcile" as const, reasonCode: "outcome-unknown" as const }
      : { recommendation: "none" as const },
    audit: audit(status),
  };
  if (status === "completed") return { ...base, status, output: { outputVersion: "1.0", workflow: base.workflow, payload: { asset: "ready" } } };
  if (status === "partial") return { ...base, status, output: { outputVersion: "1.0", workflow: base.workflow, payload: { asset: "partial" } }, failedStageIds: ["optional"], skippedStageIds: [] };
  if (status === "failed") return { ...base, status, failedStageId: "generate" };
  if (status === "cancelled") return { ...base, status, cancelledStageId: "generate" };
  return { ...base, status, recoveryStageId: "generate" };
};

const createRuntime = (result: WorkflowResult<WorkflowEntryValue>, versions = [definition()]) => {
  let calls = 0;
  const capability: WorkflowEntryRuntimeCapability = {
    async execute(_definition, input) {
      calls += 1;
      assert.equal(input.invocationVersion, "1.0");
      return result;
    },
  };
  return {
    runtime: new ReferenceWorkflowEntryRuntime({
      registry: {
        getByIdentity(identity) {
          return versions.find((candidate) => candidate.identity.workflowId === identity.workflowId && candidate.identity.workflowVersion === identity.workflowVersion);
        },
        snapshot: () => ({ snapshotVersion: "1.0", definitions: versions }),
      },
      workflowRuntime: capability,
    }),
    calls: () => calls,
  };
};

test("valid requests select deterministically and project every workflow terminal result", async () => {
  for (const status of ["completed", "partial", "failed", "cancelled", "recovery-required"] as const) {
    const fixture = createRuntime(workflowResult(status));
    const result = await fixture.runtime.execute(request());
    assert.equal(result.status, status);
    assert.equal(fixture.calls(), 1);
    assert.deepEqual(result.audit.entries.map((entry) => entry.sequence), result.audit.entries.map((_, index) => index));
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.audit.entries));
  }
});

test("invalid, unauthorized, conflicting, missing, and cancelled requests do not invoke workflow runtime", async () => {
  const cases: readonly Readonly<{ expected: string; mutate(value: WorkflowEntryExecutionRequest): WorkflowEntryExecutionRequest }>[] = [
    { expected: "failed", mutate: (value) => ({ ...value, envelope: { ...value.envelope, request: { ...value.envelope.request, requestId: "" } } }) },
    { expected: "rejected", mutate: (value) => ({ ...value, authorization: { ...value.authorization, decision: "deny" } }) },
    { expected: "failed", mutate: (value) => ({ ...value, envelope: { ...value.envelope, idempotency: { ...value.envelope.idempotency, replayClassification: "semantic-conflict" } } }) },
    { expected: "cancelled", mutate: (value) => ({ ...value, context: { ...value.context, cancellation: { status: "requested", scope: "entry", reasonCode: "caller-cancelled" } } }) },
  ];
  for (const scenario of cases) {
    const fixture = createRuntime(workflowResult("completed"));
    const result = await fixture.runtime.execute(scenario.mutate(request()));
    assert.equal(result.status, scenario.expected);
    assert.equal(fixture.calls(), 0);
  }
  const missing = createRuntime(workflowResult("completed"), []);
  const result = await missing.runtime.execute(request());
  assert.equal(result.status, "failed");
  assert.equal(result.status === "failed" ? result.errors[0]?.reasonCode : undefined, "workflow-version-not-found");
});

test("latest-compatible selection, replay, resume, and returned snapshots remain deterministic and isolated", async () => {
  const original = request();
  const selected: string[] = [];
  const versions = [definition("1.0"), definition("2.0")];
  const runtime = new ReferenceWorkflowEntryRuntime({
    registry: { getByIdentity: () => undefined, snapshot: () => ({ snapshotVersion: "1.0", definitions: [...versions].reverse() }) },
    workflowRuntime: {
      async execute(selectedDefinition) {
        selected.push(selectedDefinition.identity.workflowVersion);
        return workflowResult("completed");
      },
    },
  });
  const latest = {
    ...original,
    envelope: {
      ...original.envelope,
      selection: { ...original.envelope.selection, mode: "latest-compatible" as const },
      idempotency: { ...original.envelope.idempotency, replayClassification: "replay" as const },
    },
    context: { ...original.context, requestClassification: "resume" as const },
    resumeReference: { referenceIdentity: "resume", referenceKind: "workflow" as const },
  };
  const first = await runtime.execute(latest);
  const second = await runtime.execute(latest);
  assert.deepEqual(selected, ["2.0", "2.0"]);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.deepEqual(original.envelope.input.payload, { prompt: "safe" });
});
