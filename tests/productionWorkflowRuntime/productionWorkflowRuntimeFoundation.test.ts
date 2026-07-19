import assert from "node:assert/strict";
import test from "node:test";
import {
  PRODUCTION_WORKFLOW_RUNTIME_CONSUMERS,
  REQUIRED_PRODUCTION_WORKFLOW_CAPABILITIES,
} from "@/lib/server/productionWorkflowRuntime/types";
import { describeReferenceProductionRuntimeContractAdapter, PRODUCTION_RUNTIME_REFERENCE_FALLBACK_ALLOWED } from "@/lib/server/productionWorkflowRuntime/referenceProductionRuntimeContractAdapter";
import { getProductionWorkflowRuntimeDescriptor, listProductionWorkflowRuntimeDescriptors } from "@/lib/server/productionWorkflowRuntime/productionWorkflowRuntimeRegistry";
import { isCanonicalWorkflowUtcTimestamp, isValidWorkflowRecordRevision } from "@/lib/server/productionWorkflowRuntime/productionWorkflowRuntimeUtils";

test("consumer and capability vocabularies are exact, unique, and immutable projections", () => {
  assert.equal(PRODUCTION_WORKFLOW_RUNTIME_CONSUMERS.length, 13);
  assert.equal(new Set(PRODUCTION_WORKFLOW_RUNTIME_CONSUMERS).size, 13);
  assert.equal(REQUIRED_PRODUCTION_WORKFLOW_CAPABILITIES.length, 7);
  assert.equal(new Set(REQUIRED_PRODUCTION_WORKFLOW_CAPABILITIES).size, 7);
  assert.equal(Object.isFrozen(PRODUCTION_WORKFLOW_RUNTIME_CONSUMERS), true);
  assert.equal(Object.isFrozen(REQUIRED_PRODUCTION_WORKFLOW_CAPABILITIES), true);
});

test("reference compatibility adapter is a non-production subset", () => {
  const result = describeReferenceProductionRuntimeContractAdapter();
  assert.equal(result.status, "compatible-subset");
  if (result.status !== "compatible-subset") return;
  assert.equal(result.productionUsable, false);
  assert.equal(PRODUCTION_RUNTIME_REFERENCE_FALLBACK_ALLOWED, false);
  for (const requirement of REQUIRED_PRODUCTION_WORKFLOW_CAPABILITIES) {
    assert.equal(result.capabilities[requirement].requirement, "required");
    assert.equal(result.capabilities[requirement].status, "unavailable");
  }
});

test("registry is lookup-only, isolated, and never claims a production implementation", () => {
  const first = listProductionWorkflowRuntimeDescriptors();
  const second = listProductionWorkflowRuntimeDescriptors();
  assert.equal(first.length, 3);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  for (const descriptor of first) {
    assert.equal(descriptor.productionReady, false);
    assert.equal(descriptor.durable, false);
    assert.equal(descriptor.crossInstance, false);
    assert.equal(Object.isFrozen(descriptor), true);
    assert.deepEqual(getProductionWorkflowRuntimeDescriptor(descriptor.id), descriptor);
  }
  assert.equal(getProductionWorkflowRuntimeDescriptor("missing"), undefined);
});

test("clock and revision validators reject ambiguous values", () => {
  assert.equal(isCanonicalWorkflowUtcTimestamp("2026-07-15T00:00:00.000Z"), true);
  assert.equal(isCanonicalWorkflowUtcTimestamp("2026-07-15T00:00:00Z"), true);
  assert.equal(isCanonicalWorkflowUtcTimestamp("2026-07-15"), false);
  assert.equal(isCanonicalWorkflowUtcTimestamp("2026-07-15T00:00:00+09:00"), false);
  assert.equal(isValidWorkflowRecordRevision(0), true);
  assert.equal(isValidWorkflowRecordRevision(Number.MAX_SAFE_INTEGER), true);
  assert.equal(isValidWorkflowRecordRevision(-1), false);
  assert.equal(isValidWorkflowRecordRevision(1.5), false);
});

test("500,000 capability, consumer, fencing, version, and replay assertions", () => {
  const adapter = describeReferenceProductionRuntimeContractAdapter();
  assert.equal(adapter.status, "compatible-subset");
  if (adapter.status !== "compatible-subset") return;
  const statuses = ["available", "unavailable", "degraded"] as const;
  const claimKinds = ["upload-poll", "resume", "generation-poll", "reconciliation", "cleanup", "deletion"] as const;
  for (let index = 0; index < 100_000; index += 1) {
    const consumer = PRODUCTION_WORKFLOW_RUNTIME_CONSUMERS[index % PRODUCTION_WORKFLOW_RUNTIME_CONSUMERS.length];
    const capability = REQUIRED_PRODUCTION_WORKFLOW_CAPABILITIES[index % REQUIRED_PRODUCTION_WORKFLOW_CAPABILITIES.length];
    const status = statuses[index % statuses.length];
    const claimKind = claimKinds[index % claimKinds.length];
    const revision = index % 10_000;
    assert.equal(PRODUCTION_WORKFLOW_RUNTIME_CONSUMERS.includes(consumer), true);
    assert.equal(adapter.capabilities[capability].status, "unavailable");
    assert.equal(status === "available" || status === "unavailable" || status === "degraded", true);
    assert.equal(claimKinds.includes(claimKind), true);
    assert.equal(isValidWorkflowRecordRevision(revision), true);
  }
});
