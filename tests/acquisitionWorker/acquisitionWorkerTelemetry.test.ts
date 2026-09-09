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
    stderrCaptureComplete: "UNKNOWN",
    acquisitionExecutionBegan: "NO", providerPrecheckOutcome: "NOT_RUN", ytDlpSpawnAttempted: "NO",
    ytDlpProcessStarted: "NO", externalRequestStageReached: "UNKNOWN", has403: false, has429: false,
    ytDlpProcessTerminated: "UNKNOWN", providerRequestObservationCoverage: "NOT_STARTED",
    providerRequestCount: "UNKNOWN", providerTokenDemandObserved: "UNKNOWN",
    providerResponseObserved: "UNKNOWN", providerResponseSchemaOutcome: "UNKNOWN",
    providerRequestTemporalRelation: "UNKNOWN", has5xx: false, timeoutObserved: false,
    expectedPluginArtifactPresent: "YES", runtimePluginDetection: "UNKNOWN", providerConfigured: "YES",
    providerHealthy: "UNKNOWN", providerPluginConfigured: "UNKNOWN", providerPluginDiscovered: "UNKNOWN",
    providerPluginActivated: "UNKNOWN", acquisitionProviderRequest: "NO", acquisitionProviderSuccess: "NO",
    acquisitionProviderFailure: "NO", nodeConfigured: "YES", nodeExecutable: "YES", nodeVersionMatch: "YES",
    providerTokenResponseObserved: "NO", providerTokenSchemaValid: "UNKNOWN", tokenContext: "UNKNOWN",
    tokenRetrievedByYtDlp: "UNKNOWN", tokenAttachedToOutboundRequest: "UNKNOWN",
    tokenConsumedByYtDlp: "UNKNOWN", botCheckRelativeToTokenRetrieval: "UNKNOWN",
    botCheckRelativeToTokenAttachment: "UNKNOWN", playerClient: "MWEB", gvsRequestReached: "UNKNOWN",
    mediaRequestReached: "UNKNOWN", selectedTransport: "UNKNOWN", hlsManifestReached: "UNKNOWN",
    hlsFragmentReached: "UNKNOWN", http403Stage: "UNKNOWN", retryCount: 0,
    ejsAvailable: "YES", ejsActualUse: "UNKNOWN", configuredPlayerClient: "MWEB", observedPlayerClient: "UNKNOWN",
    jsChallengeObserved: "UNKNOWN", formatEnumerationObserved: "UNKNOWN", mediaRequestObserved: "UNKNOWN",
    mediaBytesObserved: "UNKNOWN", safeFailureCode: "NONE", failureStage: "UNKNOWN", processFailureFamily: "NONE",
    botCheckEvidenceStage: "UNKNOWN", botCheckEvidenceKind: "UNKNOWN",
    extractorTerminatedWithoutObservedProviderRequest: "UNKNOWN", extractorTerminatedBeforeProviderRequest: "UNKNOWN",
    postRetrievalExternalRequestStage: "UNKNOWN",
  });
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...diagnostic, arbitrary: "private" }));
  const serialized = JSON.stringify(diagnostic);
  assert.doesNotMatch(serialized, /https?:|youtu|video.?id|uid|ip.?address|poToken|tokenHash|cookie|credential|authorization|stdout|rawStderr|command|filesystem|path/i);
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

test("plugin configuration remains distinct from discovery, activation, and token request", () => {
  const collector = new AcquisitionTelemetryCollector(runtime);
  collector.providerPluginConfiguration(true);
  const configured = collector.snapshot();
  assert.equal(configured.providerPluginConfigured, "YES");
  assert.equal(configured.providerPluginDiscovered, "UNKNOWN");
  assert.equal(configured.providerPluginActivated, "UNKNOWN");
  assert.equal(configured.acquisitionProviderRequest, "NO");
});

test("closed process observations populate independently while missing evidence remains UNKNOWN", () => {
  const collector = new AcquisitionTelemetryCollector(runtime);
  collector.providerPluginConfiguration(true);
  collector.processEvidence({
    providerPluginDiscovered: "YES", providerPluginActivated: "UNKNOWN", observedPlayerClient: "WEB",
    ejsActualUse: "YES", jsChallengeObserved: "YES", formatEnumerationObserved: "YES",
    mediaRequestObserved: "YES", mediaBytesObserved: "UNKNOWN", tokenContext: "UNKNOWN",
    tokenRetrievedByYtDlp: "UNKNOWN", tokenAttachedToOutboundRequest: "UNKNOWN",
    tokenConsumedByYtDlp: "UNKNOWN", botCheckRelativeToTokenRetrieval: "UNKNOWN",
    botCheckRelativeToTokenAttachment: "UNKNOWN", gvsRequestReached: "UNKNOWN", mediaRequestReached: "YES",
    selectedTransport: "DIRECT", hlsManifestReached: "UNKNOWN", hlsFragmentReached: "UNKNOWN",
    http403Stage: "UNKNOWN", botCheckEvidenceStage: "UNKNOWN", botCheckEvidenceKind: "UNKNOWN",
  });
  const value = collector.snapshot();
  assert.equal(value.providerPluginConfigured, "YES");
  assert.equal(value.providerPluginDiscovered, "YES");
  assert.equal(value.providerPluginActivated, "UNKNOWN");
  assert.equal(value.acquisitionProviderRequest, "NO");
  assert.equal(value.observedPlayerClient, "WEB");
  assert.equal(value.ejsActualUse, "YES");
  assert.equal(value.jsChallengeObserved, "YES");
  assert.equal(value.formatEnumerationObserved, "YES");
  assert.equal(value.mediaRequestObserved, "YES");
  assert.equal(value.mediaBytesObserved, "UNKNOWN");
  assert.equal(value.tokenConsumedByYtDlp, "UNKNOWN");
  assert.equal(value.postRetrievalExternalRequestStage, "UNKNOWN");
});

test("explicit extractor bot-check termination closes only the pre-provider-request boundary", () => {
  const collector = new AcquisitionTelemetryCollector(runtime);
  collector.providerPluginConfiguration(true);
  collector.ytDlpStarted();
  collector.processEvidence({ tokenContext: "UNKNOWN", tokenRetrievedByYtDlp: "UNKNOWN",
    tokenAttachedToOutboundRequest: "UNKNOWN", tokenConsumedByYtDlp: "UNKNOWN",
    botCheckRelativeToTokenRetrieval: "UNKNOWN", botCheckRelativeToTokenAttachment: "UNKNOWN",
    providerPluginDiscovered: "UNKNOWN", providerPluginActivated: "UNKNOWN", observedPlayerClient: "UNKNOWN",
    ejsActualUse: "UNKNOWN", jsChallengeObserved: "UNKNOWN", formatEnumerationObserved: "UNKNOWN",
    mediaRequestObserved: "UNKNOWN", mediaBytesObserved: "UNKNOWN",
    gvsRequestReached: "UNKNOWN", mediaRequestReached: "UNKNOWN", selectedTransport: "UNKNOWN",
    hlsManifestReached: "UNKNOWN", hlsFragmentReached: "UNKNOWN", http403Stage: "UNKNOWN",
    botCheckEvidenceStage: "EXTRACTOR_LEXICAL", botCheckEvidenceKind: "LEXICAL" });
  collector.providerObservationStarted();
  collector.processTerminated();
  collector.providerObservationComplete();
  const value = collector.snapshot();
  assert.equal(value.failureStage, "EXTRACTOR");
  assert.equal(value.extractorTerminatedBeforeProviderRequest, "UNKNOWN");
  assert.equal(value.extractorTerminatedWithoutObservedProviderRequest, "YES");
  assert.equal(value.providerRequestTemporalRelation, "NOT_OBSERVED");
  assert.equal(value.acquisitionProviderRequest, "NO");
  assert.equal(value.externalRequestStageReached, "UNKNOWN");
  assert.equal(value.gvsRequestReached, "UNKNOWN");
  assert.equal(value.mediaRequestReached, "UNKNOWN");
});

test("provider observation projects affirmative zero only after complete coverage", () => {
  const collector = new AcquisitionTelemetryCollector(runtime);
  collector.providerObservationStarted();
  assert.equal(collector.snapshot().providerRequestCount, "UNKNOWN");
  assert.equal(collector.snapshot().providerTokenDemandObserved, "UNKNOWN");
  collector.providerObservationInterrupted();
  assert.equal(collector.snapshot().providerRequestCount, "UNKNOWN");
  assert.equal(collector.snapshot().providerRequestTemporalRelation, "UNKNOWN");

  const complete = new AcquisitionTelemetryCollector(runtime);
  complete.providerObservationStarted();
  complete.providerObservationComplete();
  assert.equal(complete.snapshot().providerRequestCount, "ZERO");
  assert.equal(complete.snapshot().providerRequestTemporalRelation, "NOT_OBSERVED");
  assert.equal(complete.snapshot().providerResponseObserved, "UNKNOWN");
  assert.equal(complete.snapshot().providerResponseSchemaOutcome, "NOT_OBSERVED");
});

test("provider request buckets and response schema outcomes remain independent", () => {
  const collector = new AcquisitionTelemetryCollector(runtime);
  collector.providerObservationStarted();
  collector.providerRequest();
  assert.equal(collector.snapshot().providerRequestCount, "ONE");
  assert.equal(collector.snapshot().providerRequestTemporalRelation, "BEFORE_TERMINATION");
  assert.equal(collector.snapshot().providerResponseObserved, "UNKNOWN");
  collector.providerTokenResponse(true, false);
  assert.equal(collector.snapshot().providerResponseObserved, "YES");
  assert.equal(collector.snapshot().providerResponseSchemaOutcome, "INVALID");
  assert.equal(collector.snapshot().tokenConsumedByYtDlp, "UNKNOWN");
  collector.providerRequest();
  assert.equal(collector.snapshot().providerRequestCount, "MULTIPLE");
  collector.providerObservationComplete();
  assert.equal(collector.snapshot().providerRequestCount, "MULTIPLE");

  const failed = new AcquisitionTelemetryCollector(runtime);
  failed.providerObservationStarted();
  failed.providerRequest();
  failed.providerTokenResponse(false, false);
  assert.equal(failed.snapshot().providerResponseObserved, "NO");
  assert.equal(failed.snapshot().providerResponseSchemaOutcome, "NOT_OBSERVED");
  failed.providerTokenResponse(true, true);
  assert.equal(failed.snapshot().providerResponseSchemaOutcome, "VALID");
});

test("validator rejects contradictory cross-field evidence without exposing values", () => {
  const base = new AcquisitionTelemetryCollector(runtime).snapshot();
  const reject = (candidate: unknown) => {
    let message = "";
    assert.throws(() => validateAcquisitionSafeTelemetry(candidate), (error: unknown) => {
      message = error instanceof Error ? error.message : String(error);
      return true;
    });
    assert.equal(message, "invalid-acquisition-telemetry-invariant");
    assert.doesNotMatch(message, /private-source|secret-token|stdout|stderr|provider-body/i);
  };
  reject({ ...base, extractorTerminatedBeforeProviderRequest: "YES" });
  reject({ ...base, extractorTerminatedBeforeProviderRequest: "NO" });
  const corrected = { ...base, extractorTerminatedWithoutObservedProviderRequest: "YES",
    ytDlpProcessTerminated: "YES", botCheckEvidenceStage: "EXTRACTOR_LEXICAL", botCheckEvidenceKind: "LEXICAL" } as const;
  reject({ ...corrected, providerRequestObservationCoverage: "NOT_STARTED", providerRequestCount: "UNKNOWN" });
  reject({ ...corrected, providerRequestObservationCoverage: "INTERRUPTED", providerRequestCount: "UNKNOWN" });
  reject({ ...corrected, providerRequestObservationCoverage: "COMPLETE", providerRequestCount: "ONE",
    acquisitionProviderRequest: "YES" });
  reject({ ...corrected, providerRequestObservationCoverage: "COMPLETE", providerRequestCount: "ZERO",
    botCheckEvidenceStage: "PLAYER_RESPONSE_LEXICAL" });
  for (const coverage of ["NOT_STARTED", "INTERRUPTED", "UNKNOWN"] as const) {
    reject({ ...base, providerRequestCount: "ZERO", providerRequestObservationCoverage: coverage });
  }
  const zero = { ...base, providerRequestObservationCoverage: "COMPLETE", providerRequestCount: "ZERO" } as const;
  reject({ ...zero, providerRequestTemporalRelation: "BEFORE_TERMINATION" });
  reject({ ...zero, providerRequestTemporalRelation: "AFTER_TERMINATION" });
  for (const count of ["ONE", "MULTIPLE"] as const) {
    reject({ ...base, providerRequestObservationCoverage: "COMPLETE", providerRequestCount: count,
      acquisitionProviderRequest: "YES", providerRequestTemporalRelation: "NOT_OBSERVED" });
  }
  reject({ ...zero, providerResponseObserved: "YES" });
  reject({ ...zero, providerResponseObserved: "NO" });
  for (const schema of ["VALID", "INVALID"] as const) {
    reject({ ...base, providerRequestObservationCoverage: "UNKNOWN", providerRequestCount: "ONE",
      acquisitionProviderRequest: "YES", providerResponseSchemaOutcome: schema, providerResponseObserved: "UNKNOWN" });
    reject({ ...base, providerRequestObservationCoverage: "UNKNOWN", providerRequestCount: "ONE",
      acquisitionProviderRequest: "YES", providerResponseSchemaOutcome: schema, providerResponseObserved: "NO" });
  }
  reject({ ...base, providerRequestObservationCoverage: "UNKNOWN", providerRequestCount: "ONE",
    acquisitionProviderRequest: "YES", providerResponseObserved: "YES", providerResponseSchemaOutcome: "NOT_OBSERVED" });
  reject({ ...base, botCheckEvidenceStage: "EXTRACTOR_LEXICAL", botCheckEvidenceKind: "UNKNOWN" });
  reject({ ...base, botCheckEvidenceStage: "UNKNOWN", botCheckEvidenceKind: "LEXICAL" });
  let privacyMessage = "";
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...base, arbitrary: "private-source secret-token" }), (error: unknown) => {
    privacyMessage = error instanceof Error ? error.message : String(error);
    return true;
  });
  assert.equal(privacyMessage, "invalid-acquisition-telemetry");
  assert.doesNotMatch(privacyMessage, /private-source|secret-token/i);
});

test("validator accepts only evidence-supported cross-field combinations", () => {
  const base = new AcquisitionTelemetryCollector(runtime).snapshot();
  const completeZero = validateAcquisitionSafeTelemetry({ ...base, ytDlpProcessTerminated: "YES",
    botCheckEvidenceStage: "EXTRACTOR_LEXICAL", botCheckEvidenceKind: "LEXICAL",
    providerRequestObservationCoverage: "COMPLETE", providerRequestCount: "ZERO",
    providerRequestTemporalRelation: "NOT_OBSERVED", providerResponseSchemaOutcome: "NOT_OBSERVED",
    extractorTerminatedWithoutObservedProviderRequest: "YES" });
  assert.equal(completeZero.extractorTerminatedWithoutObservedProviderRequest, "YES");
  assert.equal(completeZero.extractorTerminatedBeforeProviderRequest, "UNKNOWN");

  for (const schema of ["VALID", "INVALID"] as const) {
    const observed = validateAcquisitionSafeTelemetry({ ...base,
      providerRequestObservationCoverage: "UNKNOWN", providerRequestCount: "ONE",
      acquisitionProviderRequest: "YES", providerRequestTemporalRelation: "BEFORE_TERMINATION",
      providerResponseObserved: "YES", providerResponseSchemaOutcome: schema });
    assert.equal(observed.providerResponseSchemaOutcome, schema);
  }
  const interrupted = validateAcquisitionSafeTelemetry({ ...base,
    providerRequestObservationCoverage: "INTERRUPTED", providerRequestCount: "ONE",
    acquisitionProviderRequest: "YES", providerRequestTemporalRelation: "BEFORE_TERMINATION" });
  assert.equal(interrupted.providerRequestCount, "ONE");
  assert.equal(validateAcquisitionSafeTelemetry(base).providerPluginDiscovered, "UNKNOWN");
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
    collector.providerObservationStarted();
    collector.providerRequest();
    collector.providerTokenResponse(true, true, tokenContext);
    assert.equal(collector.snapshot().tokenContext, tokenContext);
  }
  const diagnostic = new AcquisitionTelemetryCollector(runtime).snapshot();
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...diagnostic, tokenContext: "ARBITRARY" }));
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...diagnostic, http403Stage: "ARBITRARY" }));
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...diagnostic, botCheckEvidenceStage: "ARBITRARY" }));
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...diagnostic, retryCount: 1 }));
  for (const selectedTransport of ["HLS", "DIRECT", "DASH", "UNKNOWN"] as const) {
    assert.equal(validateAcquisitionSafeTelemetry({ ...diagnostic, selectedTransport }).selectedTransport, selectedTransport);
  }
  assert.throws(() => validateAcquisitionSafeTelemetry({ ...diagnostic, selectedTransport: "ARBITRARY" }));
  for (const http403Stage of ["HLS_MANIFEST", "HLS_FRAGMENT"] as const) {
    assert.equal(validateAcquisitionSafeTelemetry({ ...diagnostic, http403Stage }).http403Stage, http403Stage);
  }
  for (const botCheckEvidenceStage of ["PRE_EXTERNAL_REQUEST_LEXICAL", "PLAYER_RESPONSE_LEXICAL", "GVS_RESPONSE_LEXICAL", "MEDIA_RESPONSE_LEXICAL", "EXTRACTOR_LEXICAL", "UNKNOWN"] as const) {
    assert.equal(validateAcquisitionSafeTelemetry({ ...diagnostic, botCheckEvidenceStage,
      botCheckEvidenceKind: botCheckEvidenceStage === "UNKNOWN" ? "UNKNOWN" : "LEXICAL" }).botCheckEvidenceStage, botCheckEvidenceStage);
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
