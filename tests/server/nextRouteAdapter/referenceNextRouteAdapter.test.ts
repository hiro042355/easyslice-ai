import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  ReferenceNextRouteAdapter,
  type NextRouteJsonValue,
} from "../../../lib/server/nextRouteAdapter/referenceNextRouteAdapter";
import type { HttpRequestEnvelope, HttpResultProjection } from "../../../lib/server/httpAdapter/types";

const context = {
  route: "generation-job" as const,
  requestIdentity: "request-1",
  correlationIdentity: "correlation-1",
};

const request = (
  body = '{"job":"job-1","input":{"title":"demo"}}',
  method = "POST",
  extraHeaders: HeadersInit = {},
): NextRequest => new NextRequest("https://example.invalid/api/jobs?secret=ignored", {
  method,
  body,
  headers: {
    "content-type": "application/json",
    "x-request-id": "request-1",
    "x-correlation-id": "correlation-1",
    cookie: "session=secret-cookie",
    authorization: "Bearer secret-token",
    "x-internal-provider": "provider-secret",
    ...Object.fromEntries(new Headers(extraHeaders)),
  },
});

const result = (
  status: "successful" | "rejected" | "unavailable",
  statusCode: number,
  outcome: string,
): HttpResultProjection<NextRouteJsonValue> => {
  const response = {
    envelopeVersion: "1.0" as const,
    request: { identityVersion: "1.0" as const, requestIdentity: "request-1" },
    correlation: { identityVersion: "1.0" as const, correlationIdentity: "correlation-1" },
    statusCode,
    statusClassification: statusCode >= 500 ? "server-error" as const : statusCode >= 400 ? "client-error" as const : "successful" as const,
    headers: [
      { headerVersion: "1.0" as const, nameClassification: "request-id" as const, value: "request-1", declarationOrder: 0 },
      { headerVersion: "1.0" as const, nameClassification: "correlation-id" as const, value: "correlation-1", declarationOrder: 1 },
      { headerVersion: "1.0" as const, nameClassification: "cache-control" as const, value: "no-store", declarationOrder: 2 },
    ],
    body: { bodyVersion: "1.0" as const, classification: "structured" as const, value: { responseVersion: "1.0", status: outcome } },
  };
  const audit = {
    auditVersion: "1.0" as const,
    request: response.request,
    correlation: response.correlation,
    entries: [],
    reasonCodes: [outcome],
  };
  if (status === "successful") return { resultVersion: "1.0", status, response, audit };
  return {
    resultVersion: "1.0",
    status,
    response,
    failures: [{ classification: status === "rejected" ? "invalid" : "unavailable", errorCode: status === "rejected" ? "request-invalid" : "service-unavailable", safeMessageClassification: status === "rejected" ? "request" : "availability" }],
    audit,
  };
};

test("projects a valid JSON request through the injected capability exactly once", async () => {
  const calls: HttpRequestEnvelope<NextRouteJsonValue>[] = [];
  const adapter = new ReferenceNextRouteAdapter({ adapt: async (envelope) => { calls.push(envelope); return result("successful", 202, "accepted"); } });
  const actual = await adapter.handle(request(), context);
  assert.equal(calls.length, 1);
  assert.equal(actual.status, 202);
  assert.equal(actual.headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(calls[0]?.metadata, {
    metadataVersion: "1.0", route: "generation-job", method: "create",
    request: { identityVersion: "1.0", requestIdentity: "request-1" },
    correlation: { identityVersion: "1.0", correlationIdentity: "correlation-1" },
    bodySizeClassification: "small", contentClassification: "structured",
  });
  assert.deepEqual(calls[0]?.body.value, { job: "job-1", input: { title: "demo" } });
  assert.deepEqual(calls[0]?.headers.map((header) => header.nameClassification), ["content-type", "request-id", "correlation-id"]);
  const serialized = JSON.stringify(calls[0]);
  for (const forbidden of ["secret-cookie", "secret-token", "provider-secret", "secret=ignored", "authorization", "cookie"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("malformed JSON, unsupported methods, duplicate headers, and invalid identities stop before invocation", async () => {
  let calls = 0;
  const adapter = new ReferenceNextRouteAdapter({ adapt: async () => { calls += 1; return result("successful", 200, "completed"); } });
  assert.equal((await adapter.handle(request("{"), context)).status, 400);
  assert.equal((await adapter.handle(request("{}", "OPTIONS"), context)).status, 405);
  assert.equal((await adapter.handle(request("{}", "POST", { "content-type": "application/json, text/plain" }), context)).status, 400);
  assert.equal((await adapter.handle(request("{}"), { ...context, requestIdentity: "" })).status, 400);
  assert.equal(calls, 0);
});

test("preserves every contract-locked HTTP status mapping", async () => {
  const cases = [
    ["accepted", "successful", 202], ["completed", "successful", 200], ["partial", "successful", 207],
    ["cancelled", "successful", 200], ["recovery-required", "unavailable", 202],
    ["rejected", "rejected", 403], ["failed", "unavailable", 503],
    ["unsupported-result", "unavailable", 500],
  ] as const;
  for (const [outcome, classification, statusCode] of cases) {
    const adapter = new ReferenceNextRouteAdapter({ adapt: async () => result(classification, statusCode, outcome) });
    const actual = await adapter.handle(request(), context);
    assert.equal(actual.status, statusCode, outcome);
    assert.equal((await actual.json()).status, outcome);
  }
});

test("dependency throws are fixed safe 503 responses", async () => {
  const secret = "raw-dependency-credential";
  const adapter = new ReferenceNextRouteAdapter({ adapt: async () => { throw new Error(secret); } });
  const actual = await adapter.handle(request(), context);
  assert.equal(actual.status, 503);
  const body = await actual.text();
  assert.equal(body.includes(secret), false);
  assert.equal(body.includes("stack"), false);
});

test("response projection is deterministic, allowlisted, and copy isolated", async () => {
  const adapter = new ReferenceNextRouteAdapter({ adapt: async () => result("successful", 200, "completed") });
  const first = await adapter.handle(request(), context);
  const second = await adapter.handle(request(), context);
  assert.equal(first.status, second.status);
  assert.equal(await first.text(), await second.text());
  assert.deepEqual([...first.headers.keys()].sort(), ["cache-control", "content-type", "x-correlation-id", "x-request-id"]);
  assert.notEqual(first, second);
});
