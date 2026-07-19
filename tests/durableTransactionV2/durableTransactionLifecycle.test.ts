import assert from "node:assert/strict";
import test from "node:test";
import {
  createDurableWorkflowTransactionManagerV2,
  durableTransactionFailure,
  durableTransactionSuccess,
} from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import type { DurableWorkflowTransactionContext } from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import { createClock, createSessionFactory, defaultOptions, emptyCommand } from "./durableTransactionTestHarness";

test("successful execution uses explicit database capability and commits once", async () => {
  const { factory, events } = createSessionFactory();
  const manager = createDurableWorkflowTransactionManagerV2(factory, createClock());
  const states: string[] = [];
  const result = await manager.runInTransaction(defaultOptions, async (context) => {
    states.push(context.state());
    assert.equal(context.externalIoAllowed, false);
    assert.deepEqual(Object.keys(context.database), ["capabilityVersion", "execute"]);
    assert.equal((await context.database.execute(emptyCommand)).status, "success");
    return durableTransactionSuccess("safe-value");
  });
  assert.deepEqual(result, { status: "committed", value: "safe-value", afterCommit: { status: "completed", hooksRun: 0 } });
  assert.deepEqual(states, ["active"]);
  assert.deepEqual(events, { begin: 1, execute: 1, commit: 1, rollback: 0, release: 1, discard: 0, commands: [emptyCommand] });
});

test("safe failure, throw, and rejection roll back without raw error disclosure", async () => {
  for (const operation of [
    () => durableTransactionFailure("retryable-conflict"),
    () => { throw new Error("raw-sync-detail"); },
    async () => { await Promise.resolve(); throw new Error("raw-async-detail"); },
  ]) {
    const { factory, events } = createSessionFactory();
    const result = await createDurableWorkflowTransactionManagerV2(factory, createClock()).runInTransaction(defaultOptions, operation);
    assert.equal(result.status, "rolled-back");
    assert.equal(events.rollback, 1);
    assert.equal(events.commit, 0);
    assert.equal(events.release, 1);
    assert.equal(JSON.stringify(result).includes("raw-"), false);
  }
});

test("query failure aborts the context and prevents commit", async () => {
  const { factory, events } = createSessionFactory({
    async execute() { events.execute += 1; return { status: "failure", failure: "read-only-violation", retryable: false }; },
  });
  const result = await createDurableWorkflowTransactionManagerV2(factory, createClock()).runInTransaction(defaultOptions, async (context) => {
    assert.equal((await context.database.execute(emptyCommand)).status, "failure");
    assert.equal((await context.database.execute(emptyCommand)).status, "failure");
    return durableTransactionSuccess("must-not-commit");
  });
  assert.deepEqual(result, { status: "rolled-back", failure: "transaction-aborted" });
  assert.equal(events.execute, 1);
  assert.equal(events.rollback, 1);
  assert.equal(events.commit, 0);
});

test("context expires after callback and late task cannot reach the session", async () => {
  const { factory, events } = createSessionFactory();
  let escaped: DurableWorkflowTransactionContext | undefined;
  const manager = createDurableWorkflowTransactionManagerV2(factory, createClock());
  const result = await manager.runInTransaction(defaultOptions, (context) => {
    escaped = context;
    return durableTransactionSuccess("done");
  });
  assert.equal(result.status, "committed");
  assert.equal(escaped?.state(), "expired");
  assert.deepEqual(await escaped?.database.execute(emptyCommand), { status: "failure", failure: "transaction-aborted", retryable: false });
  assert.equal(escaped?.registerAfterCommit(() => undefined), "context-expired");
  assert.equal(events.execute, 0);
});

test("deadline rejects new query and rolls back a callback that attempts to continue", async () => {
  const clock = createClock();
  const { factory, events } = createSessionFactory();
  const manager = createDurableWorkflowTransactionManagerV2(factory, clock);
  const result = await manager.runInTransaction(defaultOptions, async (context) => {
    clock.advance(2_000);
    assert.deepEqual(await context.database.execute(emptyCommand), { status: "failure", failure: "deadline-exceeded", retryable: false });
    return durableTransactionFailure("deadline-exceeded");
  });
  assert.deepEqual(result, { status: "rolled-back", failure: "deadline-exceeded" });
  assert.equal(events.execute, 0);
});

test("commit unknown discards and never runs after-commit hooks", async () => {
  const effects: string[] = [];
  const { factory, events } = createSessionFactory({
    async commit() { events.commit += 1; return { status: "unknown-outcome" }; },
  });
  const result = await createDurableWorkflowTransactionManagerV2(factory, createClock()).runInTransaction(defaultOptions, (context) => {
    context.registerAfterCommit(() => { effects.push("must-not-run"); });
    return durableTransactionSuccess("hidden");
  });
  assert.deepEqual(result, { status: "commit-unknown", failure: "unknown-outcome" });
  assert.deepEqual(effects, []);
  assert.equal(events.discard, 1);
  assert.equal(events.release, 0);
});

test("rollback failure discards and does not expose callback value", async () => {
  const { factory, events } = createSessionFactory({
    async rollback() { events.rollback += 1; return { status: "rollback-failed" }; },
  });
  const result = await createDurableWorkflowTransactionManagerV2(factory, createClock()).runInTransaction(defaultOptions, () => durableTransactionFailure("callback-failed"));
  assert.deepEqual(result, { status: "rolled-back", failure: "rollback-failed" });
  assert.equal(events.discard, 1);
  assert.equal(events.release, 0);
});

test("after-commit runs in registration order and failure stays committed", async () => {
  const effects: string[] = [];
  const { factory } = createSessionFactory();
  const result = await createDurableWorkflowTransactionManagerV2(factory, createClock()).runInTransaction(defaultOptions, (context) => {
    context.registerAfterCommit(() => { effects.push("first"); });
    context.registerAfterCommit(() => { throw new Error("secondary-detail"); });
    context.registerAfterCommit(() => { effects.push("not-run"); });
    return durableTransactionSuccess("committed");
  });
  assert.deepEqual(result, { status: "committed", value: "committed", afterCommit: { status: "failed", hooksRun: 1, failure: "after-commit-failed" } });
  assert.deepEqual(effects, ["first"]);
  assert.equal(JSON.stringify(result).includes("secondary-detail"), false);
});

test("disposed manager rejects new work without acquiring a session", async () => {
  let acquires = 0;
  const manager = createDurableWorkflowTransactionManagerV2(Object.freeze({ async acquire() { acquires += 1; return { status: "unavailable" }; } }), createClock());
  assert.equal(manager.dispose(), "disposed");
  assert.equal(manager.dispose(), "already-disposed");
  assert.equal(manager.state(), "disposed");
  assert.deepEqual(await manager.runInTransaction(defaultOptions, () => durableTransactionSuccess("late")), { status: "rejected", failure: "manager-disposed" });
  assert.equal(acquires, 0);
});
