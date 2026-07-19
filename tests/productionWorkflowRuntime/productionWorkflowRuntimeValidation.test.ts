import assert from "node:assert/strict";
import test from "node:test";
import { validateProductionWorkflowRuntime } from "@/lib/server/productionWorkflowRuntime/productionWorkflowRuntimeUtils";

const noResult = async () => ({ status: "unavailable" as const });

function store(methods: readonly string[]) {
  const value: Record<string, unknown> = { storeVersion: "1.0" };
  for (const method of methods) value[method] = noResult;
  return value;
}

function validRuntimeShape(): Record<string, unknown> {
  const required = {
    capability: "durable-persistence",
    requirement: "required",
    status: "available",
    acceptanceGate: "gate",
  };
  const capabilities = {
    "durable-persistence": required,
    "cross-instance-coordination": { ...required, capability: "cross-instance-coordination" },
    "distributed-idempotency": { ...required, capability: "distributed-idempotency" },
    "durable-jobs": { ...required, capability: "durable-jobs" },
    "durable-references": { ...required, capability: "durable-references" },
    "production-authentication": { ...required, capability: "production-authentication" },
    "graceful-drain": { ...required, capability: "graceful-drain" },
  };
  return {
    runtimeVersion: "1.0",
    capabilities,
    core: { transactionManager: { runInTransaction: noResult, stop: () => "stopped" } },
    stores: {
      bundleVersion: "1.0",
      acceptedPersistence: store(["createIfAbsent", "read", "compareAndSet", "markExpired"]),
      pollState: store(["create", "read", "claim", "renew", "commitPollResult", "markTerminal", "release"]),
      resumeRecord: store(["createIfAbsent", "read", "claim", "compareAndSet", "markTerminal"]),
      resumeJournal: store(["append", "readSafeHistory"]),
      materializationIdempotency: store(["reserve", "lookup", "commitResult", "commitUnknown", "markConflict", "expire"]),
      generationIdempotency: store(["reserve", "lookup", "commitResult", "commitUnknown", "markConflict", "expire"]),
      generationJobs: store(["createIfAbsent", "read", "claimForPoll", "renewClaim", "commitPending", "commitCompleted", "commitFailed", "commitUnknown", "commitReconciliationRequired", "cancel", "expire"]),
      generationPollIdempotency: store(["reserve", "lookup", "commitResult", "commitUnknown", "markConflict", "expire"]),
      outputIngestionIdempotency: store(["reserve", "lookup", "commitResult", "commitUnknown", "markConflict", "expire"]),
      finalResults: store(["commitIfAbsent", "read", "compareAndSet"]),
      apiIdempotency: store(["reserve", "lookup", "commitResult", "commitUnknown", "markConflict", "expire"]),
      resultReferences: store(["issueIfAbsent", "resolve", "revoke", "expire", "delete"]),
      restrictedInputs: store(["storeEncrypted", "resolveForAuthorizedUse", "revoke", "delete", "expire"]),
      originalInputs: store(["createIfAbsent", "read", "delete"]),
      authSessions: store(["resolve"]),
      csrf: store(["validate"]),
      audit: store(["append"]),
      outbox: store(["append", "claimBatch", "markDelivered"]),
    },
    providers: { runtimeVersion: "1.0" },
    security: {},
    observability: {},
    lifecycle: {
      runtimeVersion: "1.0",
      getStatus: () => "ready",
      validateReadiness: noResult,
      beginDrain: noResult,
      shutdown: noResult,
    },
  };
}

test("runtime validator accepts a complete structural contract graph", () => {
  const result = validateProductionWorkflowRuntime(validRuntimeShape());
  assert.equal(result.status, "valid");
});

test("runtime validator rejects missing bundles, unavailable gates, bad stores, and duplicates", () => {
  assert.deepEqual(validateProductionWorkflowRuntime(null), { status: "invalid", issues: ["not-an-object"] });
  assert.equal(validateProductionWorkflowRuntime({ runtimeVersion: "1.0" }).status, "invalid");
  const unavailable = validRuntimeShape();
  unavailable.capabilities = {};
  const unavailableResult = validateProductionWorkflowRuntime(unavailable);
  assert.equal(unavailableResult.status, "invalid");
  if (unavailableResult.status === "invalid") assert.equal(unavailableResult.issues.includes("required-capability-unavailable"), true);

  const missingMethod = validRuntimeShape();
  const stores = missingMethod.stores;
  if (typeof stores === "object" && stores !== null && "acceptedPersistence" in stores) stores.acceptedPersistence = { storeVersion: "1.0" };
  const missingMethodResult = validateProductionWorkflowRuntime(missingMethod);
  assert.equal(missingMethodResult.status, "invalid");
  if (missingMethodResult.status === "invalid") assert.equal(missingMethodResult.issues.includes("store-bundle-invalid"), true);

  const duplicate = validRuntimeShape();
  const duplicateStores = duplicate.stores;
  if (typeof duplicateStores === "object" && duplicateStores !== null && "materializationIdempotency" in duplicateStores && "generationIdempotency" in duplicateStores) {
    duplicateStores.generationIdempotency = duplicateStores.materializationIdempotency;
  }
  const duplicateResult = validateProductionWorkflowRuntime(duplicate);
  assert.equal(duplicateResult.status, "invalid");
  if (duplicateResult.status === "invalid") assert.equal(duplicateResult.issues.includes("duplicate-store-reference"), true);
});
