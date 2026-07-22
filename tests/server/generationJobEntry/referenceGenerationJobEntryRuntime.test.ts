import assert from "node:assert/strict";
import test from "node:test";
import type { ServerCompositionResult } from "../../../lib/server/composition/types";
import type { WorkflowEntryResult } from "../../../lib/server/workflowEntry/types";
import type { GenerationJobRequest } from "../../../lib/server/generationJobEntry/types";
import {
  ReferenceGenerationJobEntryRuntime,
  type GenerationJobEntryValue,
  type GenerationJobWorkflowEntryCapability,
  type GenerationJobWorkflowEntryInvocation,
} from "../../../lib/server/generationJobEntry/referenceGenerationJobEntryRuntime";

const capabilityIdentity = { capabilityId: "workflow-entry", capabilityVersion: "1.0" } as const;
const compositionIdentity = { compositionId: "server", compositionVersion: "1.0" } as const;
const resolution = {
  resolutionVersion: "1.0" as const,
  composition: compositionIdentity,
  status: "resolved" as const,
  dependencies: [],
  requiredDependencyFailure: false,
  omittedOptionalSlotIds: [],
};
const audit = { auditVersion: "1.0" as const, composition: compositionIdentity, entries: [], reasonCodes: [] };
const capabilities = {
  capabilitiesVersion: "1.0" as const,
  workflowEntry: {
    descriptorVersion: "1.0" as const,
    identity: capabilityIdentity,
    status: "provided" as const,
    supportedRequestClassifications: ["start", "resume", "reconcile"] as const,
    supportedResultClassifications: ["accepted", "completed", "partial", "failed", "cancelled", "recovery-required", "rejected"] as const,
  },
  health: {
    descriptorVersion: "1.0" as const,
    identity: { capabilityId: "health", capabilityVersion: "1.0" },
    status: "provided" as const,
    supportedHealthClassifications: ["ready"] as const,
  },
  additional: [],
};
const readyComposition: ServerCompositionResult = {
  resultVersion: "1.0",
  status: "ready",
  lifecycle: "ready",
  identity: compositionIdentity,
  resolution,
  capabilities,
  audit,
};

const request = (): GenerationJobRequest<Readonly<{ [key: string]: GenerationJobEntryValue }>> => ({
  requestVersion: "1.0",
  requestIdentity: "request",
  job: { jobId: "job", jobVersion: "1.0" },
  selection: {
    selectionVersion: "1.0",
    workflowId: "generation",
    workflowVersion: "1.0",
    capabilityId: "workflow-entry",
    capabilityVersion: "1.0",
    mode: "exact",
  },
  input: { prompt: "safe" },
  context: {
    contextVersion: "1.0",
    correlationIdentity: "correlation",
    attemptIdentity: "attempt",
    attempt: 0,
    callerClassification: "internal-service",
    executionClassification: "service",
    cancellation: { status: "not-requested" },
  },
  metadata: {
    metadataVersion: "1.0",
    fields: [{ name: "locale", value: "ja-JP", declarationOrder: 0 }],
  },
  priority: "normal",
  scheduling: "immediate-eligible",
});

const entryAudit = {
  auditVersion: "1.0" as const,
  request: { requestId: "request", requestVersion: "1.0" as const },
  workflow: { workflowId: "generation", workflowVersion: "1.0" },
  entries: [],
  reasonCodes: [],
};
const resultFor = (status: "accepted" | "completed" | "partial" | "failed" | "cancelled" | "recovery-required" | "rejected"): WorkflowEntryResult<GenerationJobEntryValue> => {
  const base = { resultVersion: "1.0" as const, request: entryAudit.request, workflow: entryAudit.workflow, audit: entryAudit };
  if (status === "accepted") return { ...base, status, acceptanceIdentity: "accepted" };
  if (status === "completed") return { ...base, status, output: { value: "completed" } };
  if (status === "partial") return { ...base, status, output: { value: "partial" }, issues: [{ classification: "unavailable", reasonCode: "optional-failed", retryable: true }] };
  if (status === "failed") return { ...base, status, errors: [{ classification: "unavailable", reasonCode: "entry-failed", retryable: true }] };
  if (status === "cancelled") return { ...base, status, reasonCode: "entry-cancelled" };
  if (status === "recovery-required") return {
    ...base,
    status,
    reconciliation: {
      requestVersion: "1.0",
      identity: { resumeVersion: "1.0", referenceIdentity: "recovery", referenceKind: "reconciliation" },
      recommendation: "reconcile",
      reasonCode: "outcome-unknown",
    },
  };
  return {
    ...base,
    status,
    authorization: { decisionVersion: "1.0", decision: "deny", reasonCode: "denied", policyIdentity: "policy" },
    errors: [{ classification: "unauthorized", reasonCode: "denied", retryable: false }],
  };
};

const fixture = (result: WorkflowEntryResult<GenerationJobEntryValue>, composition: ServerCompositionResult = readyComposition) => {
  let calls = 0;
  let invocation: GenerationJobWorkflowEntryInvocation | undefined;
  const capability: GenerationJobWorkflowEntryCapability = {
    identity: capabilityIdentity,
    async execute(value) {
      calls += 1;
      invocation = value;
      return result;
    },
  };
  return {
    runtime: new ReferenceGenerationJobEntryRuntime({ compositionIdentity, composition, workflowEntry: capability }),
    calls: () => calls,
    invocation: () => invocation,
  };
};

test("valid requests invoke once and project all terminal results", async () => {
  for (const status of ["accepted", "completed", "partial", "failed", "cancelled", "recovery-required", "rejected"] as const) {
    const current = fixture(resultFor(status));
    const result = await current.runtime.execute(request());
    assert.equal(result.status, status);
    assert.equal(current.calls(), 1);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.audit.entries));
  }
});

test("projects allowlisted metadata, correlation, attempt, and resume identity", async () => {
  const current = fixture(resultFor("completed"));
  const value = { ...request(), resume: { referenceVersion: "1.0" as const, referenceIdentity: "job", referenceKind: "job" as const } };
  await current.runtime.execute(value);
  const invocation = current.invocation();
  assert.deepEqual(invocation?.envelope.metadata, [{ name: "locale", value: "ja-JP" }]);
  assert.equal(invocation?.context.correlationIdentity, "correlation");
  assert.equal(invocation?.context.attempt.attemptIdentity, "attempt");
  assert.equal(invocation?.resumeReference?.referenceIdentity, "job");
});

test("invalid request, selection, resume, and cancellation references stop before invocation", async () => {
  const mutations = [
    (value: ReturnType<typeof request>) => ({ ...value, requestIdentity: "" }),
    (value: ReturnType<typeof request>) => ({ ...value, selection: { ...value.selection, capabilityId: "" } }),
    (value: ReturnType<typeof request>) => ({ ...value, resume: { referenceVersion: "1.0" as const, referenceIdentity: "other", referenceKind: "job" as const } }),
    (value: ReturnType<typeof request>) => ({ ...value, context: { ...value.context, cancellation: { status: "requested" as const, referenceVersion: "1.0" as const, referenceIdentity: "other", scope: "job" as const, reasonCode: "caller-cancelled" as const } } }),
  ];
  for (const mutate of mutations) {
    const current = fixture(resultFor("completed"));
    assert.equal((await current.runtime.execute(mutate(request()))).status, "failed");
    assert.equal(current.calls(), 0);
  }
});

test("already cancelled, unavailable composition, and rejected composition do not invoke", async () => {
  const cancelled = fixture(resultFor("completed"));
  const baseRequest = request();
  const cancelledRequest = {
    ...baseRequest,
    context: {
      ...baseRequest.context,
      cancellation: { status: "requested" as const, referenceVersion: "1.0" as const, referenceIdentity: "job", scope: "job" as const, reasonCode: "caller-cancelled" as const },
    },
  };
  assert.equal((await cancelled.runtime.execute(cancelledRequest)).status, "cancelled");
  assert.equal(cancelled.calls(), 0);

  const unavailable: ServerCompositionResult = { resultVersion: "1.0", status: "unavailable", lifecycle: "unavailable", identity: compositionIdentity, resolution: { ...resolution, status: "unavailable", requiredDependencyFailure: true }, failures: [], audit };
  const missing = fixture(resultFor("completed"), unavailable);
  assert.equal((await missing.runtime.execute(request())).status, "failed");
  assert.equal(missing.calls(), 0);

  const rejected: ServerCompositionResult = { resultVersion: "1.0", status: "degraded", lifecycle: "degraded", identity: compositionIdentity, resolution: { ...resolution, status: "degraded" }, capabilities, failures: [{ classification: "policy-rejected", errorCode: "dependency-rejected", safeMessageClassification: "policy", retryable: false }], audit };
  const denied = fixture(resultFor("completed"), rejected);
  assert.equal((await denied.runtime.execute(request())).status, "rejected");
  assert.equal(denied.calls(), 0);
});

test("dependency exceptions and unsupported results are safe", async () => {
  const throwing = new ReferenceGenerationJobEntryRuntime({
    compositionIdentity,
    composition: readyComposition,
    workflowEntry: { identity: capabilityIdentity, async execute() { throw new Error("raw secret stack"); } },
  });
  const failed = await throwing.execute(request());
  assert.equal(failed.status, "failed");
  assert.doesNotMatch(JSON.stringify(failed), /raw secret stack/);

  const unsupported = new ReferenceGenerationJobEntryRuntime({
    compositionIdentity,
    composition: readyComposition,
    workflowEntry: { identity: capabilityIdentity, async execute() { return { status: "unknown" } as never; } },
  });
  assert.equal((await unsupported.execute(request())).status, "failed");
});

test("execution is deterministic and copy isolated", async () => {
  const current = fixture(resultFor("completed"));
  const source = request();
  const first = await current.runtime.execute(source);
  const second = await current.runtime.execute(source);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.deepEqual(source.input, { prompt: "safe" });
  assert.ok(Object.isFrozen(first));
});
