import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import test from "node:test";
import {
  AcquisitionTelemetryCollector,
  validateAcquisitionSafeTelemetry,
} from "../../lib/server/acquisitionWorker/telemetry";
import { ProviderTelemetryProxy, PROVIDER_PROXY_BODY_LIMIT, validateProviderTokenResponseSchema } from "../../worker/acquisition/providerTelemetryProxy";

const runtime = Object.freeze({ pluginArtifact: true, nodeConfigured: true, nodeExecutable: true,
  nodeVersionMatch: true, ejsAvailable: true });

test("telemetry is exact, closed, tri-state, and absence remains UNKNOWN", () => {
  const diagnostic = new AcquisitionTelemetryCollector(runtime).snapshot();
  assert.deepEqual(diagnostic, {
    acquisitionExecutionBegan: "NO", providerPrecheckOutcome: "NOT_RUN", ytDlpSpawnAttempted: "NO",
    ytDlpProcessStarted: "NO", externalRequestStageReached: "UNKNOWN", has403: false, has429: false,
    has5xx: false, timeoutObserved: false,
    expectedPluginArtifactPresent: "YES", runtimePluginDetection: "UNKNOWN", providerConfigured: "YES",
    providerHealthy: "UNKNOWN", acquisitionProviderRequest: "NO", acquisitionProviderSuccess: "NO",
    acquisitionProviderFailure: "NO", nodeConfigured: "YES", nodeExecutable: "YES", nodeVersionMatch: "YES",
    providerTokenResponseObserved: "NO", providerTokenSchemaValid: "UNKNOWN", tokenContext: "UNKNOWN",
    tokenConsumedByYtDlp: "UNKNOWN", playerClient: "MWEB", gvsRequestReached: "UNKNOWN",
    mediaRequestReached: "UNKNOWN", selectedTransport: "UNKNOWN", hlsManifestReached: "UNKNOWN",
    hlsFragmentReached: "UNKNOWN", http403Stage: "UNKNOWN", retryCount: 0,
    ejsAvailable: "YES", ejsActualUse: "UNKNOWN", configuredPlayerClient: "MWEB", observedPlayerClient: "UNKNOWN",
    jsChallengeObserved: "UNKNOWN", formatEnumerationObserved: "UNKNOWN", mediaRequestObserved: "UNKNOWN",
    mediaBytesObserved: "UNKNOWN", safeFailureCode: "NONE", failureStage: "UNKNOWN", processFailureFamily: "NONE",
  });
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...diagnostic, arbitrary: "private" }));
  const serialized = JSON.stringify(diagnostic);
  assert.doesNotMatch(serialized, /https?:|youtu|video.?id|uid|ip.?address|poToken|tokenHash|cookie|credential|authorization|stdout|stderr|command|filesystem|path/i);
});

test("health is separate while token request success/failure is observable", () => {
  const collector = new AcquisitionTelemetryCollector(runtime);
  collector.providerHealth(true);
  assert.equal(collector.snapshot().providerHealthy, "YES");
  assert.equal(collector.snapshot().acquisitionProviderRequest, "NO");
  collector.providerRequest();
  collector.providerResult(true);
  assert.equal(collector.snapshot().acquisitionProviderRequest, "YES");
  assert.equal(collector.snapshot().acquisitionProviderSuccess, "YES");
  assert.equal(collector.snapshot().acquisitionProviderFailure, "NO");
  collector.providerTokenResponse(true, true, "GVS");
  assert.equal(collector.snapshot().providerTokenResponseObserved, "YES");
  assert.equal(collector.snapshot().providerTokenSchemaValid, "YES");
  assert.equal(collector.snapshot().tokenContext, "GVS");
  const failed = new AcquisitionTelemetryCollector(runtime);
  failed.providerRequest(); failed.providerResult(false);
  assert.equal(failed.snapshot().acquisitionProviderFailure, "YES");
  assert.equal(failed.snapshot().failureStage, "PROVIDER_REQUEST");
});

test("execution, provider precheck, and process boundaries remain closed", () => {
  const collector = new AcquisitionTelemetryCollector(runtime);
  collector.executionBegan();
  collector.providerPrecheck("AVAILABLE");
  collector.ytDlpSpawnAttempt();
  collector.ytDlpStarted();
  collector.processFailureEvidence({ family: "yt-dlp-exit-failed", has403: true, has429: false, has5xx: false, timedOut: false });
  const value = collector.snapshot();
  assert.equal(value.acquisitionExecutionBegan, "YES");
  assert.equal(value.providerPrecheckOutcome, "AVAILABLE");
  assert.equal(value.ytDlpSpawnAttempted, "YES");
  assert.equal(value.ytDlpProcessStarted, "YES");
  assert.equal(value.has403, true);
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...value, providerPrecheckOutcome: "private" }));
});

const listen = async (handler: (request: IncomingMessage, response: ServerResponse) => void) => {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing-test-port");
  return { server, port: address.port };
};

test("proxy is localhost-only, fixed-contract, bounded, and preserves provider response", async () => {
  const upstream = await listen((request, response) => {
    if (request.method === "GET" && request.url === "/ping") return response.writeHead(200, { "content-type": "application/json" }).end('{"version":"1.3.1"}');
    if (request.method === "POST" && request.url === "/get_pot") return response.writeHead(201, { "content-type": "application/json" })
      .end(JSON.stringify({ poToken: String.fromCharCode(97), contentBinding: String.fromCharCode(98), expiresAt: "2030-01-01T00:00:00.000Z" }));
    response.writeHead(404).end();
  });
  const reserved = await listen((_request, response) => response.end());
  const proxyPort = reserved.port;
  await new Promise<void>((resolve) => reserved.server.close(() => resolve()));
  const proxy = new ProviderTelemetryProxy(upstream.port, proxyPort);
  await proxy.start();
  try {
    const collector = new AcquisitionTelemetryCollector(runtime);
    const health = await fetch(`http://127.0.0.1:${proxyPort}/ping`);
    assert.equal(health.status, 200);
    assert.equal(collector.snapshot().acquisitionProviderRequest, "NO");
    await proxy.observe(collector, async () => {
      const response = await fetch(`http://127.0.0.1:${proxyPort}/get_pot`, { method: "POST", body: "{}",
        headers: { "content-type": "application/json" } });
      assert.equal(response.status, 201);
      assert.equal((await response.json() as { contentBinding: string }).contentBinding, String.fromCharCode(98));
    });
    assert.equal(collector.snapshot().acquisitionProviderSuccess, "YES");
    assert.equal(collector.snapshot().providerTokenResponseObserved, "YES");
    assert.equal(collector.snapshot().providerTokenSchemaValid, "YES");
    assert.equal((await fetch(`http://127.0.0.1:${proxyPort}/anything`)).status, 404);
    const oversized = await fetch(`http://127.0.0.1:${proxyPort}/get_pot`, { method: "POST",
      body: "x".repeat(PROVIDER_PROXY_BODY_LIMIT + 1) });
    assert.equal(oversized.status, 413);
  } finally {
    await proxy.close();
    await new Promise<void>((resolve) => upstream.server.close(() => resolve()));
  }
});

test("closed token contexts and process stages reject arbitrary values", () => {
  for (const tokenContext of ["GVS", "PLAYER", "SUBS", "UNKNOWN"] as const) {
    const collector = new AcquisitionTelemetryCollector(runtime);
    collector.providerTokenResponse(true, true, tokenContext);
    assert.equal(collector.snapshot().tokenContext, tokenContext);
  }
  const diagnostic = new AcquisitionTelemetryCollector(runtime).snapshot();
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...diagnostic, tokenContext: "ARBITRARY" }));
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...diagnostic, http403Stage: "ARBITRARY" }));
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...diagnostic, retryCount: 1 }));
  for (const selectedTransport of ["HLS", "DIRECT", "DASH", "UNKNOWN"] as const) {
    assert.equal(validateAcquisitionSafeTelemetry({ ...diagnostic, selectedTransport }).selectedTransport, selectedTransport);
  }
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...diagnostic, selectedTransport: "ARBITRARY" }));
  for (const http403Stage of ["HLS_MANIFEST", "HLS_FRAGMENT"] as const) {
    assert.equal(validateAcquisitionSafeTelemetry({ ...diagnostic, http403Stage }).http403Stage, http403Stage);
  }
});

test("HLS manifest and fragment evidence remain closed tri-state fields", () => {
  const diagnostic = new AcquisitionTelemetryCollector(runtime).snapshot();
  for (const state of ["YES", "NO", "UNKNOWN"] as const) {
    const projected = validateAcquisitionSafeTelemetry({ ...diagnostic,
      hlsManifestReached: state, hlsFragmentReached: state });
    assert.equal(projected.hlsManifestReached, state);
    assert.equal(projected.hlsFragmentReached, state);
  }
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...diagnostic, hlsManifestReached: "ARBITRARY" }));
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...diagnostic, hlsFragmentReached: "ARBITRARY" }));
});

test("player client uses the existing closed authority without weakening exact keys", () => {
  const diagnostic = new AcquisitionTelemetryCollector(runtime).snapshot();
  assert.equal(validateAcquisitionSafeTelemetry(diagnostic).playerClient, "MWEB");
  assert.equal(validateAcquisitionSafeTelemetry({ ...diagnostic, playerClient: "OTHER" }).playerClient, "OTHER");
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...diagnostic, playerClient: "WEB_EMBEDDED" }));
  const missingPlayerClient: Record<string, unknown> = { ...diagnostic };
  delete missingPlayerClient.playerClient;
  assert.throws(() => validateAcquisitionSafeTelemetry(missingPlayerClient));
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...diagnostic, extra: "UNKNOWN" }));
});

test("provider schema validation is exact without projecting response material", () => {
  const valid = Buffer.from(JSON.stringify({ poToken: String.fromCharCode(97), contentBinding: String.fromCharCode(98),
    expiresAt: "2030-01-01T00:00:00.000Z" }));
  assert.equal(validateProviderTokenResponseSchema(valid), true);
  assert.equal(validateProviderTokenResponseSchema(Buffer.from('{"poToken":""}')), false);
  assert.equal(validateProviderTokenResponseSchema(Buffer.from("not-json")), false);
});
