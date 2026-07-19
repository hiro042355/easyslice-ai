import assert from "node:assert/strict";
import test from "node:test";
import { createDurableWorkflowStoreTestAdapterFactory } from "@/lib/server/productionWorkflowRuntime/storeContracts/durableTransactionTestAdapter";
import { protectedIdentity } from "@/lib/server/productionWorkflowRuntime/storeContracts/storeContractUtils";

const factory = createDurableWorkflowStoreTestAdapterFactory();

test("transaction success, safe failure, throw, rejection, nesting, hooks, and context lifetime", async () => {
  const environment = await factory.createEnvironment();
  let escapedSet: (() => "staged" | "closed") | undefined;
  const success = await environment.transaction.run((context) => {
    assert.equal(context.externalIoAllowed, false);
    escapedSet = () => context.set(protectedIdentity("record", "escaped"), {
      recordVersion: "1.0", identity: protectedIdentity("record", "escaped"), revision: 0, status: "active", legalHold: false, valueClass: "safe", orderedValues: [],
    });
    return { status: "success", value: "committed" };
  });
  assert.deepEqual(success, { status: "committed", value: "committed", afterCommit: "completed" });
  assert.equal(escapedSet?.(), "closed");
  assert.deepEqual(await environment.transaction.run(() => ({ status: "failure" })), { status: "rolled-back", reason: "safe-failure" });
  assert.deepEqual(await environment.transaction.run(() => { throw new Error("private"); }), { status: "rolled-back", reason: "callback-failed" });
  assert.deepEqual(await environment.transaction.run(async () => { await Promise.resolve(); throw new Error("private"); }), { status: "rolled-back", reason: "callback-failed" });
  const outer = await environment.transaction.run(async () => {
    assert.deepEqual(await environment.transaction.run(() => ({ status: "success", value: "nested" })), { status: "rejected", reason: "nested" });
    return { status: "success", value: "outer" };
  });
  assert.equal(outer.status, "committed");
});

test("after-commit failure remains committed and begin/commit/rollback failures are safe", async () => {
  const environment = await factory.createEnvironment();
  const hook = await environment.transaction.run((context) => {
    context.registerAfterCommit(() => { throw new Error("private-hook"); });
    return { status: "success", value: "business-committed" };
  });
  assert.deepEqual(hook, { status: "committed", value: "business-committed", afterCommit: "failed" });
  assert.equal(JSON.stringify(hook).includes("private-hook"), false);
  environment.failures.inject("transaction-begin", "unavailable");
  assert.deepEqual(await environment.transaction.run(() => ({ status: "success", value: "none" })), { status: "rolled-back", reason: "begin-unavailable" });
  environment.failures.inject("transaction-commit", "definite-failure");
  assert.deepEqual(await environment.transaction.run(() => ({ status: "success", value: "none" })), { status: "rolled-back", reason: "commit-failed" });
  environment.failures.inject("transaction-rollback", "definite-failure");
  assert.deepEqual(await environment.transaction.run(() => ({ status: "failure" })), { status: "rolled-back", reason: "rollback-failed" });
  environment.failures.inject("transaction-commit", "unknown-outcome", "still-unknown");
  assert.deepEqual(await environment.transaction.run(() => ({ status: "success", value: "unknown" })), { status: "unknown" });
});

test("fresh environments isolate state, failures, clock, and disposal", async () => {
  const first = await factory.createEnvironment();
  const second = await factory.createEnvironment();
  first.failures.inject("record-read", "unavailable");
  first.clock.advance(5_000);
  assert.notEqual(first.clock.read(), second.clock.read());
  assert.equal(second.failures.consume("record-read"), undefined);
  assert.equal(await first.dispose(), "disposed");
  assert.equal(await first.dispose(), "already-disposed");
  assert.deepEqual(await first.transaction.run(() => ({ status: "success", value: "late" })), { status: "rejected", reason: "disposed" });
});
