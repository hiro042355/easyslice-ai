import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ValidatedAcquisitionRequest } from "../../lib/server/acquisitionWorker/contracts";
import type { AcquisitionWorkerInvocationResult } from "../../lib/server/acquisitionWorkerTrust/client";
import {
  CONTROL_UUID_CONFIG_NAME,
  CONTROL_WORKER_URL,
  PROVIDER_EXPERIMENT_SOURCE_URL,
  TREATMENT_UUID_CONFIG_NAME,
  TREATMENT_WORKER_URL,
  createProviderExperimentBoundary,
} from "../../lib/server/acquisitionWorkerTrust/providerExperimentBoundary";

const controlUuid = "11111111-1111-4111-8111-111111111111";
const treatmentUuid = "22222222-2222-4222-8222-222222222222";
const environment = Object.freeze({
  VERCEL_ENV: "production",
  NEXCUT_PRODUCTION_OWNER_UID: "owner",
  [CONTROL_UUID_CONFIG_NAME]: controlUuid,
  [TREATMENT_UUID_CONFIG_NAME]: treatmentUuid,
});
const failed = (acquisitionId: string): AcquisitionWorkerInvocationResult => Object.freeze({
  result: Object.freeze({ acquisitionId, status: "failed", errorCode: "youtube-bot-check", retryable: false }),
});

const harness = (overrides: Partial<Parameters<typeof createProviderExperimentBoundary>[0]> = {}) => {
  const calls: Array<{ url: string; request: ValidatedAcquisitionRequest }> = [];
  const dependencies = {
    environment,
    authenticate: async () => ({ ok: true as const, userId: "owner" }),
    invokeAt: async (url: string, request: ValidatedAcquisitionRequest) => {
      calls.push({ url, request });
      return failed(request.acquisitionId);
    },
    ...overrides,
  };
  return { calls, execute: createProviderExperimentBoundary(dependencies) };
};

const request = (body?: unknown, origin = "https://nexcut.example") => new Request(
  `${origin}/api/internal/acquisition-worker-provider-experiment`,
  {
    method: "POST",
    headers: { origin, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  },
);

test("owner authentication and same-origin checks fail before invocation", async () => {
  const unauthenticated = harness({ authenticate: async () => ({ ok: false, response: new Response(null, { status: 401 }) }) });
  assert.equal((await unauthenticated.execute(request())).status, 401);
  assert.equal(unauthenticated.calls.length, 0);
  const nonOwner = harness({ authenticate: async () => ({ ok: true, userId: "other" }) });
  assert.equal((await nonOwner.execute(request())).status, 403);
  assert.equal(nonOwner.calls.length, 0);
  const crossOrigin = harness();
  assert.equal((await crossOrigin.execute(request(undefined, "https://other.example"))).status, 200);
  const mismatched = new Request("https://nexcut.example/api/internal/acquisition-worker-provider-experiment", { method: "POST", headers: { origin: "https://other.example" } });
  assert.equal((await crossOrigin.execute(mismatched)).status, 403);
});

test("client payload cannot select condition, destination, audience, source, UUID, profile, or operation", async () => {
  const instance = harness();
  const response = await instance.execute(request({
    condition: "TREATMENT", workerUrl: "https://attacker.invalid", audience: "attacker",
    sourceUrl: "https://attacker.invalid/video", acquisitionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    requestedOutputProfile: "other", operation: "other",
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(instance.calls.map(({ url, request: value }) => ({ url, ...value })), [
    { url: CONTROL_WORKER_URL, requestVersion: "1.0", acquisitionId: controlUuid, source: "youtube", sourceUrl: PROVIDER_EXPERIMENT_SOURCE_URL, requestedOutputProfile: "canonical-mp4", maxBytes: 2147483648, timeoutMs: 240000 },
    { url: TREATMENT_WORKER_URL, requestVersion: "1.0", acquisitionId: treatmentUuid, source: "youtube", sourceUrl: PROVIDER_EXPERIMENT_SOURCE_URL, requestedOutputProfile: "canonical-mp4", maxBytes: 2147483648, timeoutMs: 240000 },
  ]);
});

test("missing, malformed, or equal UUID configuration fails closed before either invocation", async () => {
  const invalid = [
    { ...environment, [CONTROL_UUID_CONFIG_NAME]: undefined },
    { ...environment, [TREATMENT_UUID_CONFIG_NAME]: undefined },
    { ...environment, [CONTROL_UUID_CONFIG_NAME]: "invalid" },
    { ...environment, [TREATMENT_UUID_CONFIG_NAME]: "invalid" },
    { ...environment, [TREATMENT_UUID_CONFIG_NAME]: controlUuid },
  ];
  for (const candidate of invalid) {
    const instance = harness({ environment: candidate });
    assert.equal((await instance.execute(request())).status, 400);
    assert.equal(instance.calls.length, 0);
  }
});

test("control then treatment each execute exactly once with condition-bound UUIDs", async () => {
  const instance = harness();
  const response = await instance.execute(request());
  assert.equal(response.status, 200);
  assert.deepEqual(instance.calls.map((call) => [call.url, call.request.acquisitionId]), [
    [CONTROL_WORKER_URL, controlUuid],
    [TREATMENT_WORKER_URL, treatmentUuid],
  ]);
});

test("a control failure is projected safely and treatment still runs without retry", async () => {
  let count = 0;
  const instance = harness({ invokeAt: async (url, input) => {
    count += 1;
    if (url === CONTROL_WORKER_URL) throw new Error("opaque-token raw stderr private");
    return failed(input.acquisitionId);
  } });
  const body = await (await instance.execute(request())).json();
  assert.equal(count, 2);
  assert.deepEqual(body, {
    responseVersion: "1.0",
    comparisonCompleteness: "INCOMPLETE",
    control: { condition: "CONTROL", observationAuthority: "NON_AUTHORITATIVE_TRANSPORT_OUTCOME", status: "failed", errorCode: "worker-unavailable", retryable: false },
    treatment: { condition: "TREATMENT", observationAuthority: "AUTHORITATIVE_WORKER_RESULT", status: "failed", errorCode: "youtube-bot-check", retryable: false },
  });
  assert.doesNotMatch(JSON.stringify(body), /opaque-token|raw stderr|private/i);
});

test("a treatment transport failure is not retried", async () => {
  let controlCalls = 0;
  let treatmentCalls = 0;
  const instance = harness({ invokeAt: async (url, input) => {
    if (url === CONTROL_WORKER_URL) controlCalls += 1;
    else { treatmentCalls += 1; throw new Error("ambiguous transport"); }
    return failed(input.acquisitionId);
  } });
  const body = await (await instance.execute(request())).json();
  assert.equal(controlCalls, 1);
  assert.equal(treatmentCalls, 1);
  assert.equal(body.comparisonCompleteness, "INCOMPLETE");
  assert.equal(body.control.observationAuthority, "AUTHORITATIVE_WORKER_RESULT");
  assert.equal(body.treatment.observationAuthority, "NON_AUTHORITATIVE_TRANSPORT_OUTCOME");
});

test("two authoritative bounded failures form a complete comparison", async () => {
  const instance = harness();
  const body = await (await instance.execute(request({ comparisonCompleteness: "INCOMPLETE" }))).json();
  assert.equal(body.comparisonCompleteness, "COMPLETE");
  assert.equal(body.control.observationAuthority, "AUTHORITATIVE_WORKER_RESULT");
  assert.equal(body.treatment.observationAuthority, "AUTHORITATIVE_WORKER_RESULT");
});

test("both non-authoritative transport outcomes form an incomplete comparison without retry", async () => {
  let calls = 0;
  const instance = harness({ invokeAt: async () => { calls += 1; throw new Error("raw-token private stderr"); } });
  const body = await (await instance.execute(request())).json();
  assert.equal(calls, 2);
  assert.equal(body.comparisonCompleteness, "INCOMPLETE");
  assert.equal(body.control.observationAuthority, "NON_AUTHORITATIVE_TRANSPORT_OUTCOME");
  assert.equal(body.treatment.observationAuthority, "NON_AUTHORITATIVE_TRANSPORT_OUTCOME");
  assert.doesNotMatch(JSON.stringify(body), /raw-token|private stderr/i);
});

test("the two semantic payloads differ only by their condition-bound UUID", async () => {
  const instance = harness();
  await instance.execute(request());
  const [control, treatment] = instance.calls.map((call) => ({ ...call.request, acquisitionId: "condition-bound" }));
  assert.deepEqual(control, treatment);
  assert.equal(Object.keys(control ?? {}).some((key) => /provider|token|audience|worker/i.test(key)), false);
});

test("successful results expose only bounded condition-labelled observations", async () => {
  const instance = harness({ invokeAt: async (_url, input) => ({ result: {
    acquisitionId: input.acquisitionId, status: "succeeded", artifactReference: `handoff:v1:${input.acquisitionId}:${"a".repeat(64)}`,
    media: { contentType: "video/mp4", byteSize: 1, durationSeconds: 1, hasVideo: true, hasAudio: true },
    handoff: { artifactReference: `handoff:v1:${input.acquisitionId}:${"a".repeat(64)}`, contentType: "video/mp4", byteSize: 1,
      sha256: "a".repeat(64), workerObservedDurationSeconds: 1, videoPresent: true, audioPresent: true, expiresAt: "2030-01-01T00:00:00.000Z" },
  } }) });
  const serialized = JSON.stringify(await (await instance.execute(request())).json());
  assert.match(serialized, /"CONTROL"/);
  assert.match(serialized, /"TREATMENT"/);
  assert.match(serialized, /"comparisonCompleteness":"COMPLETE"/);
  assert.doesNotMatch(serialized, /handoff:|artifactReference|sha256|expiresAt|authorization|token|credential|cookie|stderr/i);
});

test("route reuses the existing owner guard and trusted invocation primitive without client parsing", () => {
  const route = readFileSync("app/api/internal/acquisition-worker-provider-experiment/route.ts", "utf8");
  const boundary = readFileSync("lib/server/acquisitionWorkerTrust/providerExperimentBoundary.ts", "utf8");
  assert.match(route, /requireAuthenticatedRequest/);
  assert.match(route, /invokeProductionAcquisitionWorkerAt/);
  assert.doesNotMatch(route, /getVercelOidcToken|IdentityPoolClient|request\.json|searchParams|randomUUID/);
  assert.match(boundary, new RegExp(CONTROL_WORKER_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(boundary, new RegExp(TREATMENT_WORKER_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(boundary, /pot_trace|print-traffic|authorization\s*:|authorization\)|cookie\s*:|rawStderr/i);
});
