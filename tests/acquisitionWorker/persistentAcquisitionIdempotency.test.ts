import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ACQUISITION_CONTROL_PREFIX,
  PersistentAcquisitionIdempotencyStore,
  acquisitionControlObjectName,
  validateAcquisitionControlRecord,
  type AcquisitionControlObjectStore,
  type AcquisitionControlRecord,
} from "../../lib/server/acquisitionWorker/persistentIdempotency";
import { AcquisitionWorkerFailure, type AcquisitionResult } from "../../lib/server/acquisitionWorker/types";
import {
  GcsAcquisitionControlObjectStore,
  createMetadataAccessTokenSupplier,
  readProductionAcquisitionControlConfiguration,
} from "../../lib/server/acquisitionWorker/gcsControlStore";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const ID2 = "223e4567-e89b-42d3-a456-426614174000";
const success = (id = ID): AcquisitionResult => Object.freeze({ acquisitionId: id, status: "succeeded",
  artifactReference: `acquisition:${id}`, media: Object.freeze({ contentType: "video/mp4", byteSize: 4,
    durationSeconds: 10, hasVideo: true, hasAudio: true }) });
const failure = (id: string, code: "youtube-bot-check" | "network-failure", retryable: boolean): AcquisitionResult =>
  Object.freeze({ acquisitionId: id, status: "failed", errorCode: code, retryable });

class FakeObjects implements AcquisitionControlObjectStore {
  readonly values = new Map<string, { generation: string; record: AcquisitionControlRecord }>();
  writes = 0;
  create(name: string, record: AcquisitionControlRecord) {
    if (this.values.has(name)) return Promise.resolve({ status: "exists" as const });
    this.writes += 1;
    const generation = String(this.writes);
    this.values.set(name, { generation, record });
    return Promise.resolve({ status: "created" as const, generation });
  }
  read(name: string) {
    const value = this.values.get(name);
    return Promise.resolve(value
      ? { status: "found" as const, object: Object.freeze({ generation: value.generation, record: value.record }) }
      : { status: "missing" as const });
  }
  replace(name: string, expected: string, record: AcquisitionControlRecord) {
    const value = this.values.get(name);
    if (!value || value.generation !== expected) return Promise.resolve({ status: "precondition-failed" as const });
    this.writes += 1;
    const generation = String(this.writes);
    this.values.set(name, { generation, record });
    return Promise.resolve({ status: "updated" as const, generation });
  }
}

const store = (objects: FakeObjects) => new PersistentAcquisitionIdempotencyStore(objects, undefined, 200, 50, 5);

test("first claim, concurrent same-fingerprint replay, restart replay, and conflict are persistent", async () => {
  const objects = new FakeObjects();
  let operations = 0;
  const firstStore = store(objects);
  const operation = async () => { operations += 1; await new Promise((resolve) => setTimeout(resolve, 25)); return success(); };
  const [first, concurrent] = await Promise.all([
    firstStore.execute(ID, "canonical-youtube-request", operation),
    store(objects).execute(ID, "canonical-youtube-request", operation),
  ]);
  assert.deepEqual(first, success());
  assert.deepEqual(concurrent, success());
  assert.equal(operations, 1);
  assert.deepEqual(await store(objects).execute(ID, "canonical-youtube-request", async () => { throw new Error("must-not-run"); }), success());
  await assert.rejects(store(objects).execute(ID, "different-request", async () => success()),
    (error: unknown) => error instanceof AcquisitionWorkerFailure && error.code === "idempotency-conflict");
});

test("terminal bot-check is replayed while retryable failure requires an explicit delayed reclaim", async () => {
  const objects = new FakeObjects();
  const terminal = failure(ID, "youtube-bot-check", false);
  assert.deepEqual(await store(objects).execute(ID, "a", async () => terminal), terminal);
  assert.deepEqual(await store(objects).execute(ID, "a", async () => success()), terminal);
  const transient = failure(ID2, "network-failure", true);
  assert.deepEqual(await store(objects).execute(ID2, "b", async () => transient), transient);
  assert.deepEqual(await store(objects).execute(ID2, "b", async () => success(ID2)), transient);
});

test("expired lease takeover is atomic and fences the stale owner terminal write", async () => {
  const objects = new FakeObjects();
  const name = acquisitionControlObjectName(ID);
  const old = validateAcquisitionControlRecord({ schemaVersion: "1.0", acquisitionId: ID,
    requestFingerprint: "a".repeat(64), state: "running", leaseOwner: ID2, fenceToken: 1,
    leaseExpiresAt: "2000-01-01T00:00:00.000Z", createdAt: "2000-01-01T00:00:00.000Z",
    updatedAt: "2000-01-01T00:00:00.000Z" });
  const created = await objects.create(name, old);
  assert.equal(created.status, "created");
  const contenderA = store(objects).execute(ID, "not-the-seeded-fingerprint", async () => success());
  await assert.rejects(contenderA, /idempotency-conflict/);

  const current = objects.values.get(name)!;
  const staleTerminal = validateAcquisitionControlRecord({ schemaVersion: "1.0", acquisitionId: ID,
    requestFingerprint: old.requestFingerprint, state: "failed", fenceToken: 1,
    createdAt: old.createdAt, updatedAt: new Date().toISOString(), result: failure(ID, "network-failure", true) });
  const takeover = validateAcquisitionControlRecord({ ...old, leaseOwner: crypto.randomUUID(), fenceToken: 2,
    leaseExpiresAt: new Date(Date.now() + 90_000).toISOString(), updatedAt: new Date().toISOString() });
  const won = await objects.replace(name, current.generation, takeover);
  assert.equal(won.status, "updated");
  assert.deepEqual(await objects.replace(name, current.generation, staleTerminal), { status: "precondition-failed" });
});

test("two stale-takeover contenders allow one operation and replay its result", async () => {
  const objects = new FakeObjects();
  const fingerprint = "canonical-request";
  const old = validateAcquisitionControlRecord({ schemaVersion: "1.0", acquisitionId: ID,
    requestFingerprint: createHash("sha256").update(fingerprint).digest("hex"), state: "running",
    leaseOwner: ID2, fenceToken: 1, leaseExpiresAt: "2000-01-01T00:00:00.000Z",
    createdAt: "2000-01-01T00:00:00.000Z", updatedAt: "2000-01-01T00:00:00.000Z" });
  await objects.create(acquisitionControlObjectName(ID), old);
  let operations = 0;
  const operation = async () => { operations += 1; await new Promise((resolve) => setTimeout(resolve, 20)); return success(); };
  const results = await Promise.all([store(objects).execute(ID, fingerprint, operation), store(objects).execute(ID, fingerprint, operation)]);
  assert.deepEqual(results, [success(), success()]);
  assert.equal(operations, 1);
  assert.equal(objects.values.get(acquisitionControlObjectName(ID))!.record.fenceToken, 2);
});

test("lease heartbeat renews and lease-loss abort reaches the operation", async () => {
  const renewed = new FakeObjects();
  const renewing = new PersistentAcquisitionIdempotencyStore(renewed, undefined, 80, 10, 5);
  await renewing.execute(ID, "heartbeat", async () => {
    await new Promise((resolve) => setTimeout(resolve, 28));
    return success();
  });
  assert.equal(renewed.writes >= 3, true);

  class LosingObjects extends FakeObjects {
    override replace(name: string, expected: string, record: AcquisitionControlRecord) {
      if (record.state === "running") return Promise.resolve({ status: "precondition-failed" as const });
      return super.replace(name, expected, record);
    }
  }
  const losing = new PersistentAcquisitionIdempotencyStore(new LosingObjects(), undefined, 80, 10, 5);
  await assert.rejects(losing.execute(ID2, "lease-loss", (signal) => new Promise<AcquisitionResult>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new AcquisitionWorkerFailure("acquisition-cancelled", true)), { once: true });
  })), (error: unknown) => error instanceof AcquisitionWorkerFailure && error.code === "acquisition-cancelled");
});

test("retryable terminal failure is reclaimed only after explicit delay", async () => {
  const objects = new FakeObjects();
  let now = 1_800_000_000_000;
  const clock = { now: () => now, ownerToken: () => crypto.randomUUID(),
    sleep: (_ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true })) };
  const persistent = new PersistentAcquisitionIdempotencyStore(objects, clock, 90_000, 30_000, 1_000);
  const transient = failure(ID, "network-failure", true);
  assert.deepEqual(await persistent.execute(ID, "retry", async () => transient), transient);
  assert.deepEqual(await persistent.execute(ID, "retry", async () => success()), transient);
  now += 61_000;
  assert.deepEqual(await persistent.execute(ID, "retry", async () => success()), success());
});

test("record and object naming persist no raw URL, UID, token, path, or listing authority", () => {
  assert.equal(acquisitionControlObjectName(ID), `${ACQUISITION_CONTROL_PREFIX}${ID}.json`);
  assert.throws(() => acquisitionControlObjectName("client-id"), /invalid-acquisition-id/);
  const record = validateAcquisitionControlRecord({ schemaVersion: "1.0", acquisitionId: ID,
    requestFingerprint: "f".repeat(64), state: "succeeded", fenceToken: 1,
    createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), result: success() });
  assert.doesNotMatch(JSON.stringify(record), /https?:|DaxW|uid|cookie|credential|stderr|stdout|\/workspace/i);
});

test("GCS adapter uses exact objects and generation preconditions without listing or token persistence", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const responses = [
    Response.json({ generation: "1" }),
    new Response(JSON.stringify(validateAcquisitionControlRecord({ schemaVersion: "1.0", acquisitionId: ID,
      requestFingerprint: "f".repeat(64), state: "succeeded", fenceToken: 1,
      createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), result: success() })),
      { headers: { "x-goog-generation": "1", "content-type": "application/json" } }),
    Response.json({ generation: "2" }),
  ];
  const fetchImpl = async (input: string, init?: RequestInit) => { calls.push({ input, init }); return responses.shift()!; };
  const adapter = new GcsAcquisitionControlObjectStore("nexcut-prod-jp-2026-media", async () => "opaque-token", fetchImpl);
  const terminal = validateAcquisitionControlRecord({ schemaVersion: "1.0", acquisitionId: ID,
    requestFingerprint: "f".repeat(64), state: "succeeded", fenceToken: 1,
    createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), result: success() });
  assert.deepEqual(await adapter.create(acquisitionControlObjectName(ID), terminal), { status: "created", generation: "1" });
  assert.equal((await adapter.read(acquisitionControlObjectName(ID))).status, "found");
  assert.deepEqual(await adapter.replace(acquisitionControlObjectName(ID), "1", terminal), { status: "updated", generation: "2" });
  assert.match(calls[0]!.input, /ifGenerationMatch=0/);
  assert.match(calls[2]!.input, /ifGenerationMatch=1/);
  assert.equal(calls.some((call) => /\/o\?(?!uploadType)|prefix=|list/i.test(call.input)), false);
  assert.doesNotMatch(calls.map((call) => String(call.init?.body ?? "")).join(""), /opaque-token/);
});

test("Production configuration and metadata credential supplier fail closed", async () => {
  assert.deepEqual(readProductionAcquisitionControlConfiguration({ MEDIA_BUCKET_NAME: "nexcut-prod-jp-2026-media" }),
    { bucket: "nexcut-prod-jp-2026-media", prefix: ACQUISITION_CONTROL_PREFIX });
  assert.throws(() => readProductionAcquisitionControlConfiguration({ MEDIA_BUCKET_NAME: "other" }), /invalid-acquisition-control-bucket/);
  let calls = 0;
  const supplier = createMetadataAccessTokenSupplier(async () => { calls += 1; return Response.json({ access_token: "opaque", expires_in: 3600 }); });
  assert.equal(await supplier(), "opaque");
  assert.equal(await supplier(), "opaque");
  assert.equal(calls, 1);
});
