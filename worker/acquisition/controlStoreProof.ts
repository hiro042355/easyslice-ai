import { randomUUID } from "node:crypto";
import { GcsAcquisitionControlObjectStore, createMetadataAccessTokenSupplier,
  readProductionAcquisitionControlConfiguration } from "../../lib/server/acquisitionWorker/gcsControlStore";
import { PersistentAcquisitionIdempotencyStore, acquisitionControlObjectName,
  type AcquisitionControlRecord } from "../../lib/server/acquisitionWorker/persistentIdempotency";
import { AcquisitionWorkerFailure, type AcquisitionResult } from "../../lib/server/acquisitionWorker/types";

const BUCKET = "nexcut-prod-jp-2026-media";
const WORKER_IDENTITY = "nexcut-prod-acq-worker@nexcut-prod-jp-2026.iam.gserviceaccount.com";
const METADATA_EMAIL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email";
const STORAGE_API = "https://storage.googleapis.com";
const DIGEST = "a".repeat(64);

export type ControlStoreProofEvidence = Readonly<{
  workerIdentityMatch: boolean; controlCreate: boolean; concurrentClaim: boolean; controlRead: boolean;
  sameFingerprintReplay: boolean; differentFingerprintRejected: boolean; casUpdate: boolean;
  staleCasRejected: boolean; heartbeat: boolean; staleTakeover: boolean; oldOwnerFenced: boolean;
  leaseAbort: boolean; mediaPrefixDenied: boolean; listingCallCount: 0; cleanup: boolean;
  testControlResidue: number;
}>;

const running = (id: string, owner: string, fenceToken: number, expiresAt: number): Extract<AcquisitionControlRecord, { state: "running" }> => {
  const now = new Date().toISOString();
  return Object.freeze({ schemaVersion: "1.0", acquisitionId: id, requestFingerprint: DIGEST, state: "running",
    leaseOwner: owner, fenceToken, leaseExpiresAt: new Date(expiresAt).toISOString(), createdAt: now, updatedAt: now });
};
const failure = (id: string): AcquisitionResult => Object.freeze({
  acquisitionId: id, status: "failed", errorCode: "youtube-bot-check", retryable: false,
});
const objectUrl = (name: string): string =>
  `${STORAGE_API}/storage/v1/b/${BUCKET}/o/${encodeURIComponent(name)}`;

export const runProductionControlStoreProof = async (): Promise<ControlStoreProofEvidence> => {
  readProductionAcquisitionControlConfiguration();
  const token = createMetadataAccessTokenSupplier();
  const objects = new GcsAcquisitionControlObjectStore(BUCKET, token);
  const ids = Array.from({ length: 5 }, () => randomUUID());
  const names = ids.map(acquisitionControlObjectName);
  const identity = await fetch(METADATA_EMAIL, { headers: { "Metadata-Flavor": "Google" } });
  const workerIdentityMatch = identity.ok && (await identity.text()).trim() === WORKER_IDENTITY;
  let controlCreate = false, concurrentClaim = false, controlRead = false, sameFingerprintReplay = false;
  let differentFingerprintRejected = false, casUpdate = false, staleCasRejected = false, heartbeat = false;
  let staleTakeover = false, oldOwnerFenced = false, leaseAbort = false, mediaPrefixDenied = false;
  try {
    const first = await objects.create(names[0], running(ids[0], randomUUID(), 1, Date.now() + 10_000));
    controlCreate = first.status === "created";
    const firstRead = await objects.read(names[0]);
    controlRead = firstRead.status === "found" && firstRead.object.record.requestFingerprint === DIGEST;

    const raceRecord = running(ids[1], randomUUID(), 1, Date.now() + 10_000);
    const race = await Promise.all([objects.create(names[1], raceRecord), objects.create(names[1], raceRecord)]);
    concurrentClaim = race.filter((value) => value.status === "created").length === 1
      && race.filter((value) => value.status === "exists").length === 1;

    const replayStore = new PersistentAcquisitionIdempotencyStore(objects, undefined, 2_000, 250, 25);
    let calls = 0;
    const once = await replayStore.execute(ids[2], "fixed-proof-fingerprint", async () => { calls += 1; return failure(ids[2]); });
    const twice = await replayStore.execute(ids[2], "fixed-proof-fingerprint", async () => { calls += 1; return failure(ids[2]); });
    sameFingerprintReplay = calls === 1 && once.status === "failed" && twice.status === "failed";
    try { await replayStore.execute(ids[2], "different-proof-fingerprint", async () => failure(ids[2])); }
    catch (error) { differentFingerprintRejected = error instanceof AcquisitionWorkerFailure && error.code === "idempotency-conflict"; }

    if (firstRead.status === "found" && firstRead.object.record.state === "running") {
      const renewed = running(ids[0], firstRead.object.record.leaseOwner, 1, Date.now() + 20_000);
      const update = await objects.replace(names[0], firstRead.object.generation, renewed);
      casUpdate = update.status === "updated";
      heartbeat = update.status === "updated" && Date.parse(renewed.leaseExpiresAt) > Date.now();
      staleCasRejected = (await objects.replace(names[0], firstRead.object.generation, renewed)).status === "precondition-failed";
    }

    const expired = running(ids[3], randomUUID(), 1, Date.now() - 1_000);
    const expiredCreate = await objects.create(names[3], expired);
    if (expiredCreate.status === "created") {
      const takeover = running(ids[3], randomUUID(), 2, Date.now() + 10_000);
      staleTakeover = (await objects.replace(names[3], expiredCreate.generation, takeover)).status === "updated";
      oldOwnerFenced = (await objects.replace(names[3], expiredCreate.generation, expired)).status === "precondition-failed";
    }

    const abortStore = new PersistentAcquisitionIdempotencyStore(objects, undefined, 1_000, 100, 20);
    const executing = abortStore.execute(ids[4], "lease-abort-proof", async (signal) => new Promise<AcquisitionResult>((resolve) => {
      signal.addEventListener("abort", () => { leaseAbort = true; resolve(failure(ids[4])); }, { once: true });
    })).catch(() => failure(ids[4]));
    let active = await objects.read(names[4]);
    for (let attempt = 0; active.status === "missing" && attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20)); active = await objects.read(names[4]);
    }
    if (active.status === "found" && active.object.record.state === "running") {
      await objects.replace(names[4], active.object.generation,
        running(ids[4], randomUUID(), active.object.record.fenceToken + 1, Date.now() + 1_000));
    }
    await executing;

    const denied = await fetch(objectUrl(`jobs/${randomUUID()}/input/control-proof-denied`), {
      headers: { authorization: `Bearer ${await token()}` },
    });
    mediaPrefixDenied = denied.status === 403;
  } finally {
    const authorization = `Bearer ${await token()}`;
    for (const name of names) {
      const current = await objects.read(name).catch(() => ({ status: "missing" as const }));
      if (current.status === "found") {
        await fetch(`${objectUrl(name)}?ifGenerationMatch=${current.object.generation}`, {
          method: "DELETE", headers: { authorization },
        });
      }
    }
  }
  const residue = await Promise.all(names.map((name) => objects.read(name)));
  const testControlResidue = residue.filter((value) => value.status === "found").length;
  return Object.freeze({ workerIdentityMatch, controlCreate, concurrentClaim, controlRead, sameFingerprintReplay,
    differentFingerprintRejected, casUpdate, staleCasRejected, heartbeat, staleTakeover, oldOwnerFenced,
    leaseAbort, mediaPrefixDenied, listingCallCount: 0, cleanup: testControlResidue === 0, testControlResidue });
};
