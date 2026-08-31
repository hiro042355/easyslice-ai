import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createReferenceWorkflowBrowserSessionStore,
} from "@/lib/workflowUi/referenceWorkflowBrowserSessionStore";
import type { WorkflowUiRecoverySessionV2 } from "@/lib/workflowUi/types";

const PARTITION_A = "opaque-auth-session-a-0001";
const PARTITION_B = "opaque-auth-session-b-0002";
const CREATED = "2026-08-31T00:00:00.000Z";
const BASELINE = "2026-08-31T00:10:00.000Z";
const EXPIRES = "2026-08-31T00:30:00.000Z";

type Failure = "read" | "write" | "delete";

class FakeStorage {
  readonly values = new Map<string, string>();
  readonly calls = { read: 0, write: 0, delete: 0 };
  failure?: Failure;

  getItem(key: string) {
    this.calls.read += 1;
    if (this.failure === "read") throw new DOMException("closed", "SecurityError");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.calls.write += 1;
    if (this.failure === "write") throw new DOMException("closed", "QuotaExceededError");
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.calls.delete += 1;
    if (this.failure === "delete") throw new DOMException("closed", "SecurityError");
    this.values.delete(key);
  }
}

const reference = <K extends "upload-pending" | "generation-job" | "workflow-result">(kind: K, value = "opaque-reference") => ({
  referenceVersion: "1.0" as const,
  kind,
  reference: value,
});

const session = (
  kind: "upload-pending" | "generation-job" | "workflow-result" = "upload-pending",
): WorkflowUiRecoverySessionV2 => {
  const common = { sessionVersion: "2.0" as const, operation: "generate-mv" as const, createdAt: CREATED, expiresAt: EXPIRES };
  if (kind === "upload-pending") return { ...common, reference: reference(kind), lastServerStatus: "pending-upload", pollAttempts: 3 };
  if (kind === "generation-job") return { ...common, reference: reference(kind), lastServerStatus: "pending-generation", pollAttempts: 3 };
  return { ...common, reference: reference(kind), lastServerStatus: "completed", pollAttempts: 0 };
};

const make = (storage: FakeStorage | undefined, identityPartition: string | undefined = PARTITION_A) =>
  createReferenceWorkflowBrowserSessionStore({ storage, identityPartition });

const onlyKey = (storage: FakeStorage) => {
  assert.equal(storage.values.size, 1);
  return [...storage.values.keys()][0]!;
};

test("persists exact Session V2 fields and reloads through a new adapter", () => {
  const storage = new FakeStorage();
  const first = make(storage);
  const value = session();
  assert.deepEqual(first.save(value), { status: "saved" });

  const key = onlyKey(storage);
  assert.match(key, /opaque-auth-session-a-0001/);
  const serialized = storage.values.get(key)!;
  assert.equal(serialized.includes(PARTITION_A), false);
  const body = JSON.parse(serialized);
  assert.deepEqual(Object.keys(body), ["sessionVersion", "operation", "reference", "lastServerStatus", "pollAttempts", "createdAt", "expiresAt"]);
  assert.deepEqual(Object.keys(body.reference), ["referenceVersion", "kind", "reference"]);

  const second = make(storage);
  assert.deepEqual(second.load(BASELINE), { status: "loaded", session: value });
  assert.equal((second.load(BASELINE) as { session: typeof value }).session.pollAttempts, 3);
});

test("supports each exact V2 recovery reference/status pairing", () => {
  for (const kind of ["upload-pending", "generation-job", "workflow-result"] as const) {
    const storage = new FakeStorage();
    const store = make(storage);
    const value = session(kind);
    assert.deepEqual(store.save(value), { status: "saved" });
    assert.deepEqual(store.load(BASELINE), { status: "loaded", session: value });
  }
});

test("rejects expiry at or before the baseline and cleans once", () => {
  for (const baseline of [EXPIRES, "2026-08-31T00:31:00.000Z"]) {
    const storage = new FakeStorage();
    const store = make(storage);
    assert.deepEqual(store.save(session()), { status: "saved" });
    assert.deepEqual(store.load(baseline), { status: "expired" });
    assert.equal(storage.calls.delete, 1);
    assert.equal(storage.values.size, 0);
  }
});

test("rejects invalid UTC/order without writing", () => {
  for (const value of [
    { ...session(), createdAt: "not-utc" },
    { ...session(), expiresAt: CREATED },
  ]) {
    const storage = new FakeStorage();
    assert.deepEqual(make(storage).save(value), { status: "invalid" });
    assert.equal(storage.calls.write, 0);
  }
});

test("malformed JSON and unsupported schema fail closed with one cleanup attempt", () => {
  for (const serialized of ["{", JSON.stringify({ ...session(), sessionVersion: "3.0" })]) {
    const storage = new FakeStorage();
    assert.deepEqual(make(storage).save(session()), { status: "saved" });
    storage.values.set(onlyKey(storage), serialized);
    assert.deepEqual(make(storage).load(BASELINE), { status: "invalid" });
    assert.equal(storage.calls.delete, 1);
  }
});

test("extra, restricted, and invalid reference/status fields are never partially accepted", () => {
  const invalidValues = [
    { ...session(), accessToken: "forbidden" },
    { ...session(), idempotencyKey: "forbidden" },
    { ...session(), assets: [] },
    { ...session(), reference: { ...reference("upload-pending"), signedUrl: "forbidden" } },
    { ...session(), reference: reference("generation-job"), lastServerStatus: "pending-upload" },
  ];
  for (const value of invalidValues) {
    const storage = new FakeStorage();
    assert.deepEqual(make(storage).save(value as ReturnType<typeof session>), { status: "invalid" });
    assert.equal(storage.values.size, 0);
  }
});

test("a persisted record injected with extra fields is rejected and cleaned once", () => {
  const storage = new FakeStorage();
  const store = make(storage);
  assert.deepEqual(store.save(session()), { status: "saved" });
  const key = onlyKey(storage);
  storage.values.set(key, JSON.stringify({ ...session(), csrf: "forbidden" }));
  assert.deepEqual(store.load(BASELINE), { status: "invalid" });
  assert.equal(storage.calls.delete, 1);
  assert.equal(storage.values.size, 0);
});

test("opaque partitions isolate logout, account switch, and tenant switch", () => {
  const storage = new FakeStorage();
  const first = make(storage, PARTITION_A);
  assert.deepEqual(first.save(session()), { status: "saved" });
  assert.deepEqual(make(storage, PARTITION_B).load(BASELINE), { status: "empty" });
  assert.deepEqual(first.delete(), { status: "deleted" });
  assert.deepEqual(first.load(BASELINE), { status: "empty" });
});

test("anonymous, missing storage, and invalid partitions disable persistent recovery", () => {
  for (const store of [
    make(undefined),
    createReferenceWorkflowBrowserSessionStore({ storage: new FakeStorage() }),
    make(new FakeStorage(), "raw"),
  ]) {
    assert.deepEqual(store.save(session()), { status: "invalid" });
    assert.deepEqual(store.load(BASELINE), { status: "empty" });
    assert.deepEqual(store.delete(), { status: "invalid" });
  }
});

test("read failure disables the adapter without a memory fallback", () => {
  const storage = new FakeStorage();
  const store = make(storage);
  storage.failure = "read";
  assert.deepEqual(store.load(BASELINE), { status: "invalid" });
  storage.failure = undefined;
  assert.deepEqual(store.save(session()), { status: "invalid" });
  assert.equal(storage.calls.write, 0);
});

test("write/quota failure disables persistence while returning the existing invalid result", () => {
  const storage = new FakeStorage();
  const store = make(storage);
  storage.failure = "write";
  assert.deepEqual(store.save(session()), { status: "invalid" });
  storage.failure = undefined;
  assert.deepEqual(store.save(session()), { status: "invalid" });
  assert.deepEqual(store.load(BASELINE), { status: "invalid" });
  assert.equal(storage.calls.write, 1);
});

test("delete failure never claims deletion and disables the adapter", () => {
  const storage = new FakeStorage();
  const store = make(storage);
  assert.deepEqual(store.save(session()), { status: "saved" });
  storage.failure = "delete";
  assert.deepEqual(store.delete(), { status: "invalid" });
  storage.failure = undefined;
  assert.deepEqual(store.load(BASELINE), { status: "invalid" });
  assert.equal(storage.values.size, 1);
});

test("failed invalid-record cleanup is attempted once and latches persistence disabled", () => {
  const storage = new FakeStorage();
  const store = make(storage);
  assert.deepEqual(store.save(session()), { status: "saved" });
  storage.values.set(onlyKey(storage), "{");
  storage.failure = "delete";
  assert.deepEqual(store.load(BASELINE), { status: "invalid" });
  storage.failure = undefined;
  assert.deepEqual(store.load(BASELINE), { status: "invalid" });
  assert.equal(storage.calls.delete, 1);
});

test("tab-local storage ports are independent and copied stale data remains only a hint", () => {
  const firstTab = new FakeStorage();
  const secondTab = new FakeStorage();
  assert.deepEqual(make(firstTab).save(session("workflow-result")), { status: "saved" });
  assert.deepEqual(make(secondTab).load(BASELINE), { status: "empty" });

  secondTab.values.set(onlyKey(firstTab), [...firstTab.values.values()][0]!);
  const loaded = make(secondTab).load(BASELINE);
  assert.equal(loaded.status, "loaded");
});

test("serialization contains no forbidden product, identity, credential, input, or asset fields", () => {
  const storage = new FakeStorage();
  assert.deepEqual(make(storage).save(session()), { status: "saved" });
  const serialized = storage.values.get(onlyKey(storage))!;
  for (const forbidden of [
    "token", "cookie", "authorization", "csrf", "idempotency", "account", "tenant", "userId",
    "prompt", "story", "lyrics", "scene", "filename", "provider", "credential", "asset", "signedUrl", "billing", "error",
  ]) assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
});

test("V2 ownership and public contracts remain outside the browser adapter", () => {
  const hook = readFileSync("hooks/useReferenceWorkflowController.ts", "utf8");
  const holder = readFileSync("hooks/referenceWorkflowControllerHolder.ts", "utf8");
  const controller = readFileSync("lib/workflowUi/referenceWorkflowController.ts", "utf8");
  const types = readFileSync("lib/workflowUi/types.ts", "utf8");
  const adapter = readFileSync("lib/workflowUi/referenceWorkflowBrowserSessionStore.ts", "utf8");
  assert.doesNotMatch(hook + holder + controller, /referenceWorkflowBrowserSessionStore/);
  assert.doesNotMatch(types, /BrowserSession|sessionStorage|identityPartition/);
  assert.match(controller, /recover\(\)[\s\S]*sessionStore\.load/);
  assert.match(controller, /query\(session\.reference\)/);
  assert.doesNotMatch(adapter, /BroadcastChannel|addEventListener|navigator\.locks|fetch\(|@\/lib\/server|provider/i);
});
