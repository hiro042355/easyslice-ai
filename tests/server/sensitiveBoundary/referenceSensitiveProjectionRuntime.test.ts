import assert from "node:assert/strict";
import test from "node:test";
import { ReferenceSensitiveProjectionRuntime } from "../../../lib/server/sensitiveBoundary/referenceSensitiveProjectionRuntime";
import type {
  SensitiveProjectionInput,
  SensitiveValueReference,
} from "../../../lib/server/sensitiveBoundary/types";

const reference = (overrides: Partial<SensitiveValueReference> = {}): SensitiveValueReference => ({
  referenceVersion: "1.0", opaqueValueReference: "opaque-sensitive-ref-1", classification: "public",
  sourceClassification: "request-boundary", requestedUsageScope: "public-response",
  tenantReference: "tenant-1", workspaceReference: "workspace-1", ownershipReference: "owner-1",
  projectionPolicyClassification: "strict", ...overrides,
});
const input = (references: readonly SensitiveValueReference[] = [reference()]): SensitiveProjectionInput => ({
  inputVersion: "1.0", requestIdentity: "request-1", authenticatedTenantReference: "tenant-1",
  requestedWorkspaceReference: "workspace-1", authenticatedOwnershipReference: "owner-1", references,
});
const approvedRuntime = (calls?: { value: number }) => new ReferenceSensitiveProjectionRuntime({
  classifySensitiveReference: async () => {
    if (calls) calls.value += 1;
    return { status: "approved" };
  },
});

test("projects permitted classifications and invokes capability exactly once per projected reference", async () => {
  const cases = [
    reference(),
    reference({ classification: "internal", requestedUsageScope: "internal-execution" }),
    reference({ classification: "locator", requestedUsageScope: "capability-input" }),
    reference({ classification: "personal", projectionPolicyClassification: "personal-public-explicit" }),
    reference({ classification: "derived-safe", requestedUsageScope: "audit" }),
  ];
  for (const value of cases) {
    const calls = { value: 0 };
    const actual = await approvedRuntime(calls).project(input([value]));
    assert.equal(actual.status, "projected");
    assert.equal(calls.value, 1);
  }
});

test("redacts confidential audit, credential audit, and operational public values without invocation", async () => {
  const calls = { value: 0 };
  const values = [
    reference({ classification: "confidential", requestedUsageScope: "audit" }),
    reference({ classification: "credential", requestedUsageScope: "audit" }),
    reference({ classification: "operational", requestedUsageScope: "public-response" }),
  ];
  for (const value of values) {
    const actual = await approvedRuntime(calls).project(input([value]));
    assert.equal(actual.status, "redacted");
    assert.equal(JSON.stringify(actual).includes(value.opaqueValueReference), false);
  }
  assert.equal(calls.value, 0);
});

test("rejects forbidden public projections and ownership mismatches without invocation", async () => {
  const calls = { value: 0 };
  for (const value of [
    reference({ classification: "locator" }),
    reference({ classification: "personal" }),
  ]) assert.equal((await approvedRuntime(calls).project(input([value]))).status, "rejected");
  for (const value of [
    reference({ tenantReference: "tenant-2" }),
    reference({ workspaceReference: "workspace-2" }),
    reference({ ownershipReference: "owner-2" }),
  ]) {
    const actual = await approvedRuntime(calls).project(input([value]));
    assert.equal(actual.status, "rejected");
    assert.equal(JSON.stringify(actual).includes("tenant-2"), false);
    assert.equal(JSON.stringify(actual).includes("workspace-2"), false);
    assert.equal(JSON.stringify(actual).includes("owner-2"), false);
  }
  assert.equal(calls.value, 0);
});

test("invalid and duplicate input is rejected before dependency invocation", async () => {
  const calls = { value: 0 };
  const malformed: SensitiveProjectionInput[] = [
    { ...input(), requestIdentity: "" },
    { ...input(), references: [] },
    input([reference({ opaqueValueReference: "" })]),
    input([reference({ classification: "bad" as SensitiveValueReference["classification"] })]),
    input([reference({ sourceClassification: "bad" as SensitiveValueReference["sourceClassification"] })]),
    input([reference({ requestedUsageScope: "bad" as SensitiveValueReference["requestedUsageScope"] })]),
    input([reference({ projectionPolicyClassification: "bad" as SensitiveValueReference["projectionPolicyClassification"] })]),
    input([reference(), reference()]),
  ];
  for (const value of malformed) assert.equal((await approvedRuntime(calls).project(value)).status, "invalid");
  assert.equal(calls.value, 0);
});

test("normalizes dependency rejection, unavailable, and throw without leaking errors", async () => {
  const rejected = await new ReferenceSensitiveProjectionRuntime({
    classifySensitiveReference: async () => ({ status: "rejected" }),
  }).project(input());
  assert.equal(rejected.status, "rejected");
  const unavailable = await new ReferenceSensitiveProjectionRuntime({
    classifySensitiveReference: async () => ({ status: "unavailable" }),
  }).project(input());
  assert.equal(unavailable.status, "unavailable");
  const secret = "token-secret-path-C:/private";
  const thrown = await new ReferenceSensitiveProjectionRuntime({
    classifySensitiveReference: async () => { throw new Error(secret); },
  }).project(input());
  assert.equal(thrown.status, "unavailable");
  assert.equal(JSON.stringify(thrown).includes(secret), false);
});

test("results are deterministic, deeply frozen, copy isolated, and public-safe", async () => {
  const mutable = input();
  const runtime = approvedRuntime();
  const first = await runtime.project(mutable);
  const second = await runtime.project(input());
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  if (first.status === "projected") {
    assert.equal(Object.isFrozen(first.context), true);
    assert.equal(Object.isFrozen(first.context.internalProjections), true);
    assert.equal(first.context.publicProjections.some((value) => "opaqueValueReference" in value), false);
  }
  assert.equal(mutable.references[0]?.opaqueValueReference, "opaque-sensitive-ref-1");
  const serialized = JSON.stringify(first).toLowerCase();
  for (const forbidden of [
    "token-secret", "cookie", "jwt", "password", "api-key", "c:/", "signed-url",
    "bucket-name", "object-key", "email@", "stack trace", "policy contents",
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
});
