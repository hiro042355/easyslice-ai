import assert from "node:assert/strict";
import test from "node:test";
import { createReferenceWorkflowTransactionManager } from "@/lib/server/productionWorkflowRuntime/referenceWorkflowTransactionManager";
import { transactionFailure, transactionSuccess } from "@/lib/server/productionWorkflowRuntime/transactionTypes";
import type { ProductionWorkflowClock } from "@/lib/server/productionWorkflowRuntime/types";

function clock(): ProductionWorkflowClock {
  let monotonic = 0;
  return Object.freeze({
    clockVersion: "1.0",
    nowUtc: () => "2026-07-15T00:00:00.000Z",
    monotonicMilliseconds: () => {
      monotonic += 1;
      return monotonic;
    },
  });
}

test("reference transaction descriptor never claims production durability", () => {
  const manager = createReferenceWorkflowTransactionManager(clock());
  assert.deepEqual(manager.descriptor, {
    descriptorVersion: "1.0",
    id: "reference-workflow-transaction-manager-v1",
    mode: "reference-contract-only",
    durable: false,
    crossInstance: false,
    productionReady: false,
    externalIoInsideTransaction: false,
  });
});

test("success commits and runs registered after-commit hooks", async () => {
  const manager = createReferenceWorkflowTransactionManager(clock());
  const effects: string[] = [];
  const result = await manager.runInTransaction((context) => {
    assert.equal(context.externalIoAllowed, false);
    assert.equal(context.registerAfterCommit(() => { effects.push("first"); }), "registered");
    assert.equal(context.registerAfterCommit(async () => { effects.push("second"); }), "registered");
    return transactionSuccess(Object.freeze({ value: "safe" }));
  });
  assert.deepEqual(result, {
    status: "committed",
    value: { value: "safe" },
    afterCommit: { status: "completed", hooksRun: 2 },
  });
  assert.deepEqual(effects, ["first", "second"]);
});

test("safe callback failures roll back with their exact safe classification", async () => {
  const failures = ["callback-failed", "serialization-conflict", "timeout", "unavailable", "unknown-outcome"] as const;
  for (const failure of failures) {
    const result = await createReferenceWorkflowTransactionManager(clock()).runInTransaction(() => transactionFailure(failure));
    assert.deepEqual(result, { status: "rolled-back", failure });
  }
});

test("sync throw and async rejection are mapped without raw errors", async () => {
  const syncResult = await createReferenceWorkflowTransactionManager(clock()).runInTransaction(() => {
    throw new Error("must-not-escape");
  });
  const asyncResult = await createReferenceWorkflowTransactionManager(clock()).runInTransaction(async () => {
    await Promise.resolve();
    throw new Error("must-not-escape");
  });
  assert.deepEqual(syncResult, { status: "rolled-back", failure: "callback-failed" });
  assert.deepEqual(asyncResult, { status: "rolled-back", failure: "callback-failed" });
  assert.equal(JSON.stringify([syncResult, asyncResult]).includes("must-not-escape"), false);
});

test("nested execution is rejected and instances remain isolated", async () => {
  const first = createReferenceWorkflowTransactionManager(clock());
  const second = createReferenceWorkflowTransactionManager(clock());
  const outer = await first.runInTransaction(async () => {
    const nested = await first.runInTransaction(() => transactionSuccess("nested"));
    const isolated = await second.runInTransaction(() => transactionSuccess("isolated"));
    assert.deepEqual(nested, { status: "rejected", failure: "nested-transaction" });
    assert.equal(isolated.status, "committed");
    return transactionSuccess("outer");
  });
  assert.equal(outer.status, "committed");
});

test("after-commit failure does not misreport a committed transaction as rolled back", async () => {
  const manager = createReferenceWorkflowTransactionManager(clock());
  const result = await manager.runInTransaction((context) => {
    context.registerAfterCommit(() => undefined);
    context.registerAfterCommit(() => {
      throw new Error("after-commit-detail");
    });
    return transactionSuccess("committed-value");
  });
  assert.deepEqual(result, {
    status: "committed",
    value: "committed-value",
    afterCommit: { status: "failed", hooksRun: 1, failure: "after-commit-failed" },
  });
  assert.equal(JSON.stringify(result).includes("after-commit-detail"), false);
});

test("closed context refuses late hooks and stopped manager refuses work", async () => {
  const manager = createReferenceWorkflowTransactionManager(clock());
  let lateRegistration: (() => "registered" | "context-closed") | undefined;
  const result = await manager.runInTransaction((context) => {
    lateRegistration = () => context.registerAfterCommit(() => undefined);
    return transactionSuccess("done");
  });
  assert.equal(result.status, "committed");
  assert.equal(lateRegistration?.(), "context-closed");
  assert.equal(manager.stop(), "stopped");
  assert.equal(manager.stop(), "already-stopped");
  assert.deepEqual(await manager.runInTransaction(() => transactionSuccess("late")), {
    status: "rejected",
    failure: "manager-stopped",
  });
});
