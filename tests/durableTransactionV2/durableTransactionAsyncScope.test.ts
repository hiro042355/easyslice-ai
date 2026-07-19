import assert from "node:assert/strict";
import test from "node:test";
import { createDurableWorkflowTransactionManagerV2, durableTransactionSuccess } from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import { createClock, createSessionFactory, defaultOptions } from "./durableTransactionTestHarness";

test("same manager nested transaction is rejected before checkout", async () => {
  const { factory, events } = createSessionFactory();
  const manager = createDurableWorkflowTransactionManagerV2(factory, createClock());
  const outer = await manager.runInTransaction(defaultOptions, async () => {
    await Promise.resolve();
    const nested = await manager.runInTransaction(defaultOptions, () => durableTransactionSuccess("nested"));
    assert.deepEqual(nested, { status: "rejected", failure: "nested-transaction" });
    return durableTransactionSuccess("outer");
  });
  assert.equal(outer.status, "committed");
  assert.equal(events.begin, 1);
});

test("independent Promise.all transactions on one manager are allowed", async () => {
  let acquires = 0;
  let active = 0;
  let maximumActive = 0;
  let releaseBarrier: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });
  const factory = Object.freeze({
    async acquire() {
      acquires += 1;
      const { factory: inner } = createSessionFactory();
      return inner.acquire();
    },
  });
  const manager = createDurableWorkflowTransactionManagerV2(factory, createClock());
  const operation = async (value: string) => manager.runInTransaction(defaultOptions, async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    if (active === 2) releaseBarrier?.();
    await barrier;
    active -= 1;
    return durableTransactionSuccess(value);
  });
  const [first, second] = await Promise.all([operation("first"), operation("second")]);
  assert.equal(first.status, "committed");
  assert.equal(second.status, "committed");
  assert.equal(acquires, 2);
  assert.equal(maximumActive, 2);
});

test("manager instances own isolated async scopes", async () => {
  const first = createDurableWorkflowTransactionManagerV2(createSessionFactory().factory, createClock());
  const secondHarness = createSessionFactory();
  const second = createDurableWorkflowTransactionManagerV2(secondHarness.factory, createClock());
  const result = await first.runInTransaction(defaultOptions, async () => {
    const isolated = await second.runInTransaction(defaultOptions, () => durableTransactionSuccess("isolated"));
    assert.equal(isolated.status, "committed");
    return durableTransactionSuccess("outer");
  });
  assert.equal(result.status, "committed");
  assert.equal(secondHarness.events.begin, 1);
});
