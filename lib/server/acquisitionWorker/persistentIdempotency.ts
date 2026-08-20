import { createHash, randomUUID } from "node:crypto";
import { AcquisitionWorkerFailure, type AcquisitionResult } from "./types";
import type { AcquisitionIdempotencyStore } from "./idempotency";
import { validateAcquisitionResult } from "./contracts";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^[0-9a-f]{64}$/;
export const ACQUISITION_CONTROL_PREFIX = "acquisition-control/v1/" as const;
export const ACQUISITION_LEASE_MS = 90_000;
export const ACQUISITION_HEARTBEAT_MS = 30_000;
const DEFAULT_POLL_MS = 1_000;
const RETRY_DELAY_MS = 60_000;

type RunningRecord = Readonly<{
  schemaVersion: "1.0";
  acquisitionId: string;
  requestFingerprint: string;
  state: "running";
  leaseOwner: string;
  fenceToken: number;
  leaseExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}>;
type TerminalRecord = Readonly<{
  schemaVersion: "1.0";
  acquisitionId: string;
  requestFingerprint: string;
  state: "succeeded" | "failed";
  fenceToken: number;
  createdAt: string;
  updatedAt: string;
  result: AcquisitionResult;
  retryNotBefore?: string;
}>;
export type AcquisitionControlRecord = RunningRecord | TerminalRecord;

export type AcquisitionControlObject = Readonly<{ generation: string; record: AcquisitionControlRecord }>;
export interface AcquisitionControlObjectStore {
  create(objectName: string, record: AcquisitionControlRecord): Promise<Readonly<{ status: "created"; generation: string } | { status: "exists" }>>;
  read(objectName: string): Promise<Readonly<{ status: "found"; object: AcquisitionControlObject } | { status: "missing" }>>;
  replace(objectName: string, generation: string, record: AcquisitionControlRecord): Promise<Readonly<{ status: "updated"; generation: string } | { status: "precondition-failed" }>>;
}

type Clock = Readonly<{
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  ownerToken(): string;
}>;

const defaultClock: Clock = Object.freeze({
  now: Date.now,
  ownerToken: randomUUID,
  sleep: (ms, signal) => new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new AcquisitionWorkerFailure("acquisition-cancelled", true));
    const timer = setTimeout(resolve, ms);
    const abort = () => { clearTimeout(timer); reject(new AcquisitionWorkerFailure("acquisition-cancelled", true)); };
    signal?.addEventListener("abort", abort, { once: true });
  }),
});

const retryable = (result: AcquisitionResult): boolean => result.status === "failed" && result.retryable;
const iso = (value: number): string => new Date(value).toISOString();
const fingerprintDigest = (fingerprint: string): string => createHash("sha256").update(fingerprint).digest("hex");

export const acquisitionControlObjectName = (acquisitionId: string): string => {
  if (!ID.test(acquisitionId)) throw new AcquisitionWorkerFailure("invalid-acquisition-id");
  return `${ACQUISITION_CONTROL_PREFIX}${acquisitionId}.json`;
};

const exactKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).length === allowed.length && Object.keys(value).every((key) => allowed.includes(key));

export const validateAcquisitionControlRecord = (value: unknown): AcquisitionControlRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid-acquisition-control-record");
  const record = value as Partial<AcquisitionControlRecord> & Record<string, unknown>;
  if (record.schemaVersion !== "1.0" || typeof record.acquisitionId !== "string" || !ID.test(record.acquisitionId)
    || typeof record.requestFingerprint !== "string" || !DIGEST.test(record.requestFingerprint)
    || !Number.isSafeInteger(record.fenceToken) || (record.fenceToken as number) <= 0
    || typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))
    || typeof record.updatedAt !== "string" || !Number.isFinite(Date.parse(record.updatedAt))) {
    throw new Error("invalid-acquisition-control-record");
  }
  if (record.state === "running") {
    if (!exactKeys(record, ["schemaVersion", "acquisitionId", "requestFingerprint", "state", "leaseOwner",
      "fenceToken", "leaseExpiresAt", "createdAt", "updatedAt"])) throw new Error("invalid-acquisition-control-record");
    if (typeof record.leaseOwner !== "string" || !ID.test(record.leaseOwner)
      || typeof record.leaseExpiresAt !== "string" || !Number.isFinite(Date.parse(record.leaseExpiresAt))) {
      throw new Error("invalid-acquisition-control-record");
    }
  } else if ((record.state !== "succeeded" && record.state !== "failed")
    || (record.retryNotBefore !== undefined
      && (typeof record.retryNotBefore !== "string" || !Number.isFinite(Date.parse(record.retryNotBefore))))) {
    throw new Error("invalid-acquisition-control-record");
  } else {
    const allowed = ["schemaVersion", "acquisitionId", "requestFingerprint", "state", "fenceToken",
      "createdAt", "updatedAt", "result", ...(record.retryNotBefore === undefined ? [] : ["retryNotBefore"])];
    if (!exactKeys(record, allowed)) throw new Error("invalid-acquisition-control-record");
    try {
      if (validateAcquisitionResult(record.result).acquisitionId !== record.acquisitionId) throw new Error();
    } catch {
      throw new Error("invalid-acquisition-control-record");
    }
  }
  const serialized = JSON.stringify(record);
  if (/https?:\/\/|youtu\.be|youtube\.com|cookie|credential|authorization|stderr|stdout|filesystem|signedurl/i.test(serialized)) {
    throw new Error("unsafe-acquisition-control-record");
  }
  return Object.freeze({ ...record }) as AcquisitionControlRecord;
};

const combineSignals = (first: AbortSignal, second?: AbortSignal): AbortSignal =>
  second ? AbortSignal.any([first, second]) : first;

export class PersistentAcquisitionIdempotencyStore implements AcquisitionIdempotencyStore {
  constructor(
    private readonly objects: AcquisitionControlObjectStore,
    private readonly clock: Clock = defaultClock,
    private readonly leaseMs = ACQUISITION_LEASE_MS,
    private readonly heartbeatMs = ACQUISITION_HEARTBEAT_MS,
    private readonly pollMs = DEFAULT_POLL_MS,
  ) {
    if (!(heartbeatMs > 0 && heartbeatMs < leaseMs)) throw new TypeError("invalid-acquisition-lease-policy");
  }

  async execute(
    acquisitionId: string,
    fingerprint: string,
    operation: (leaseSignal: AbortSignal) => Promise<AcquisitionResult>,
    callerSignal?: AbortSignal,
  ): Promise<AcquisitionResult> {
    const objectName = acquisitionControlObjectName(acquisitionId);
    const requestFingerprint = fingerprintDigest(fingerprint);
    const owner = this.clock.ownerToken();
    for (;;) {
      if (callerSignal?.aborted) throw new AcquisitionWorkerFailure("acquisition-cancelled", true);
      const claimed = await this.tryCreate(objectName, acquisitionId, requestFingerprint, owner);
      if (claimed) return this.runClaim(objectName, claimed, operation, callerSignal);
      const current = await this.objects.read(objectName);
      if (current.status === "missing") continue;
      const record = validateAcquisitionControlRecord(current.object.record);
      if (record.requestFingerprint !== requestFingerprint) throw new AcquisitionWorkerFailure("idempotency-conflict");
      if (record.state === "succeeded") return record.result;
      if (record.state === "failed") {
        if (!retryable(record.result)) return record.result;
        if (record.retryNotBefore && Date.parse(record.retryNotBefore) > this.clock.now()) return record.result;
        const takeover = await this.takeover(objectName, current.object, owner);
        if (takeover) return this.runClaim(objectName, takeover, operation, callerSignal);
        continue;
      }
      if (record.state !== "running") throw new Error("invalid-acquisition-control-record");
      if (Date.parse(record.leaseExpiresAt) <= this.clock.now()) {
        const takeover = await this.takeover(objectName, current.object, owner);
        if (takeover) return this.runClaim(objectName, takeover, operation, callerSignal);
        continue;
      }
      await this.clock.sleep(this.pollMs, callerSignal);
    }
  }

  private async tryCreate(name: string, id: string, fingerprint: string, owner: string): Promise<AcquisitionControlObject | undefined> {
    const now = this.clock.now();
    const record = Object.freeze({ schemaVersion: "1.0", acquisitionId: id, requestFingerprint: fingerprint,
      state: "running", leaseOwner: owner, fenceToken: 1, leaseExpiresAt: iso(now + this.leaseMs),
      createdAt: iso(now), updatedAt: iso(now) } satisfies RunningRecord);
    const result = await this.objects.create(name, record);
    return result.status === "created" ? Object.freeze({ generation: result.generation, record }) : undefined;
  }

  private async takeover(name: string, current: AcquisitionControlObject, owner: string): Promise<AcquisitionControlObject | undefined> {
    const now = this.clock.now();
    const record = current.record;
    const replacement = Object.freeze({ schemaVersion: "1.0", acquisitionId: record.acquisitionId,
      requestFingerprint: record.requestFingerprint, state: "running", leaseOwner: owner,
      fenceToken: record.fenceToken + 1, leaseExpiresAt: iso(now + this.leaseMs),
      createdAt: record.createdAt, updatedAt: iso(now) } satisfies RunningRecord);
    const updated = await this.objects.replace(name, current.generation, replacement);
    return updated.status === "updated" ? Object.freeze({ generation: updated.generation, record: replacement }) : undefined;
  }

  private async runClaim(
    name: string,
    claim: AcquisitionControlObject,
    operation: (leaseSignal: AbortSignal) => Promise<AcquisitionResult>,
    callerSignal?: AbortSignal,
  ): Promise<AcquisitionResult> {
    if (claim.record.state !== "running") throw new Error("invalid-acquisition-claim");
    const leaseLost = new AbortController();
    const stopHeartbeat = new AbortController();
    let generation = claim.generation;
    let record = claim.record;
    const heartbeat = (async () => {
      while (!stopHeartbeat.signal.aborted) {
        try { await this.clock.sleep(this.heartbeatMs, stopHeartbeat.signal); } catch { break; }
        if (stopHeartbeat.signal.aborted) break;
        const now = this.clock.now();
        const renewed = Object.freeze({ ...record, leaseExpiresAt: iso(now + this.leaseMs), updatedAt: iso(now) });
        try {
          const update = await this.objects.replace(name, generation, renewed);
          if (update.status !== "updated") { leaseLost.abort("lease-lost"); break; }
          generation = update.generation;
          record = renewed;
        } catch {
          leaseLost.abort("lease-store-failed");
          break;
        }
      }
    })();
    let result: AcquisitionResult;
    try {
      result = await operation(combineSignals(leaseLost.signal, callerSignal));
      if (leaseLost.signal.aborted) throw new AcquisitionWorkerFailure("acquisition-cancelled", true);
    } finally {
      stopHeartbeat.abort();
      await heartbeat;
    }
    const now = this.clock.now();
    const terminal = Object.freeze({ schemaVersion: "1.0", acquisitionId: record.acquisitionId,
      requestFingerprint: record.requestFingerprint, state: result.status === "succeeded" ? "succeeded" : "failed",
      fenceToken: record.fenceToken, createdAt: record.createdAt, updatedAt: iso(now), result,
      ...(retryable(result) ? { retryNotBefore: iso(now + RETRY_DELAY_MS) } : {}) } satisfies TerminalRecord);
    const persisted = await this.objects.replace(name, generation, terminal);
    if (persisted.status !== "updated") throw new AcquisitionWorkerFailure("acquisition-cancelled", true);
    return result;
  }
}
