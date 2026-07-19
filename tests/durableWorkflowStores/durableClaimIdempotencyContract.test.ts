import assert from "node:assert/strict";
import test from "node:test";
import { createDurableWorkflowStoreTestAdapterFactory } from "@/lib/server/productionWorkflowRuntime/storeContracts/durableTransactionTestAdapter";
import { protectedIdentity } from "@/lib/server/productionWorkflowRuntime/storeContracts/storeContractUtils";
import type { DurableContractRecord } from "@/lib/server/productionWorkflowRuntime/storeContracts/types";

const factory = createDurableWorkflowStoreTestAdapterFactory();
const record = (id: string, status: DurableContractRecord["status"] = "active"): DurableContractRecord => Object.freeze({ recordVersion: "1.0", identity: protectedIdentity("job", id), revision: 0, status, legalHold: false, valueClass: "generation-job", orderedValues: Object.freeze([]) });

test("idempotency reserve, replay, conflict, result, unknown, unavailable, and shared races", async () => {
  const environments = await factory.createSharedEnvironments(2);
  const [first, second] = environments;
  assert.ok(first && second);
  const identity = protectedIdentity("generation-submit", "protected-key");
  const fingerprint = protectedIdentity("fingerprint", "protected-fingerprint");
  const [a, b] = await Promise.all([first.idempotency.reserve(identity, fingerprint), second.idempotency.reserve(identity, fingerprint)]);
  assert.equal([a.status, b.status].includes("reserved"), true);
  assert.equal([a.status, b.status].includes("existing-same"), true);
  assert.equal((await first.idempotency.reserve(identity, protectedIdentity("fingerprint", "different"))).status, "different-fingerprint");
  assert.deepEqual(await first.idempotency.commitResult(identity, "safe-terminal"), { status: "existing-same", state: "result", resultClass: "safe-terminal" });
  const replay = await second.idempotency.lookup(identity);
  assert.equal((replay.status === "reserved" || replay.status === "existing-same") && replay.state === "result", true);
  const unknown = protectedIdentity("generation-submit", "unknown-key");
  await first.idempotency.reserve(unknown, fingerprint);
  const committedUnknown = await first.idempotency.commitUnknown(unknown);
  const lookedUpUnknown = await second.idempotency.lookup(unknown);
  assert.equal((committedUnknown.status === "reserved" || committedUnknown.status === "existing-same") && committedUnknown.state === "unknown", true);
  assert.equal((lookedUpUnknown.status === "reserved" || lookedUpUnknown.status === "existing-same") && lookedUpUnknown.state === "unknown", true);
  first.failures.inject("idempotency-reserve", "unavailable");
  assert.equal((await first.idempotency.reserve(protectedIdentity("api", "unavailable"), fingerprint)).status, "unavailable");
});

test("claim and lease fencing coordinate shared instances without enabling submit", async () => {
  const environments = await factory.createSharedEnvironments(2);
  const [first, second] = environments;
  assert.ok(first && second);
  const job = record("shared-claim");
  await first.records.create(job);
  const ownerA = protectedIdentity("owner", "worker-a");
  const ownerB = protectedIdentity("owner", "worker-b");
  const [a, b] = await Promise.all([
    first.claims.acquire(job.identity, ownerA, "2026-07-15T00:00:10.000Z"),
    second.claims.acquire(job.identity, ownerB, "2026-07-15T00:00:10.000Z"),
  ]);
  const winner = a.status === "acquired" ? a : b;
  const loser = a.status === "acquired" ? b : a;
  assert.equal(winner.status, "acquired");
  assert.equal(loser.status, "conflict");
  if (winner.status !== "acquired") return;
  assert.equal(winner.lease.providerSubmitPermitted, false);
  assert.equal((await first.claims.renew(winner.lease, "2026-07-15T00:00:20.000Z")).status, "renewed");
  assert.equal((await second.claims.release({ ...winner.lease, fencingRevision: winner.lease.fencingRevision + 1 })).status, "stale-fence");
});

test("lease expiry allows fenced takeover but never blind Provider resubmit", async () => {
  const environment = await factory.createEnvironment();
  const job = record("expiry");
  await environment.records.create(job);
  const first = await environment.claims.acquire(job.identity, protectedIdentity("owner", "first"), "2026-07-15T00:00:01.000Z");
  assert.equal(first.status, "acquired");
  environment.clock.advance(2_000);
  if (first.status !== "acquired") return;
  assert.equal((await environment.claims.renew(first.lease, "2026-07-15T00:00:05.000Z")).status, "expired");
  const takeover = await environment.claims.acquire(job.identity, protectedIdentity("owner", "second"), "2026-07-15T00:00:10.000Z");
  assert.equal(takeover.status, "acquired");
  if (takeover.status === "acquired") {
    assert.equal(takeover.lease.fencingRevision > first.lease.fencingRevision, true);
    assert.equal(takeover.lease.providerSubmitPermitted, false);
  }
});

test("terminal and deleted records reject claims", async () => {
  const environment = await factory.createEnvironment();
  const terminal = record("terminal", "terminal");
  const deleted = record("deleted", "deleted");
  await environment.records.create(terminal);
  await environment.records.create(deleted);
  const owner = protectedIdentity("owner", "worker");
  assert.equal((await environment.claims.acquire(terminal.identity, owner, "2026-07-15T00:00:10.000Z")).status, "terminal");
  assert.equal((await environment.claims.acquire(deleted.identity, owner, "2026-07-15T00:00:10.000Z")).status, "deleted");
});
