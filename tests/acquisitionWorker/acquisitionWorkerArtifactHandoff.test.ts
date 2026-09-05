import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AcquisitionWorkerCore,
  AcquisitionWorkerFailure,
  SourceAdapterRegistry,
  YouTubeSourceAdapter,
  resolveAcquisitionWorkspace,
  type AcquisitionMediaMetadata,
  type AcquisitionRuntime,
} from "../../lib/server/acquisitionWorker";
import { GcsArtifactHandoffStore, createGcsArtifactHandoffStore } from "../../lib/server/acquisitionWorker/gcsArtifactHandoffStore";
import { PersistentAcquisitionIdempotencyStore, type AcquisitionControlObjectStore,
  type AcquisitionControlRecord } from "../../lib/server/acquisitionWorker/persistentIdempotency";
import { createAcquisitionWorkerHttpService } from "../../worker/acquisition/httpService";
import { bindAcquisitionWorkerExecution } from "../../worker/acquisition/main";

const ID = "4cb17c21-f77b-46c0-8d14-0aecba3a8e95";
const URL = "https://www.youtube.com/watch?v=abc123XYZ_-";
const BYTES = Buffer.from("deterministic-closed-mp4-fixture");
const SHA = createHash("sha256").update(BYTES).digest("hex");
const REQUEST = Object.freeze({ requestVersion: "1.0", acquisitionId: ID, source: "youtube",
  sourceUrl: URL, requestedOutputProfile: "canonical-mp4" });
const MEDIA: AcquisitionMediaMetadata = Object.freeze({ contentType: "video/mp4", byteSize: BYTES.length,
  durationSeconds: 12.5, hasVideo: true, hasAudio: true });
const RUNTIME: AcquisitionRuntime = Object.freeze({ ytDlpExecutable: "/closed/yt-dlp",
  ffmpegExecutable: "/closed/ffmpeg", nodeExecutable: "/closed/node", nodeMajorVersion: 24 });
const PREFIX = "acquisition-handoff/v1/" as const;

class FakeObjects implements AcquisitionControlObjectStore {
  readonly values = new Map<string, { generation: string; record: AcquisitionControlRecord }>();
  private generation = 0;
  create(name: string, record: AcquisitionControlRecord) {
    if (this.values.has(name)) return Promise.resolve({ status: "exists" as const });
    const generation = String(++this.generation);
    this.values.set(name, { generation, record });
    return Promise.resolve({ status: "created" as const, generation });
  }
  read(name: string) {
    const value = this.values.get(name);
    return Promise.resolve(value ? { status: "found" as const, object: value }
      : { status: "missing" as const });
  }
  replace(name: string, expected: string, record: AcquisitionControlRecord) {
    const value = this.values.get(name);
    if (!value || value.generation !== expected) return Promise.resolve({ status: "precondition-failed" as const });
    const generation = String(++this.generation);
    this.values.set(name, { generation, record });
    return Promise.resolve({ status: "updated" as const, generation });
  }
}

const request = () => ({ ...REQUEST });
const handoffStore = (upload: (file: string, options: Record<string, unknown>) => Promise<unknown>) =>
  new GcsArtifactHandoffStore({ upload } as never, PREFIX, 7, () => Date.parse("2026-09-05T00:00:00.000Z"));

test("GCS handoff uses the exact SHA256 key and one create-only upload without read or delete authority", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nexcut-handoff-store-"));
  const file = path.join(root, "canonical.mp4");
  await writeFile(file, BYTES);
  const calls: Array<{ file: string; options: Record<string, unknown> }> = [];
  try {
    const store = handoffStore(async (input, options) => {
      calls.push({ file: input, options });
      assert.deepEqual(await readFile(input), BYTES);
      return undefined;
    });
    const result = await store.create({ acquisitionId: ID, path: file, media: MEDIA });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.options.destination, `${PREFIX}${ID}/${SHA}.mp4`);
    assert.equal(calls[0]!.options.resumable, false);
    assert.deepEqual(calls[0]!.options.preconditionOpts, { ifGenerationMatch: 0 });
    assert.deepEqual(result, {
      artifactReference: `handoff:v1:${ID}:${SHA}`, contentType: "video/mp4", byteSize: BYTES.length,
      sha256: SHA, workerObservedDurationSeconds: 12.5, videoPresent: true, audioPresent: true,
      expiresAt: "2026-09-12T00:00:00.000Z",
    });
    assert.doesNotMatch(JSON.stringify({ key: calls[0]!.options.destination, result }),
      /youtube\.com|abc123XYZ|idempotency|owner|signed|https?:\/\//i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("configuration, conflict, and ambiguous outcomes are bounded and never retried", async () => {
  assert.throws(() => createGcsArtifactHandoffStore(
    { ACQUISITION_HANDOFF_BUCKET: "other" } as unknown as NodeJS.ProcessEnv, {} as never),
    (error: unknown) => error instanceof AcquisitionWorkerFailure && error.code === "handoff-configuration-failure");
  const root = await mkdtemp(path.join(os.tmpdir(), "nexcut-handoff-errors-"));
  const file = path.join(root, "canonical.mp4");
  await writeFile(file, BYTES);
  try {
    for (const [error, code] of [[{ code: 412 }, "handoff-conflict"],
      [new Error("secret raw storage detail"), "handoff-outcome-ambiguous"]] as const) {
      let uploads = 0;
      await assert.rejects(handoffStore(async () => { uploads += 1; throw error; })
        .create({ acquisitionId: ID, path: file, media: MEDIA }),
      (value: unknown) => value instanceof AcquisitionWorkerFailure && value.code === code && value.message === code);
      assert.equal(uploads, 1);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("completed handoff survives cleanup and restart replay/status lookup never reacquires or uploads", async () => {
  const authorityRoot = await mkdtemp(path.join(os.tmpdir(), "nexcut-handoff-core-"));
  const objects = new FakeObjects();
  let acquisitions = 0;
  let uploads = 0;
  const adapter = new YouTubeSourceAdapter(async (args) => {
    acquisitions += 1;
    await writeFile(args[args.indexOf("--output") + 1]!, BYTES);
  });
  const createCore = () => new AcquisitionWorkerCore({
    adapters: new SourceAdapterRegistry([adapter]),
    idempotency: new PersistentAcquisitionIdempotencyStore(objects, undefined, 200, 50, 5),
    runtime: RUNTIME, authorityRoot, inspectMedia: async () => MEDIA,
    handoffStore: handoffStore(async (file) => { uploads += 1; assert.deepEqual(await readFile(file), BYTES); }),
  });
  try {
    const first = await createCore().execute(request());
    assert.equal(first.status, "succeeded");
    await assert.rejects(stat(resolveAcquisitionWorkspace(ID, authorityRoot).root));
    const reconstructed = createCore();
    assert.deepEqual(await reconstructed.execute(request()), first);
    assert.deepEqual(await reconstructed.lookup(ID), first);
    assert.equal(acquisitions, 1);
    assert.equal(uploads, 1);
  } finally { await rm(authorityRoot, { recursive: true, force: true }); }
});

test("ambiguous upload is persisted for reconciliation and reconstruction never reacquires", async () => {
  const authorityRoot = await mkdtemp(path.join(os.tmpdir(), "nexcut-handoff-ambiguous-"));
  const objects = new FakeObjects();
  let acquisitions = 0;
  let uploads = 0;
  const createCore = () => new AcquisitionWorkerCore({
    adapters: new SourceAdapterRegistry([new YouTubeSourceAdapter(async (args) => {
      acquisitions += 1; await writeFile(args[args.indexOf("--output") + 1]!, BYTES);
    })]), idempotency: new PersistentAcquisitionIdempotencyStore(objects, undefined, 200, 50, 5),
    runtime: RUNTIME, authorityRoot, inspectMedia: async () => MEDIA,
    handoffStore: handoffStore(async () => { uploads += 1; throw new Error("ambiguous"); }),
  });
  try {
    const first = await createCore().execute(request());
    assert.deepEqual(first, { acquisitionId: ID, status: "failed", errorCode: "handoff-outcome-ambiguous", retryable: false });
    assert.deepEqual(await createCore().execute(request()), first);
    assert.deepEqual(await createCore().lookup(ID), first);
    assert.equal(acquisitions, 1);
    assert.equal(uploads, 1);
    assert.equal([...objects.values.values()][0]!.record.state, "reconciliation-required");
  } finally { await rm(authorityRoot, { recursive: true, force: true }); }
});

test("create-only conflict is persisted and replay never reacquires or reuploads", async () => {
  const authorityRoot = await mkdtemp(path.join(os.tmpdir(), "nexcut-handoff-conflict-"));
  const objects = new FakeObjects();
  let acquisitions = 0;
  let uploads = 0;
  const createCore = () => new AcquisitionWorkerCore({
    adapters: new SourceAdapterRegistry([new YouTubeSourceAdapter(async (args) => {
      acquisitions += 1; await writeFile(args[args.indexOf("--output") + 1]!, BYTES);
    })]), idempotency: new PersistentAcquisitionIdempotencyStore(objects, undefined, 200, 50, 5),
    runtime: RUNTIME, authorityRoot, inspectMedia: async () => MEDIA,
    handoffStore: handoffStore(async () => { uploads += 1; throw { code: 412 }; }),
  });
  try {
    const first = await createCore().execute(request());
    assert.deepEqual(first, { acquisitionId: ID, status: "failed", errorCode: "handoff-conflict", retryable: false });
    assert.deepEqual(await createCore().execute(request()), first);
    assert.equal(acquisitions, 1);
    assert.equal(uploads, 1);
  } finally { await rm(authorityRoot, { recursive: true, force: true }); }
});

test("actual Worker bootstrap binding exposes persisted status lookup without execution", async () => {
  const persisted = Object.freeze({ acquisitionId: ID, status: "failed", errorCode: "handoff-conflict", retryable: false } as const);
  let executeCalls = 0;
  let lookupCalls = 0;
  const bound = bindAcquisitionWorkerExecution({
    execute: async () => { executeCalls += 1; throw new Error("must-not-execute"); },
    lookup: async (id) => { lookupCalls += 1; assert.equal(id, ID); return persisted; },
    telemetry: () => undefined,
  });
  const service = createAcquisitionWorkerHttpService({ ...bound, readiness: async () => ({ ready: true,
    ytDlpVersionMatch: true, ffmpegAvailable: true, nodeSupported: true, providerHealthy: true }), log() {} });
  service.listen(0, "127.0.0.1");
  await once(service, "listening");
  const address = service.address();
  if (!address || typeof address === "string") throw new Error("test-service-address-unavailable");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/acquisitions/${ID}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), persisted);
    assert.equal(lookupCalls, 1);
    assert.equal(executeCalls, 0);
  } finally {
    service.close();
    await once(service, "close");
  }
});
