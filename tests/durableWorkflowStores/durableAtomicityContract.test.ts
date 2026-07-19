import assert from "node:assert/strict";
import test from "node:test";
import { createDurableWorkflowStoreTestAdapterFactory } from "@/lib/server/productionWorkflowRuntime/storeContracts/durableTransactionTestAdapter";
import { protectedIdentity } from "@/lib/server/productionWorkflowRuntime/storeContracts/storeContractUtils";
import type { DurableContractAtomicGroup, DurableContractRecord } from "@/lib/server/productionWorkflowRuntime/storeContracts/types";

const factory = createDurableWorkflowStoreTestAdapterFactory();
const record = (id: string, status: DurableContractRecord["status"] = "terminal", revision = 1): DurableContractRecord => Object.freeze({ recordVersion: "1.0", identity: protectedIdentity("result", id), revision, status, legalHold: false, valueClass: "completed-safe-result", orderedValues: Object.freeze(["asset-a", "asset-b"]) });
const group = (id: string): DurableContractAtomicGroup => Object.freeze({ groupVersion: "1.0", result: record(id), referenceIndex: protectedIdentity("reference-index", `reference-${id}`), outboxEvent: protectedIdentity("outbox-event", `event-${id}`), outboxPayload: Object.freeze({ eventClass: "workflow-terminal", resultClass: "completed" }) });

test("Final Result, Result Reference, and Outbox commit and remain mutation-isolated", async () => {
  const environment = await factory.createEnvironment();
  const input = group("success");
  assert.deepEqual(await environment.atomic.commit(input), { status: "committed" });
  const result = await environment.atomic.readResult(input.result.identity);
  const reference = await environment.atomic.resolveReference(input.referenceIndex);
  const outbox = await environment.atomic.readOutbox(input.outboxEvent);
  assert.equal(result.status, "found");
  assert.equal(reference.status, "found");
  assert.equal(outbox.status, "found");
  if (result.status === "found") {
    assert.deepEqual(result.record.orderedValues, ["asset-a", "asset-b"]);
    assert.notEqual(result.record, input.result);
  }
});

test("any group write failure exposes none of the three records", async () => {
  for (const operation of ["reference-issue", "outbox-append"] as const) {
    const environment = await factory.createEnvironment();
    const input = group(operation);
    environment.failures.inject(operation, "definite-failure");
    assert.deepEqual(await environment.atomic.commit(input), { status: "rolled-back", reason: "write-failed" });
    assert.equal((await environment.atomic.readResult(input.result.identity)).status, "not-found");
    assert.equal((await environment.atomic.resolveReference(input.referenceIndex)).status, "not-found");
    assert.equal((await environment.atomic.readOutbox(input.outboxEvent)).status, "not-found");
  }
});

test("commit unknown requires lookup and never reports rollback", async () => {
  for (const resolution of ["committed", "not-committed", "still-unknown"] as const) {
    const environment = await factory.createEnvironment();
    const input = group(resolution);
    environment.failures.inject("transaction-commit", "unknown-outcome", resolution);
    assert.deepEqual(await environment.atomic.commit(input), { status: "unknown" });
    assert.deepEqual(await environment.atomic.resolveUnknown(input.result.identity), { status: resolution });
    const expected = resolution === "committed" ? "found" : "not-found";
    assert.equal((await environment.atomic.readResult(input.result.identity)).status, expected);
    assert.equal((await environment.atomic.resolveReference(input.referenceIndex)).status, expected);
    assert.equal((await environment.atomic.readOutbox(input.outboxEvent)).status, expected);
  }
});

test("CAS increments revision and rejects stale, future, and terminal writes", async () => {
  const environment = await factory.createEnvironment();
  const base = record("cas", "active", 0);
  assert.equal((await environment.records.create(base)).status, "created");
  assert.equal((await environment.records.cas(base.identity, 0, record("cas", "active", 1))).status, "updated");
  assert.equal((await environment.records.cas(base.identity, 0, record("cas", "active", 1))).status, "conflict");
  assert.equal((await environment.records.cas(base.identity, 7, record("cas", "active", 8))).status, "conflict");
  assert.equal((await environment.records.cas(base.identity, 1, record("cas", "terminal", 2))).status, "updated");
  assert.equal((await environment.records.cas(base.identity, 2, record("cas", "active", 3))).status, "terminal");
});

test("deletion respects legal hold and deleted records cannot be read as active", async () => {
  const environment = await factory.createEnvironment();
  const active = record("delete", "active", 0);
  const held = Object.freeze({ ...record("held", "active", 0), legalHold: true });
  await environment.records.create(active);
  await environment.records.create(held);
  assert.equal((await environment.records.delete(held.identity)).status, "conflict");
  assert.equal((await environment.records.delete(active.identity)).status, "updated");
  assert.equal((await environment.records.read(active.identity)).status, "deleted");
});
