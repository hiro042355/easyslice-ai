import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AcquisitionWorkerTrustFailure,
  createAcquisitionWorkerTrustClient,
  readAcquisitionWorkerTrustConfiguration,
  WORKER_RESPONSE_MAX_BYTES,
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
const sha256 = "a".repeat(64);
const successfulResult = Object.freeze({ acquisitionId, status: "succeeded",
  artifactReference: `handoff:v1:${acquisitionId}:${sha256}`,
  media: Object.freeze({ contentType: "video/mp4", byteSize: 1024, durationSeconds: 10, hasVideo: true, hasAudio: true }),
  handoff: Object.freeze({ artifactReference: `handoff:v1:${acquisitionId}:${sha256}`, contentType: "video/mp4",
    byteSize: 1024, sha256, workerObservedDurationSeconds: 10, videoPresent: true, audioPresent: true,
    expiresAt: "2099-01-01T00:00:00.000Z" }),
});
const request: AcquisitionRequest = Object.freeze({
  requestVersion: ACQUISITION_REQUEST_VERSION,
  acquisitionId,
  source: "youtube",
  sourceUrl: "https://www.youtube.com/watch?v=DaxWpqigjrs",
  requestedOutputProfile: ACQUISITION_OUTPUT_PROFILE,
  maxBytes: ACQUISITION_MAX_BYTES,
  timeoutMs: ACQUISITION_DEFAULT_TIMEOUT_MS,
});

const streamedJsonResponse = (
  chunks: readonly string[],
  init: Readonly<{ status?: number; contentType?: string; contentLength?: string }> = {},
): Response => {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), {
    status: init.status ?? 200,
    headers: {
      ...(init.contentType === undefined ? { "content-type": "application/json" } : init.contentType ? { "content-type": init.contentType } : {}),
      ...(init.contentLength === undefined ? {} : { "content-length": init.contentLength }),
    },
  });
};

const verifyWithFirstResponse = (response: Response) => {
  let fetchCalls = 0;
  const client = createAcquisitionWorkerTrustClient(configuration, {
    getIdToken: async () => "opaque",
    async fetch() {
      fetchCalls += 1;
      return fetchCalls === 1 ? response : new Response(null, { status: 404 });
    },
    log() {}, now: () => 0,
  });
  return { operation: client.verify(), calls: () => fetchCalls };
};
const diagnostic = Object.freeze({
  stderrCaptureComplete: "YES",
  acquisitionExecutionBegan: "YES", providerPrecheckOutcome: "AVAILABLE", ytDlpSpawnAttempted: "YES",
  ytDlpProcessStarted: "YES", ytDlpProcessTerminated: "YES", providerRequestObservationCoverage: "COMPLETE",
  providerRequestCount: "ONE", providerTokenDemandObserved: "YES", providerResponseObserved: "YES",
  providerResponseSchemaOutcome: "VALID", providerRequestTemporalRelation: "BEFORE_TERMINATION",
  externalRequestStageReached: "YES", has403: true, has429: false,
  has5xx: false, timeoutObserved: false,
  expectedPluginArtifactPresent: "YES", runtimePluginDetection: "UNKNOWN", providerConfigured: "YES",
  providerHealthy: "YES", providerPluginConfigured: "YES", providerPluginDiscovered: "UNKNOWN",
  providerPluginActivated: "UNKNOWN", acquisitionProviderRequest: "YES", acquisitionProviderSuccess: "YES",
  acquisitionProviderFailure: "NO", nodeConfigured: "YES", nodeExecutable: "YES", nodeVersionMatch: "YES",
  providerTokenResponseObserved: "YES", providerTokenSchemaValid: "YES", tokenContext: "GVS",
  tokenRetrievedByYtDlp: "YES", tokenAttachedToOutboundRequest: "UNKNOWN",
  tokenConsumedByYtDlp: "UNKNOWN", botCheckRelativeToTokenRetrieval: "UNKNOWN",
  botCheckRelativeToTokenAttachment: "UNKNOWN", playerClient: "MWEB", gvsRequestReached: "YES",
  mediaRequestReached: "YES", selectedTransport: "DIRECT", hlsManifestReached: "UNKNOWN",
  hlsFragmentReached: "UNKNOWN", http403Stage: "MEDIA", retryCount: 0,
  ejsAvailable: "YES", ejsActualUse: "UNKNOWN", configuredPlayerClient: "MWEB", observedPlayerClient: "UNKNOWN",
  jsChallengeObserved: "UNKNOWN", formatEnumerationObserved: "UNKNOWN", mediaRequestObserved: "UNKNOWN",
  mediaBytesObserved: "UNKNOWN", safeFailureCode: "youtube-bot-check", failureStage: "UNKNOWN", processFailureFamily: "youtube-bot-check",
  botCheckEvidenceStage: "UNKNOWN", botCheckEvidenceKind: "UNKNOWN",
  extractorTerminatedWithoutObservedProviderRequest: "NO", extractorTerminatedBeforeProviderRequest: "UNKNOWN",
  postRetrievalExternalRequestStage: "UNKNOWN",
} as const);

test("caller uses one short-lived token, fixed Worker path, exact request, and no retry", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  let tokenCalls = 0;
  const client = createAcquisitionWorkerTrustClient(configuration, {
    async getIdToken(audience) { tokenCalls += 1; assert.equal(audience, configuration.workerUrl); return "opaque-token"; },
    async fetch(input, init) {
      calls.push({ input, init });
      return Response.json(successfulResult);
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

test("status lookup uses one short-lived token, fixed non-acquiring path, and no retry", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  let tokenCalls = 0;
  const client = createAcquisitionWorkerTrustClient(configuration, {
    async getIdToken(audience) { tokenCalls += 1; assert.equal(audience, configuration.workerUrl); return "opaque-token"; },
    async fetch(input, init) { calls.push({ input, init }); return Response.json(successfulResult); },
    log() { throw new Error("lookup-must-not-log"); }, now: () => 0,
  });
  assert.deepEqual(await client.lookup(acquisitionId), successfulResult);
  assert.equal(tokenCalls, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, `${configuration.workerUrl}/v1/acquisitions/${acquisitionId}`);
  assert.equal(calls[0]?.init?.method, "GET");
  assert.equal(calls[0]?.init?.body, undefined);
  assert.equal(new Headers(calls[0]?.init?.headers).get("authorization"), "Bearer opaque-token");
});

test("status lookup returns not-found and rejects mismatched or unsafe responses", async () => {
  const make = (response: Response) => createAcquisitionWorkerTrustClient(configuration, {
    getIdToken: async () => "opaque", fetch: async () => response, log() {}, now: () => 0,
  });
  assert.equal(await make(Response.json({ status: "not-found" }, { status: 404 })).lookup(acquisitionId), undefined);
  await assert.rejects(make(new Response(null, { status: 404 })).lookup(acquisitionId),
    (error: unknown) => error instanceof AcquisitionWorkerTrustFailure && error.code === "worker-auth-rejected");
  await assert.rejects(make(Response.json({ ...successfulResult, acquisitionId: "223e4567-e89b-42d3-a456-426614174000" })).lookup(acquisitionId),
    (error: unknown) => error instanceof AcquisitionWorkerTrustFailure && error.code === "worker-invalid-response");
  await assert.rejects(make(Response.json({ ...successfulResult, raw: "private" })).lookup(acquisitionId),
    (error: unknown) => error instanceof AcquisitionWorkerTrustFailure && error.code === "worker-invalid-response");
  await assert.rejects(make(new Response(null, { status: 403 })).lookup(acquisitionId),
    (error: unknown) => error instanceof AcquisitionWorkerTrustFailure && error.code === "worker-auth-rejected");
});

test("status lookup bounds streamed JSON and enforces its exact media type", async () => {
  const make = (response: Response) => createAcquisitionWorkerTrustClient(configuration, {
    getIdToken: async () => "opaque", fetch: async () => response, log() {}, now: () => 0,
  });
  const closed404 = '{"status":"not-found"}';
  assert.equal(await make(streamedJsonResponse([closed404], { status: 404 })).lookup(acquisitionId), undefined);
  const rejected = [
    streamedJsonResponse(['{"status":"not-found","extra":true}'], { status: 404 }),
    streamedJsonResponse(["{"], { status: 404 }),
    streamedJsonResponse([], { status: 404 }),
    streamedJsonResponse([closed404], { status: 404, contentType: "text/html" }),
    streamedJsonResponse([closed404], { status: 404, contentType: "" }),
    streamedJsonResponse([closed404], { status: 404, contentType: "application/json; foo=bar" }),
    streamedJsonResponse([JSON.stringify({ status: "not-found", padding: "x".repeat(WORKER_RESPONSE_MAX_BYTES) })], { status: 404 }),
    streamedJsonResponse([" ".repeat(WORKER_RESPONSE_MAX_BYTES), closed404], { status: 404 }),
    streamedJsonResponse([" ".repeat(WORKER_RESPONSE_MAX_BYTES), closed404], { status: 404, contentLength: "4" }),
    streamedJsonResponse([closed404], { status: 404, contentLength: String(WORKER_RESPONSE_MAX_BYTES + 1) }),
  ];
  for (const response of rejected) {
    await assert.rejects(make(response).lookup(acquisitionId),
      (error: unknown) => error instanceof AcquisitionWorkerTrustFailure && error.code === "worker-auth-rejected");
  }
  assert.deepEqual(await make(streamedJsonResponse([JSON.stringify(successfulResult)])).lookup(acquisitionId), successfulResult);
});

test("acquisition response parsing is bounded, media-type constrained, and never retried", async () => {
  const invokeWith = async (response: Response) => {
    let fetchCalls = 0;
    const client = createAcquisitionWorkerTrustClient(configuration, {
      getIdToken: async () => "opaque",
      async fetch() { fetchCalls += 1; return response; },
      log() {}, now: () => 0,
    });
    const operation = client.invoke(request);
    return { operation, calls: () => fetchCalls };
  };
  const valid = await invokeWith(streamedJsonResponse([JSON.stringify(successfulResult)]));
  assert.deepEqual(await valid.operation, { result: successfulResult });
  assert.equal(valid.calls(), 1);
  const invalid = [
    streamedJsonResponse([JSON.stringify(successfulResult), " ".repeat(WORKER_RESPONSE_MAX_BYTES)]),
    streamedJsonResponse([" ".repeat(WORKER_RESPONSE_MAX_BYTES), JSON.stringify(successfulResult)]),
    streamedJsonResponse([" ".repeat(WORKER_RESPONSE_MAX_BYTES), JSON.stringify(successfulResult)], { contentLength: "4" }),
    streamedJsonResponse([JSON.stringify(successfulResult)], { contentType: "" }),
    streamedJsonResponse([JSON.stringify(successfulResult)], { contentType: "text/plain" }),
    streamedJsonResponse([JSON.stringify(successfulResult)], { contentType: "application/json; foo=bar" }),
    streamedJsonResponse(["{"]),
  ];
  for (const response of invalid) {
    const attempt = await invokeWith(response);
    await assert.rejects(attempt.operation,
      (error: unknown) => error instanceof AcquisitionWorkerTrustFailure && error.code === "worker-invalid-response");
    assert.equal(attempt.calls(), 1);
  }
});

test("readiness verification uses the shared bounded JSON response authority", async () => {
  const exactPrefix = '{"ready":true,"padding":"';
  const exactSuffix = '"}';
  const exactMaximum = `${exactPrefix}${"x".repeat(WORKER_RESPONSE_MAX_BYTES - exactPrefix.length - exactSuffix.length)}${exactSuffix}`;
  assert.equal(new TextEncoder().encode(exactMaximum).byteLength, WORKER_RESPONSE_MAX_BYTES);

  for (const response of [
    streamedJsonResponse(['{"ready":true}']),
    streamedJsonResponse([exactMaximum]),
    streamedJsonResponse(['{"ready":true}'], { contentType: "Application/JSON; Charset=UTF-8" }),
  ]) {
    const attempt = verifyWithFirstResponse(response);
    const result = await attempt.operation;
    assert.equal(result.correctAudience.workerReady, true);
    assert.equal(attempt.calls(), 3);
  }
});

test("readiness verification fails closed at response transport boundaries without retry", async () => {
  const invalidUtf8 = new Response(new Uint8Array([0x7b, 0x22, 0x72, 0x65, 0x61, 0x64, 0x79, 0x22, 0x3a, 0xff, 0x7d]), {
    status: 200, headers: { "content-type": "application/json" },
  });
  const rejected = [
    streamedJsonResponse([" ".repeat(WORKER_RESPONSE_MAX_BYTES + 1)]),
    streamedJsonResponse([" ".repeat(WORKER_RESPONSE_MAX_BYTES), "x"]),
    streamedJsonResponse([" ".repeat(WORKER_RESPONSE_MAX_BYTES), "x"], { contentLength: "4" }),
    streamedJsonResponse(['{"ready":true}'], { contentType: "" }),
    streamedJsonResponse(['{"ready":true}'], { contentType: "text/html" }),
    streamedJsonResponse(['{"ready":true}'], { contentType: "application/json; foo=bar" }),
    streamedJsonResponse(['{"ready":true}'], { contentType: "application/json; charset=iso-8859-1" }),
    streamedJsonResponse(["{"]),
    invalidUtf8,
    streamedJsonResponse(['{"ready":false}']),
    streamedJsonResponse(['{"status":"ready"}']),
  ];
  for (const response of rejected) {
    const attempt = verifyWithFirstResponse(response);
    await assert.rejects(attempt.operation,
      (error: unknown) => error instanceof AcquisitionWorkerTrustFailure && error.code === "worker-unavailable"
        && !error.message.includes("ready") && !error.message.includes("padding"));
    assert.equal(attempt.calls(), 1);
  }
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

test("Owner validation surface is narrow and normal production flows remain disconnected", () => {
  const route = readFileSync("app/api/internal/acquisition-worker-owner-e2e/route.ts", "utf8");
  const boundary = readFileSync("lib/server/acquisitionWorkerTrust/productionValidationBoundary.ts", "utf8");
  const client = readFileSync("lib/server/acquisitionWorkerTrust/client.ts", "utf8");
  const ingestion = readFileSync("app/api/youtube/ingest/route.ts", "utf8");
  const workspace = readFileSync("app/workspace-flow/page.tsx", "utf8");
  const aiMv = readFileSync("app/api/ai-mv/route.ts", "utf8");
  assert.match(route, /createProductionValidationBoundary/);
  assert.doesNotMatch(route, /invokeProductionAcquisitionWorkerAt|randomUUID|request\.json|sourceUrl/);
  assert.match(boundary, /NEXCUT_PRODUCTION_ACQUISITION_VALIDATION_ENABLED/);
  assert.doesNotMatch(boundary, /api\/v1\/assets\/import|directYouTubeImporter|fetch\(/);
  assert.match(client, /ACQUISITION_PATH = "\/v1\/acquisitions"/);
  assert.match(client, /ACQUISITION_REQUEST_TIMEOUT_MS = 270_000/);
  assert.doesNotMatch(`${ingestion}\n${workspace}\n${aiMv}`, /invokeProductionAcquisitionWorker|acquisition-worker-owner-e2e/);
});

test("Environment B Owner E2E surface is retired before any production acquisition side effect", () => {
  const route = readFileSync("app/api/internal/environment-b-owner-youtube-e2e/route.ts", "utf8");
  const ingestion = readFileSync("app/api/youtube/ingest/route.ts", "utf8");
  const workspace = readFileSync("app/workspace-flow/page.tsx", "utf8");
  const aiMv = readFileSync("app/api/ai-mv/route.ts", "utf8");
  assert.match(route, /status:\s*"retired"/);
  assert.match(route, /status: 410/);
  assert.doesNotMatch(route, /invokeProductionAcquisitionWorkerAt|randomUUID|request\.json|sourceUrl/);
  assert.doesNotMatch(`${ingestion}\n${workspace}\n${aiMv}`, /environment-b-owner-youtube-e2e/);
});
