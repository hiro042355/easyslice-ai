import assert from "node:assert/strict";
import test from "node:test";
import type { GenerationJobResultProjection } from "../../../lib/server/generationJobEntry/types";
import {
  ReferenceHttpAdapterRuntime,
  type HttpAdapterValue,
  type HttpGenerationJobBody,
} from "../../../lib/server/httpAdapter/referenceHttpAdapterRuntime";
import type { HttpRequestEnvelope } from "../../../lib/server/httpAdapter/types";

const envelope = (): HttpRequestEnvelope<HttpGenerationJobBody> => ({
  envelopeVersion: "1.0",
  metadata: {
    metadataVersion: "1.0", route: "generation-job", method: "create",
    request: { identityVersion: "1.0", requestIdentity: "request-1" },
    correlation: { identityVersion: "1.0", correlationIdentity: "correlation-1" },
    bodySizeClassification: "small", contentClassification: "structured",
  },
  headers: [
    { headerVersion: "1.0", nameClassification: "content-type", value: "structured", declarationOrder: 0 },
    { headerVersion: "1.0", nameClassification: "request-id", value: "request-1", declarationOrder: 1 },
    { headerVersion: "1.0", nameClassification: "correlation-id", value: "correlation-1", declarationOrder: 2 },
  ],
  body: { bodyVersion: "1.0", classification: "structured", value: {
    bodyContractVersion: "1.0", job: { jobId: "job-1", jobVersion: "1" },
    selection: { selectionVersion: "1.0", workflowId: "workflow-1", workflowVersion: "1", capabilityId: "capability-1", capabilityVersion: "1", mode: "exact" },
    input: { title: "demo" }, attemptIdentity: "attempt-1", attempt: 1,
    callerClassification: "authenticated-user", executionClassification: "interactive",
    priority: "normal", scheduling: "immediate-eligible",
    metadata: [{ name: "locale", value: "ja-JP", declarationOrder: 0 }],
    cancellation: { status: "not-requested" },
  } },
});

const result = (status: "accepted" | "completed" | "partial" | "failed" | "cancelled" | "recovery-required" | "rejected"): GenerationJobResultProjection<HttpAdapterValue> => {
  const job = { jobId: "job-1", jobVersion: "1" };
  const audit = { auditVersion: "1.0" as const, job, entries: [], reasonCodes: [`job-${status}`] };
  if (status === "accepted") return { resultVersion: "1.0", status, job, scheduling: "immediate-eligible", audit };
  if (status === "completed") return { resultVersion: "1.0", status, job, output: { assetId: "asset-1" }, audit };
  if (status === "partial") return { resultVersion: "1.0", status, job, output: { assetId: "asset-1" }, failures: [], audit };
  if (status === "cancelled") return { resultVersion: "1.0", status, job, reasonCode: "caller-cancelled", audit };
  if (status === "recovery-required") return { resultVersion: "1.0", status, job, reasonCode: "outcome-unknown", reference: { referenceVersion: "1.0", referenceIdentity: "recovery-1", referenceKind: "reconciliation" }, audit };
  return { resultVersion: "1.0", status, job, failures: [], audit };
};

test("valid request is projected and invokes the injected capability exactly once", async () => {
  const calls: unknown[] = [];
  const runtime = new ReferenceHttpAdapterRuntime({ generationJobEntry: { execute: async (request) => { calls.push(request); return result("completed"); } } });
  const actual = await runtime.adapt(envelope());
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    requestVersion: "1.0", requestIdentity: "request-1", job: { jobId: "job-1", jobVersion: "1" },
    selection: envelope().body.value?.selection, input: { title: "demo" },
    context: { contextVersion: "1.0", correlationIdentity: "correlation-1", attemptIdentity: "attempt-1", attempt: 1, callerClassification: "authenticated-user", executionClassification: "interactive", cancellation: { status: "not-requested" } },
    metadata: { metadataVersion: "1.0", fields: [{ name: "locale", value: "ja-JP", declarationOrder: 0 }] },
    priority: "normal", scheduling: "immediate-eligible",
  });
  assert.equal(actual.status, "successful");
  assert.equal(actual.response.statusCode, 200);
  assert.equal(Object.isFrozen(actual), true);
  assert.equal(Object.isFrozen(actual.response.body.value?.output), true);
});

test("invalid envelopes and duplicate headers are rejected without invocation", async () => {
  let calls = 0;
  const runtime = new ReferenceHttpAdapterRuntime({ generationJobEntry: { execute: async () => { calls += 1; return result("completed"); } } });
  const invalid = envelope();
  const actual = await runtime.adapt({ ...invalid, metadata: { ...invalid.metadata, method: "read" } });
  assert.equal(actual.status, "rejected");
  assert.equal(calls, 0);
  const duplicate = await runtime.adapt({ ...invalid, headers: [...invalid.headers, { ...invalid.headers[0]!, declarationOrder: 3 }] });
  assert.equal(duplicate.status, "rejected");
  assert.equal(calls, 0);
  const malformedBody = await runtime.adapt({
    ...invalid,
    body: { bodyVersion: "1.0", classification: "empty" },
  });
  assert.equal(malformedBody.status, "rejected");
  assert.equal(calls, 0);
});

test("all generation job outcomes have deterministic safe projections", async () => {
  const expected = { accepted: "successful", completed: "successful", partial: "successful", cancelled: "successful", "recovery-required": "unavailable", rejected: "rejected", failed: "unavailable" } as const;
  for (const [status, projected] of Object.entries(expected)) {
    const runtime = new ReferenceHttpAdapterRuntime({ generationJobEntry: { execute: async () => result(status as keyof typeof expected) } });
    const first = await runtime.adapt(envelope());
    const second = await runtime.adapt(envelope());
    assert.equal(first.status, projected);
    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(first).includes("credential"), false);
    assert.equal(JSON.stringify(first).includes("storageLocator"), false);
  }
});

test("dependency throws and unsupported results are normalized without leakage", async () => {
  const secret = "secret-provider-reference";
  const throwing = new ReferenceHttpAdapterRuntime({ generationJobEntry: { execute: async () => { throw new Error(secret); } } });
  const failed = await throwing.adapt(envelope());
  assert.equal(failed.status, "unavailable");
  assert.equal(JSON.stringify(failed).includes(secret), false);
  const unsupported = new ReferenceHttpAdapterRuntime({ generationJobEntry: { execute: async () => null as never } });
  assert.equal((await unsupported.adapt(envelope())).status, "unavailable");
});

test("caller mutation cannot change execution snapshots or sibling results", async () => {
  const input = envelope();
  const runtime = new ReferenceHttpAdapterRuntime({ generationJobEntry: { execute: async () => result("completed") } });
  const first = await runtime.adapt(input);
  const second = await runtime.adapt(envelope());
  assert.notEqual(first, second);
  assert.notEqual(first.response, second.response);
  assert.deepEqual(first, second);
});
