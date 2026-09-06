import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createProductionValidationBoundary,
  PRODUCTION_VALIDATION_BODY_LIMIT_BYTES,
  type ProductionValidationBoundaryDependencies,
} from "../../lib/server/acquisitionWorkerTrust/productionValidationBoundary";
import type { AcquisitionResult } from "../../lib/server/acquisitionWorker/types";

const acquisitionId = "123e4567-e89b-42d3-a456-426614174000";
const sourceUrl = "https://www.youtube.com/watch?v=DaxWpqigjrs";
const sha256 = "a".repeat(64);
const success: AcquisitionResult = Object.freeze({
  acquisitionId, status: "succeeded", artifactReference: `handoff:v1:${acquisitionId}:${sha256}`,
  media: Object.freeze({ contentType: "video/mp4", byteSize: 1024, durationSeconds: 10, hasVideo: true, hasAudio: true }),
  handoff: Object.freeze({ artifactReference: `handoff:v1:${acquisitionId}:${sha256}`, contentType: "video/mp4",
    byteSize: 1024, sha256, workerObservedDurationSeconds: 10, videoPresent: true, audioPresent: true,
    expiresAt: "2099-01-01T00:00:00.000Z" }),
});

const environment = Object.freeze({
  VERCEL_ENV: "production",
  NEXCUT_PRODUCTION_ACQUISITION_VALIDATION_ENABLED: "true",
  NEXCUT_PRODUCTION_ACQUISITION_VALIDATION_OWNER_UID: "owner-uid",
  NEXCUT_PRODUCTION_ACQUISITION_VALIDATION_ID: acquisitionId,
  NEXCUT_PRODUCTION_ACQUISITION_VALIDATION_SOURCE_URL: sourceUrl,
});

const body = (operation: "initial" | "status" | "replay" = "initial") =>
  JSON.stringify({ requestVersion: "1.0", operation });

const request = (input: Readonly<{ method?: string; body?: string; headers?: Record<string, string>; origin?: string }> = {}) =>
  new Request("https://nexcut.example/api/internal/acquisition-worker-owner-e2e", {
    method: input.method ?? "POST",
    headers: { "content-type": "application/json", origin: input.origin ?? "https://nexcut.example", ...input.headers },
    ...(input.method === "GET" ? {} : { body: input.body ?? body() }),
  });

const harness = (overrides: Partial<ProductionValidationBoundaryDependencies> = {}) => {
  const calls = { authenticate: 0, invoke: 0, lookup: 0, requests: [] as unknown[] };
  const dependencies: ProductionValidationBoundaryDependencies = {
    environment,
    async authenticate() { calls.authenticate += 1; return { ok: true, userId: "owner-uid" }; },
    async invoke(value) { calls.invoke += 1; calls.requests.push(value); return { result: success }; },
    async lookup() { calls.lookup += 1; return success; },
    ...overrides,
  };
  return { calls, execute: createProductionValidationBoundary(dependencies) };
};

const payload = async (response: Response): Promise<Record<string, unknown>> => response.json() as Promise<Record<string, unknown>>;

test("method, declared size, and content type fail before authentication or trust invocation", async () => {
  for (const candidate of [
    request({ method: "GET" }),
    request({ headers: { "content-length": String(PRODUCTION_VALIDATION_BODY_LIMIT_BYTES + 1) } }),
    request({ headers: { "content-type": "text/plain" } }),
  ]) {
    const { calls, execute } = harness();
    const response = await execute(candidate);
    assert.ok([405, 413, 415].includes(response.status));
    assert.deepEqual(calls, { authenticate: 0, invoke: 0, lookup: 0, requests: [] });
  }
  assert.equal(PRODUCTION_VALIDATION_BODY_LIMIT_BYTES, 256);
});

test("request media type accepts only JSON with no parameter or one UTF-8 charset", async () => {
  for (const contentType of [
    "application/json",
    "application/json; charset=utf-8",
    "Application/JSON; Charset=UTF-8",
    " application/json ; charset = \"utf-8\" ",
  ]) {
    const { calls, execute } = harness();
    assert.equal((await execute(request({ headers: { "content-type": contentType } }))).status, 200);
    assert.equal(calls.invoke, 1);
  }
  const missing = new Request("https://nexcut.example/api/internal/acquisition-worker-owner-e2e", {
    method: "POST", headers: { origin: "https://nexcut.example" }, body: body(),
  });
  const rejected = [
    missing,
    ...[
      "application/json; foo=bar",
      "application/json; charset=iso-8859-1",
      "application/json; charset=utf-8; foo=bar",
      "application/json; charset=utf-8; charset=utf-8",
      "application/json;",
      "application/ld+json",
      "text/json",
      "text/plain",
      "not a media type",
    ].map((contentType) => request({ headers: { "content-type": contentType } })),
  ];
  for (const candidate of rejected) {
    const { calls, execute } = harness();
    assert.equal((await execute(candidate)).status, 415);
    assert.equal(calls.authenticate, 0);
    assert.equal(calls.invoke, 0);
    assert.equal(calls.lookup, 0);
  }
});

test("authentication, owner, origin, production, and capability gates fail closed", async () => {
  const cases: Array<Partial<ProductionValidationBoundaryDependencies> & { req?: Request }> = [
    { authenticate: async () => ({ ok: false, response: new Response(null, { status: 401 }) }) },
    { authenticate: async () => ({ ok: true, userId: "other" }) },
    { req: request({ origin: "https://cross-origin.example" }) },
    { environment: { ...environment, VERCEL_ENV: "preview" } },
    { environment: { ...environment, NEXCUT_PRODUCTION_ACQUISITION_VALIDATION_ENABLED: "false" } },
    { environment: { ...environment, NEXCUT_PRODUCTION_ACQUISITION_VALIDATION_ENABLED: undefined } },
  ];
  for (const candidate of cases) {
    const { calls, execute } = harness(candidate);
    const response = await execute(candidate.req ?? request());
    assert.ok([401, 403, 404].includes(response.status));
    assert.equal(calls.invoke, 0);
    assert.equal(calls.lookup, 0);
  }
});

test("body is bounded in-stream and exact schema rejects malformed or broadened input", async () => {
  const invalid = [
    "x".repeat(PRODUCTION_VALIDATION_BODY_LIMIT_BYTES + 1),
    "{", "[]", "null", "{}",
    JSON.stringify({ requestVersion: "1.0" }),
    JSON.stringify({ requestVersion: "1.0", operation: "initial", other: true }),
    JSON.stringify({ requestVersion: "2.0", operation: "initial" }),
    JSON.stringify({ requestVersion: "1.0", operation: "other" }),
    JSON.stringify({ requestVersion: "1.0", operation: "initial", acquisitionId: "other" }),
    JSON.stringify({ requestVersion: "1.0", operation: "initial", sourceUrl: "https://example.com" }),
  ];
  for (const candidate of invalid) {
    const { calls, execute } = harness();
    const response = await execute(request({ body: candidate }));
    assert.ok([400, 413].includes(response.status));
    assert.equal(calls.invoke, 0);
    assert.equal(calls.lookup, 0);
  }
});

test("malformed configured UUID and unsupported configured URL fail before invocation", async () => {
  for (const env of [
    { ...environment, NEXCUT_PRODUCTION_ACQUISITION_VALIDATION_ID: "not-a-uuid" },
    { ...environment, NEXCUT_PRODUCTION_ACQUISITION_VALIDATION_SOURCE_URL: "https://example.com/video" },
  ]) {
    const { calls, execute } = harness({ environment: env });
    assert.equal((await execute(request())).status, 400);
    assert.equal(calls.invoke, 0);
    assert.equal(calls.lookup, 0);
  }
});

test("initial and replay invoke once with identical frozen canonical request", async () => {
  const seen: unknown[] = [];
  for (const operation of ["initial", "replay"] as const) {
    const { calls, execute } = harness({ async invoke(value) { seen.push(value); return { result: success }; } });
    const response = await execute(request({ body: body(operation) }));
    assert.equal(response.status, 200);
    assert.equal(calls.lookup, 0);
  }
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0], seen[1]);
  assert.deepEqual(seen[0], {
    requestVersion: "1.0", acquisitionId, source: "youtube", sourceUrl,
    requestedOutputProfile: "canonical-mp4", maxBytes: 2147483648, timeoutMs: 240000,
  });
});

test("status performs one non-acquiring lookup of only the configured ID", async () => {
  const { calls, execute } = harness();
  const response = await execute(request({ body: body("status") }));
  assert.equal(response.status, 200);
  assert.equal(calls.lookup, 1);
  assert.equal(calls.invoke, 0);
  assert.equal((await payload(response)).acquisitionId, acquisitionId);
});

test("status miss is closed and contains no source identity", async () => {
  const { execute } = harness({ lookup: async () => undefined });
  const value = await payload(await execute(request({ body: body("status") })));
  assert.deepEqual(value, { responseVersion: "1.0", operation: "status", acquisitionId, status: "not-found" });
  assert.doesNotMatch(JSON.stringify(value), /youtube\.com|sourceUrl|authorization|token/i);
});

test("success response projects only approved handoff metadata", async () => {
  const unsafe = { result: success, diagnostic: { raw: "stderr", token: "secret" } } as never;
  const { execute } = harness({ invoke: async () => unsafe });
  const value = await payload(await execute(request()));
  assert.deepEqual(Object.keys(value).sort(), [
    "acquisitionId", "artifactReference", "audioPresent", "byteSize", "contentType", "durationSeconds",
    "expiresAt", "operation", "responseVersion", "sha256", "status", "videoPresent",
  ].sort());
  assert.doesNotMatch(JSON.stringify(value), /youtube\.com|sourceUrl|authorization|token|stderr|signedUrl/i);
});

test("failure response is closed and rejects an unvalidated diagnostic projection", async () => {
  const failure: AcquisitionResult = { acquisitionId, status: "failed", errorCode: "youtube-bot-check", retryable: false };
  const { execute } = harness({ invoke: async () => ({ result: failure }) });
  assert.deepEqual(await payload(await execute(request())), {
    responseVersion: "1.0", operation: "initial", acquisitionId, status: "failed",
    errorCode: "youtube-bot-check", retryable: false,
  });
  const unsafe = harness({ invoke: async () => ({ result: failure, diagnostic: { raw: "private" } as never }) });
  const rejected = await payload(await unsafe.execute(request()));
  assert.equal(rejected.errorCode, "worker-unavailable");
  assert.doesNotMatch(JSON.stringify(rejected), /private|raw/);
});

test("implementation has no generic proxy, URL logging, GCS, AssetImport, or direct importer path", () => {
  const route = readFileSync("app/api/internal/acquisition-worker-owner-e2e/route.ts", "utf8");
  const boundary = readFileSync("lib/server/acquisitionWorkerTrust/productionValidationBoundary.ts", "utf8");
  const source = `${route}\n${boundary}`;
  assert.doesNotMatch(source, /invokeProductionAcquisitionWorkerAt|\/api\/v1\/assets\/import|directYouTubeImporter/);
  assert.doesNotMatch(source, /@google-cloud\/storage|console\.|fetch\(|request\.json\(|randomUUID/);
  assert.doesNotMatch(route, /NEXCUT_PRODUCTION_ACQUISITION_VALIDATION_SOURCE_URL|sourceUrl/);
});
