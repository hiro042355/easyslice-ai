import assert from "node:assert/strict";
import test from "node:test";
import { ReferenceMediaOperationRuntime } from "../../../lib/server/mediaOperation/referenceMediaOperationRuntime";
import type {
  MediaOperationCapabilityResult,
  MediaOperationInput,
} from "../../../lib/server/mediaOperation/types";

const projection = {
  projectionVersion: "1.0" as const,
  opaqueValueReference: "opaque-locator-1",
  classification: "locator" as const,
  permittedUsageScope: "capability-input" as const,
  tenantClassification: "matched" as const,
  workspaceClassification: "matched" as const,
  ownershipVerified: true as const,
  redactionRequired: false,
  reasonCode: "projection-approved" as const,
};
const input = (overrides: Partial<MediaOperationInput> = {}): MediaOperationInput => ({
  inputVersion: "1.0",
  request: {
    requestVersion: "1.0", requestIdentity: "request-1", operation: "clip-generation",
    operationIdentity: "operation-1", opaqueUploadReferences: ["opaque-upload-1"],
    opaqueOutputReferences: ["opaque-output-1"],
  },
  context: {
    contextVersion: "1.0", tenantReference: "tenant-1", workspaceReference: "workspace-1",
    ownershipReference: "owner-1", sensitiveProjections: [projection],
  },
  policy: {
    policyVersion: "1.0", allowedOperations: ["clip-generation"], maximumUploadReferences: 2,
    outputRequired: true,
  },
  ...overrides,
});
const result = (
  classification: MediaOperationCapabilityResult["classification"],
): MediaOperationCapabilityResult => ({
  resultVersion: "1.0", classification,
  reasonCode: `media-operation-${classification}`,
  opaqueArtifactReferences: classification === "completed" ? ["opaque-artifact-1"] : [],
});

test("projects accepted and completed capability results with exactly one invocation", async () => {
  for (const classification of ["accepted", "completed"] as const) {
    let calls = 0;
    const runtime = new ReferenceMediaOperationRuntime({
      execute: async () => { calls += 1; return result(classification); },
    });
    const actual = await runtime.execute(input());
    assert.equal(actual.status, classification);
    assert.equal(calls, 1);
  }
});

test("projects rejected, failed, and unavailable results safely", async () => {
  for (const classification of ["rejected", "failed", "unavailable"] as const) {
    const actual = await new ReferenceMediaOperationRuntime({
      execute: async () => result(classification),
    }).execute(input());
    assert.equal(actual.status, classification);
    if (actual.status === "unavailable") assert.equal(actual.retryClassification, "retryable");
  }
});

test("invalid inputs invoke capability zero times", async () => {
  let calls = 0;
  const runtime = new ReferenceMediaOperationRuntime({
    execute: async () => { calls += 1; return result("completed"); },
  });
  const malformed: MediaOperationInput[] = [
    { ...input(), request: { ...input().request, requestIdentity: "" } },
    { ...input(), request: { ...input().request, operationIdentity: "" } },
    { ...input(), request: { ...input().request, operation: "bad" as MediaOperationInput["request"]["operation"] } },
    { ...input(), request: { ...input().request, opaqueUploadReferences: [] } },
    { ...input(), request: { ...input().request, opaqueUploadReferences: ["same", "same"] } },
    { ...input(), context: { ...input().context, tenantReference: "" } },
    { ...input(), policy: { ...input().policy, maximumUploadReferences: 0 } },
  ];
  for (const value of malformed) assert.equal((await runtime.execute(value)).status, "invalid");
  assert.equal(calls, 0);
});

test("policy and ownership violations reject before invocation", async () => {
  let calls = 0;
  const runtime = new ReferenceMediaOperationRuntime({
    execute: async () => { calls += 1; return result("completed"); },
  });
  assert.equal((await runtime.execute(input({
    policy: { ...input().policy, allowedOperations: ["zip-export"] },
  }))).status, "rejected");
  assert.equal((await runtime.execute(input({
    context: {
      ...input().context,
      sensitiveProjections: [{ ...projection, ownershipVerified: false as never }],
    },
  }))).status, "rejected");
  assert.equal(calls, 0);
});

test("dependency throw and malformed results become unavailable without leakage", async () => {
  const secret = "ffmpeg stderr C:/private/output.zip";
  const thrown = await new ReferenceMediaOperationRuntime({
    execute: async () => { throw new Error(secret); },
  }).execute(input());
  assert.equal(thrown.status, "unavailable");
  assert.equal(JSON.stringify(thrown).includes(secret), false);
  const malformed = await new ReferenceMediaOperationRuntime({
    execute: async () => ({ ...result("completed"), reasonCode: "media-operation-failed" }),
  }).execute(input());
  assert.equal(malformed.status, "unavailable");
});

test("execution is deterministic, deeply frozen, and copy isolated", async () => {
  const dependencyResult = result("completed");
  const runtime = new ReferenceMediaOperationRuntime({ execute: async () => dependencyResult });
  const first = await runtime.execute(input());
  const second = await runtime.execute(input());
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.audit.entries), true);
  if (first.status === "completed") assert.equal(Object.isFrozen(first.opaqueArtifactReferences), true);
  assert.deepEqual(dependencyResult, result("completed"));
  const serialized = JSON.stringify(first).toLowerCase();
  for (const forbidden of ["ffmpeg", "stderr", "stdout", "c:/", "temp", "shell", "provider response"])
    assert.equal(serialized.includes(forbidden), false, forbidden);
});
