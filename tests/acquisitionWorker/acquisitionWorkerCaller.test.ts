import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AcquisitionWorkerTrustFailure,
  createAcquisitionWorkerTrustClient,
  readAcquisitionWorkerTrustConfiguration,
} from "../../lib/server/acquisitionWorkerTrust/client";
import {
  ACQUISITION_DEFAULT_TIMEOUT_MS,
  ACQUISITION_MAX_BYTES,
  ACQUISITION_OUTPUT_PROFILE,
  ACQUISITION_REQUEST_VERSION,
  type AcquisitionRequest,
} from "../../lib/server/acquisitionWorker/types";

const environment = Object.freeze({
  GCP_PROJECT_ID: "nexcut-prod-jp-2026",
  GCP_WIF_PROVIDER_RESOURCE: "projects/566365202495/locations/global/workloadIdentityPools/nexcut-prod-vercel/providers/vercel-production",
  GCP_ACQUISITION_WIF_SERVICE_ACCOUNT: "nexcut-prod-acq-invoker@nexcut-prod-jp-2026.iam.gserviceaccount.com",
  ACQUISITION_WORKER_URL: "https://nexcut-prod-acquisition-worker-bfqspeoqrq-an.a.run.app",
});
const configuration = readAcquisitionWorkerTrustConfiguration(environment);
const acquisitionId = "123e4567-e89b-42d3-a456-426614174000";
const request: AcquisitionRequest = Object.freeze({
  requestVersion: ACQUISITION_REQUEST_VERSION,
  acquisitionId,
  source: "youtube",
  sourceUrl: "https://www.youtube.com/watch?v=DaxWpqigjrs",
  requestedOutputProfile: ACQUISITION_OUTPUT_PROFILE,
  maxBytes: ACQUISITION_MAX_BYTES,
  timeoutMs: ACQUISITION_DEFAULT_TIMEOUT_MS,
});
const diagnostic = Object.freeze({
  acquisitionExecutionBegan: "YES", providerPrecheckOutcome: "AVAILABLE", ytDlpSpawnAttempted: "YES",
  ytDlpProcessStarted: "YES", externalRequestStageReached: "YES", has403: true, has429: false,
  has5xx: false, timeoutObserved: false,
  expectedPluginArtifactPresent: "YES", runtimePluginDetection: "UNKNOWN", providerConfigured: "YES",
  providerHealthy: "YES", acquisitionProviderRequest: "YES", acquisitionProviderSuccess: "YES",
  acquisitionProviderFailure: "NO", nodeConfigured: "YES", nodeExecutable: "YES", nodeVersionMatch: "YES",
  providerTokenResponseObserved: "YES", providerTokenSchemaValid: "YES", tokenContext: "GVS",
  tokenConsumedByYtDlp: "YES", playerClient: "MWEB", gvsRequestReached: "YES",
  mediaRequestReached: "YES", selectedTransport: "DIRECT", hlsManifestReached: "UNKNOWN",
  hlsFragmentReached: "UNKNOWN", http403Stage: "MEDIA", retryCount: 0,
  ejsAvailable: "YES", ejsActualUse: "UNKNOWN", configuredPlayerClient: "MWEB", observedPlayerClient: "UNKNOWN",
  jsChallengeObserved: "UNKNOWN", formatEnumerationObserved: "UNKNOWN", mediaRequestObserved: "UNKNOWN",
  mediaBytesObserved: "UNKNOWN", safeFailureCode: "youtube-bot-check", failureStage: "UNKNOWN", processFailureFamily: "youtube-bot-check",
  botCheckEvidenceStage: "UNKNOWN",
} as const);

test("caller uses one short-lived token, fixed Worker path, exact request, and no retry", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  let tokenCalls = 0;
  const client = createAcquisitionWorkerTrustClient(configuration, {
    async getIdToken(audience) { tokenCalls += 1; assert.equal(audience, configuration.workerUrl); return "opaque-token"; },
    async fetch(input, init) {
      calls.push({ input, init });
      return Response.json({ acquisitionId, status: "succeeded", artifactReference: `acquisition:${acquisitionId}`,
        media: { contentType: "video/mp4", byteSize: 1024, durationSeconds: 10, hasVideo: true, hasAudio: true } });
    },
    log() { throw new Error("invoke-must-not-log"); }, now: () => 0,
  });
  const result = await client.invoke(request);
  assert.equal(result.result.status, "succeeded");
  assert.equal(tokenCalls, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, `${configuration.workerUrl}/v1/acquisitions`);
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), request);
  assert.equal(new Headers(calls[0]?.init?.headers).get("authorization"), "Bearer opaque-token");
  assert.equal(calls[0]?.init?.signal instanceof AbortSignal, true);
  assert.doesNotMatch(JSON.stringify(result), /opaque-token|authorization|cookie|credential/i);
});

test("caller accepts exact safe failure and rejects malformed, mismatched, and auth responses", async () => {
  const make = (response: Response) => createAcquisitionWorkerTrustClient(configuration, {
    getIdToken: async () => "opaque", fetch: async () => response, log() {}, now: () => 0,
  });
  assert.deepEqual(await make(Response.json({ acquisitionId, status: "failed", errorCode: "youtube-bot-check", retryable: false }, { status: 422 })).invoke(request),
    { result: { acquisitionId, status: "failed", errorCode: "youtube-bot-check", retryable: false } });
  await assert.rejects(make(Response.json({ status: "succeeded", raw: "private" })).invoke(request),
    (error: unknown) => error instanceof AcquisitionWorkerTrustFailure && error.code === "worker-invalid-response");
  await assert.rejects(make(Response.json({ acquisitionId, status: "succeeded", artifactReference: "file:///private/path",
    media: { contentType: "video/mp4", byteSize: 1024, durationSeconds: 10, hasVideo: true, hasAudio: true } })).invoke(request),
    (error: unknown) => error instanceof AcquisitionWorkerTrustFailure && error.code === "worker-invalid-response");
  await assert.rejects(make(new Response("not-json", { status: 200, headers: { "content-type": "text/plain" } })).invoke(request),
    (error: unknown) => error instanceof AcquisitionWorkerTrustFailure && error.code === "worker-invalid-response");
  await assert.rejects(make(Response.json({ ...request, status: "failed", errorCode: "network-failure", retryable: true }, { status: 200 })).invoke(request),
    (error: unknown) => error instanceof AcquisitionWorkerTrustFailure && error.code === "worker-invalid-response");
  await assert.rejects(make(new Response(null, { status: 403 })).invoke(request),
    (error: unknown) => error instanceof AcquisitionWorkerTrustFailure && error.code === "worker-auth-rejected");
});

test("caller accepts only the closed safe telemetry projection", async () => {
  const client = createAcquisitionWorkerTrustClient(configuration, {
    getIdToken: async () => "opaque", log() {}, now: () => 0,
    fetch: async () => Response.json({ acquisitionId, status: "failed", errorCode: "youtube-bot-check",
      retryable: false, diagnostic }, { status: 422 }),
  });
  assert.deepEqual(await client.invoke(request), { result: { acquisitionId, status: "failed",
    errorCode: "youtube-bot-check", retryable: false }, diagnostic });
  const unsafe = createAcquisitionWorkerTrustClient(configuration, {
    getIdToken: async () => "opaque", log() {}, now: () => 0,
    fetch: async () => Response.json({ acquisitionId, status: "failed", errorCode: "youtube-bot-check",
      retryable: false, diagnostic: { ...diagnostic, raw: "private" } }, { status: 422 }),
  });
  await assert.rejects(unsafe.invoke(request), (error: unknown) => error instanceof AcquisitionWorkerTrustFailure
    && error.code === "worker-invalid-response");
});

test("caller accepts a failed result with the closed OTHER player-client projection", async () => {
  const otherDiagnostic = Object.freeze({ ...diagnostic, playerClient: "OTHER" as const,
    configuredPlayerClient: "OTHER" as const, observedPlayerClient: "OTHER" as const });
  const client = createAcquisitionWorkerTrustClient(configuration, {
    getIdToken: async () => "opaque", log() {}, now: () => 0,
    fetch: async () => Response.json({ acquisitionId, status: "failed", errorCode: "unknown-acquisition-failure",
      retryable: false, diagnostic: otherDiagnostic }, { status: 422 }),
  });
  assert.deepEqual(await client.invoke(request), { result: { acquisitionId, status: "failed",
    errorCode: "unknown-acquisition-failure", retryable: false }, diagnostic: otherDiagnostic });
});

test("caller preserves AbortSignal and safely classifies timeout without exposing raw failure", async () => {
  const abort = new AbortController();
  const seen: AbortSignal[] = [];
  const client = createAcquisitionWorkerTrustClient(configuration, {
    getIdToken: async () => "opaque",
    async fetch(_input, init) { seen.push(init?.signal as AbortSignal); throw new DOMException("private", "TimeoutError"); },
    log() {}, now: () => 0,
  });
  await assert.rejects(client.invoke(request, { signal: abort.signal }),
    (error: unknown) => error instanceof AcquisitionWorkerTrustFailure
      && error.code === "worker-timeout" && !error.message.includes("private"));
  assert.equal(seen.length, 1);
  abort.abort();
  assert.equal(seen[0]?.aborted, true);
});

test("Owner E2E surface is fixed, server-issued, strict, and disconnected from normal traffic", () => {
  const route = readFileSync("app/api/internal/acquisition-worker-owner-e2e/route.ts", "utf8");
  const client = readFileSync("lib/server/acquisitionWorkerTrust/client.ts", "utf8");
  const ingestion = readFileSync("app/api/youtube/ingest/route.ts", "utf8");
  const workspace = readFileSync("app/workspace-flow/page.tsx", "utf8");
  const aiMv = readFileSync("app/api/ai-mv/route.ts", "utf8");
  assert.match(route, /requireAuthenticatedRequest\(request\)/);
  assert.match(route, /validateYouTubeVideoUrl/);
  assert.match(route, /randomUUID\(\)/);
  assert.match(route, /maxDuration = 300/);
  assert.match(route, /Object\.keys\(value\)\.length !== 1/);
  assert.match(route, /diagnostic:\s*invocation\.diagnostic/);
  assert.doesNotMatch(route, /result\.acquisitionId|result\.artifactReference/);
  assert.doesNotMatch(route, /acquisitionId.*(?:request|value)|workerUrl|audience|cookie|storageKey|userId/i);
  assert.match(client, /ACQUISITION_PATH = "\/v1\/acquisitions"/);
  assert.match(client, /ACQUISITION_REQUEST_TIMEOUT_MS = 270_000/);
  assert.doesNotMatch(`${ingestion}\n${workspace}\n${aiMv}`, /invokeProductionAcquisitionWorker|acquisition-worker-owner-e2e/);
});

test("Environment B Owner E2E surface is fixed, single-attempt capable, and safely projected", () => {
  const route = readFileSync("app/api/internal/environment-b-owner-youtube-e2e/route.ts", "utf8");
  const ingestion = readFileSync("app/api/youtube/ingest/route.ts", "utf8");
  const workspace = readFileSync("app/workspace-flow/page.tsx", "utf8");
  const aiMv = readFileSync("app/api/ai-mv/route.ts", "utf8");
  assert.match(route, /requireAuthenticatedRequest\(request\)/);
  assert.match(route, /ENVIRONMENT_B_PROOF_DESTINATIONS\.worker/);
  assert.match(route, /validateYouTubeVideoUrl\("https:\/\/youtu\.be\/DaxWpqigjrs"\)/);
  assert.match(route, /randomUUID\(\)/);
  assert.match(route, /maxDuration = 300/);
  assert.doesNotMatch(route, /request\.json|request\.text|request\.formData/);
  assert.doesNotMatch(route, /result\.acquisitionId|result\.artifactReference|sourceUrl:\s*await/);
  assert.doesNotMatch(route, /cookie|storageKey|userId|authorization/i);
  assert.match(route, /httpStatus/);
  assert.match(route, /diagnostic:\s*invocation\.diagnostic/);
  assert.doesNotMatch(`${ingestion}\n${workspace}\n${aiMv}`, /environment-b-owner-youtube-e2e/);
});
