import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createAcquisitionWorkerHttpService, type WorkerReadiness } from "../../worker/acquisition/httpService";
import { CONTROLLED_EGRESS_DIAGNOSTIC_DESTINATION, probeControlledEgress } from "../../worker/acquisition/networkReadiness";
import type { AcquisitionResult } from "../../lib/server/acquisitionWorker/types";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const request = Object.freeze({
  requestVersion: "1.0",
  acquisitionId: ID,
  source: "youtube",
  sourceUrl: "https://youtu.be/dQw4w9WgXcQ",
  requestedOutputProfile: "canonical-mp4",
});

const withService = async (
  readiness: WorkerReadiness,
  execute: (input: unknown, signal?: AbortSignal) => Promise<AcquisitionResult>,
  operation: (origin: string, logs: readonly Readonly<Record<string, string | number | boolean>>[]) => Promise<void>,
) => {
  const logs: Readonly<Record<string, string | number | boolean>>[] = [];
  const service = createAcquisitionWorkerHttpService({ readiness: async () => readiness, execute, log: (event) => logs.push(event) });
  service.listen(0, "127.0.0.1");
  await once(service, "listening");
  const address = service.address();
  if (!address || typeof address === "string") throw new Error("test-service-address-unavailable");
  try {
    await operation(`http://127.0.0.1:${address.port}`, logs);
  } finally {
    service.close();
    await once(service, "close");
  }
};

test("health and readiness expose only fixed safe runtime booleans", async () => {
  const readiness = Object.freeze({ ready: true, ytDlpVersionMatch: true, ffmpegAvailable: true, nodeSupported: true, providerHealthy: true });
  await withService(readiness, async () => { throw new Error("unused"); }, async (origin) => {
    const health = await fetch(`${origin}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "healthy" });
    const ready = await fetch(`${origin}/readyz`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), readiness);
  });
});

test("readiness fails closed when provider or runtime is unavailable", async () => {
  const readiness = Object.freeze({ ready: false, ytDlpVersionMatch: true, ffmpegAvailable: true, nodeSupported: true, providerHealthy: false });
  await withService(readiness, async () => { throw new Error("unused"); }, async (origin) => {
    assert.equal((await fetch(`${origin}/readyz`)).status, 503);
  });
});

test("readiness fails closed for every required runtime authority", async () => {
  const healthy = { ready: true, ytDlpVersionMatch: true, ffmpegAvailable: true, nodeSupported: true, providerHealthy: true } as const;
  for (const field of ["ytDlpVersionMatch", "ffmpegAvailable", "nodeSupported", "providerHealthy"] as const) {
    const readiness = Object.freeze({ ...healthy, ready: false, [field]: false });
    await withService(readiness, async () => { throw new Error("unused"); }, async (origin) => {
      const response = await fetch(`${origin}/readyz`);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), readiness);
    });
  }
});

test("POST transport validates DTO and projects only the existing result contract", async () => {
  const readiness = Object.freeze({ ready: true, ytDlpVersionMatch: true, ffmpegAvailable: true, nodeSupported: true, providerHealthy: true });
  await withService(readiness, async (input) => Object.freeze({
    acquisitionId: (input as typeof request).acquisitionId,
    status: "failed",
    errorCode: "youtube-bot-check",
    retryable: false,
  }), async (origin, logs) => {
    const response = await fetch(`${origin}/v1/acquisitions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), {
      acquisitionId: ID,
      status: "failed",
      errorCode: "youtube-bot-check",
      retryable: false,
    });
    assert.equal(logs.length, 1);
    assert.deepEqual({ ...logs[0], elapsedBucket: undefined }, {
      event: "acquisition-completed",
      source: "youtube",
      status: "failed",
      elapsedBucket: undefined,
      failureCode: "youtube-bot-check",
    });
    assert.equal(typeof logs[0]?.elapsedBucket, "number");
  });
});

test("transport rejects unsafe shape, media bodies, and non-JSON requests", async () => {
  const readiness = Object.freeze({ ready: true, ytDlpVersionMatch: true, ffmpegAvailable: true, nodeSupported: true, providerHealthy: true });
  await withService(readiness, async () => { throw new Error("unused"); }, async (origin) => {
    const unsafe = await fetch(`${origin}/v1/acquisitions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...request, uid: "private", storageKey: "private", cookie: "private" }),
    });
    assert.equal(unsafe.status, 400);
    const body = JSON.stringify(await unsafe.json());
    assert.doesNotMatch(body, /private|uid|storageKey|cookie/i);
    assert.equal((await fetch(`${origin}/v1/acquisitions`, { method: "POST", body: "video" })).status, 415);
  });
});

test("network readiness uses one fixed benign destination and returns booleans without IP authority", async () => {
  const calls: string[] = [];
  const evidence = await probeControlledEgress("203.0.113.7", undefined, async (input) => {
    calls.push(String(input));
    return Response.json({ ip: "203.0.113.7" });
  });
  assert.deepEqual(calls, [CONTROLLED_EGRESS_DIAGNOSTIC_DESTINATION]);
  assert.deepEqual(evidence, {
    staticEgressAuthorityConfigured: true,
    observedEgressMatchesReservedAuthority: true,
    youtubeAttemptCount: 0,
  });
  assert.doesNotMatch(JSON.stringify(evidence), /203\.0\.113\.7|youtube\.com|youtu\.be|token|credential/i);
});

test("network readiness endpoint never invokes acquisition execution", async () => {
  const readiness = Object.freeze({ ready: true, ytDlpVersionMatch: true, ffmpegAvailable: true, nodeSupported: true, providerHealthy: true });
  let acquisitionCalls = 0;
  const service = createAcquisitionWorkerHttpService({
    readiness: async () => readiness,
    execute: async () => { acquisitionCalls += 1; throw new Error("must-not-run"); },
    networkReadiness: async () => Object.freeze({
      staticEgressAuthorityConfigured: true,
      observedEgressMatchesReservedAuthority: true,
      youtubeAttemptCount: 0,
    }),
    log() {},
  });
  service.listen(0, "127.0.0.1");
  await once(service, "listening");
  const address = service.address();
  if (!address || typeof address === "string") throw new Error("test-service-address-unavailable");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/internal/network-readiness`);
    assert.equal(response.status, 200);
    assert.equal(acquisitionCalls, 0);
    assert.deepEqual(await response.json(), {
      staticEgressAuthorityConfigured: true,
      observedEgressMatchesReservedAuthority: true,
      youtubeAttemptCount: 0,
    });
  } finally {
    service.close();
    await once(service, "close");
  }
});
