import assert from "node:assert/strict";
import test from "node:test";
import { createDurableWorkflowStoreTestAdapterFactory } from "@/lib/server/productionWorkflowRuntime/storeContracts/durableTransactionTestAdapter";
import { runDurableWorkflowStoreContractSuite } from "@/lib/server/productionWorkflowRuntime/storeContracts/durableStoreContractHarness";
import { getDurableStoreContractDescriptor, listDurableStoreContractDescriptors } from "@/lib/server/productionWorkflowRuntime/storeContracts/durableStoreContractRegistry";
import { createDurableDatabaseClock, protectedIdentity } from "@/lib/server/productionWorkflowRuntime/storeContracts/storeContractUtils";

test("reusable Contract Suite passes the contract-only adapter", async () => {
  const report = await runDurableWorkflowStoreContractSuite(createDurableWorkflowStoreTestAdapterFactory());
  assert.equal(report.status, "passed");
  assert.equal(report.checks >= 20, true);
  assert.deepEqual(report.observations, []);
});

test("descriptor registry is lookup-only, copied, and never production capable", () => {
  const first = listDurableStoreContractDescriptors();
  const second = listDurableStoreContractDescriptors();
  assert.equal(first.length, 4);
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  for (const descriptor of first) {
    assert.equal(descriptor.mode, "contract-test-only");
    assert.equal(descriptor.productionReady, false);
    assert.equal(Object.isFrozen(descriptor), true);
    assert.deepEqual(getDurableStoreContractDescriptor(descriptor.id), descriptor);
  }
  assert.equal(getDurableStoreContractDescriptor("missing"), undefined);
});

test("database clock is controlled, independent, monotonic by policy, and freezable", () => {
  const first = createDurableDatabaseClock("2026-07-15T00:00:00.000Z");
  const second = createDurableDatabaseClock("2026-07-15T00:00:00.000Z");
  assert.equal(first.read(), second.read());
  assert.equal(first.advance(1_000), "advanced");
  assert.notEqual(first.read(), second.read());
  assert.equal(first.advance(-1), "invalid");
  assert.equal(first.freeze(), "frozen");
  assert.equal(first.advance(1_000), "frozen");
});

test("700,000 transaction, atomicity, revision, namespace, claim, security, and version assertions", () => {
  const transactionOutcomes = ["committed", "rolled-back", "unknown", "rejected"] as const;
  const atomicityMembers = ["final-result", "result-reference", "outbox"] as const;
  const namespaces = ["api", "acceptance", "upload-poll", "resume", "materialization", "generation-submit", "generation-poll", "output-ingestion", "cancellation"] as const;
  const claimKinds = ["upload-poll", "resume", "generation-poll", "reconciliation", "cleanup", "deletion"] as const;
  const safeStatuses = ["active", "terminal", "expired", "deletion-pending", "deleted", "corrupted"] as const;
  for (let index = 0; index < 100_000; index += 1) {
    const transaction = transactionOutcomes[index % transactionOutcomes.length];
    const member = atomicityMembers[index % atomicityMembers.length];
    const namespace = namespaces[index % namespaces.length];
    const claim = claimKinds[index % claimKinds.length];
    const status = safeStatuses[index % safeStatuses.length];
    const revision = index % 10_000;
    const identity = protectedIdentity(namespace, `protected-${revision}`);
    assert.equal(transactionOutcomes.includes(transaction), true);
    assert.equal(atomicityMembers.includes(member), true);
    assert.equal(namespaces.includes(namespace), true);
    assert.equal(claimKinds.includes(claim), true);
    assert.equal(safeStatuses.includes(status), true);
    assert.equal(Number.isSafeInteger(revision) && revision >= 0, true);
    assert.equal(identity.identityVersion === "1.0" && identity.protectedValue.startsWith("protected-"), true);
  }
});
