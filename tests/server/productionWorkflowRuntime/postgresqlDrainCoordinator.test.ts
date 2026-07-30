import assert from "node:assert/strict";
import test from "node:test";

import {
  PostgreSQLDrainCoordinator,
} from "../../../lib/server/productionWorkflowRuntime/postgresqlDriver";

const tracked = (
  coordinator: PostgreSQLDrainCoordinator,
  discarded: string[],
  identity: string,
) => coordinator.register({
  discard: () => void discarded.push(identity),
});

test("zero checked-out connections drain immediately", async () => {
  const coordinator = new PostgreSQLDrainCoordinator();
  assert.deepEqual(await coordinator.drain(1_000), {
    status: "drained",
    discardedCount: 0,
  });
});

test("one checked-out connection completes drain on release without polling", async () => {
  const coordinator = new PostgreSQLDrainCoordinator();
  const discarded: string[] = [];
  const registration = tracked(coordinator, discarded, "one");
  const draining = coordinator.drain(1_000);
  registration.release();
  assert.deepEqual(await draining, {
    status: "drained",
    discardedCount: 0,
  });
  assert.deepEqual(discarded, []);
});

test("multiple connections wait for the final release", async () => {
  const coordinator = new PostgreSQLDrainCoordinator();
  const discarded: string[] = [];
  const first = tracked(coordinator, discarded, "first");
  const second = tracked(coordinator, discarded, "second");
  const draining = coordinator.drain(1_000);
  first.release();
  assert.equal(coordinator.count(), 1);
  second.release();
  assert.deepEqual(await draining, {
    status: "drained",
    discardedCount: 0,
  });
  assert.equal(coordinator.count(), 0);
});

test("zero deadline force-discards every remaining connection", async () => {
  const coordinator = new PostgreSQLDrainCoordinator();
  const discarded: string[] = [];
  const first = tracked(coordinator, discarded, "first");
  const second = tracked(coordinator, discarded, "second");
  assert.deepEqual(await coordinator.drain(0), {
    status: "drain-timeout",
    discardedCount: 2,
  });
  assert.deepEqual(discarded, ["first", "second"]);
  assert.equal(coordinator.count(), 0);
  first.release();
  second.release();
  assert.equal(coordinator.count(), 0);
  assert.deepEqual(discarded, ["first", "second"]);
});

test("duplicate release never makes tracking negative", async () => {
  const coordinator = new PostgreSQLDrainCoordinator();
  const registration = tracked(coordinator, [], "one");
  registration.release();
  registration.release();
  assert.equal(coordinator.count(), 0);
  assert.deepEqual(await coordinator.drain(0), {
    status: "drained",
    discardedCount: 0,
  });
});
