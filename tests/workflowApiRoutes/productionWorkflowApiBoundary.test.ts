import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { projectProductionWorkflowApiPrincipal } from "../../lib/server/workflowApi/productionWorkflowApiPrincipalProjector";
import { readProductionWorkflowApiRequest } from "../../lib/server/workflowApi/productionWorkflowApiRequestBoundary";
import {
  createProductionWorkflowApiBoundaryFailure,
  projectProductionWorkflowApiResponse,
} from "../../lib/server/workflowApi/productionWorkflowApiResponseProjector";
import type { ProductionWorkflowPrincipalPolicy } from "../../lib/server/workflowApi/productionWorkflowApiBoundaryTypes";
import type { AuthenticatedContext, SessionId, UserId } from "../../lib/server/productionIdentity/types";
import type {
  WorkflowApiCommand,
  WorkflowApiErrorCode,
  WorkflowApiResultDTO,
  WorkflowApiServiceResult,
} from "../../lib/workflowApi/types";

const context: AuthenticatedContext = {
  contextVersion: "1.0",
  requestId: "request-1",
  identity: {
    identityVersion: "1.0",
    userId: "verified-user" as UserId,
    providerSubject: "provider-subject",
    sessionId: "session-1" as SessionId,
    issuedAt: 1,
    expiresAt: 2,
  },
};

const resolved = <T>(value: T) => ({ status: "resolved" as const, value });
const policy = (overrides: Partial<ProductionWorkflowPrincipalPolicy> = {}): ProductionWorkflowPrincipalPolicy => ({
  resolveTenant: async () => resolved("tenant-1"),
  resolveRegion: async () => resolved("asia-northeast1"),
  resolvePermissions: async (_context, command) => resolved([`workflow:${command}`]),
  ...overrides,
});

const encoder = new TextEncoder();
function requestFromChunks(chunks: readonly Uint8Array[], headers: Record<string, string>): Request {
  let index = 0;
  return {
    headers: new Headers(headers),
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index === chunks.length) controller.close();
        else controller.enqueue(chunks[index++]);
      },
    }),
  } as Request;
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return requestFromChunks([encoder.encode(JSON.stringify(body))], {
    "content-type": "application/json; charset=utf-8",
    "idempotency-key": "key-1",
    ...headers,
  });
}

const reference = <T extends "upload-pending" | "generation-job" | "workflow-result">(kind: T) => ({
  referenceVersion: "1.0" as const,
  kind,
  reference: `${kind}-1`,
});

const requests: Readonly<Record<WorkflowApiCommand, unknown>> = {
  start: {
    requestVersion: "1.0",
    operation: "generate-mv",
    workflowInput: { contractVersion: "1.0", operation: "generate-mv", adapterInput: {} },
  },
  "poll-upload": { requestVersion: "1.0", pendingReference: reference("upload-pending") },
  "poll-generation": { requestVersion: "1.0", generationReference: reference("generation-job") },
  result: { requestVersion: "1.0", reference: reference("workflow-result") },
  cancel: { requestVersion: "1.0", reference: reference("workflow-result") },
};

test("trusted principal projection uses only authenticated identity and injected policy", async () => {
  const raw = { ...context, browserIdentity: { userId: "attacker" }, partition: "browser-partition" } as AuthenticatedContext;
  const result = await projectProductionWorkflowApiPrincipal(raw, "start", policy());
  assert.equal(result.status, "projected");
  if (result.status === "projected") {
    assert.equal(result.principal.subjectRef, "verified-user");
    assert.equal(result.principal.tenantRef, "tenant-1");
    assert.equal(result.principal.region, "asia-northeast1");
  }
});

test("principal projection fails closed for unresolved, malformed, unauthorized, and thrown policy results", async () => {
  const unresolved = async () => ({ status: "unresolved" as const });
  const cases: Array<[AuthenticatedContext, ProductionWorkflowPrincipalPolicy]> = [
    [context, policy({ resolveTenant: unresolved })],
    [context, policy({ resolveRegion: async () => resolved("") })],
    [context, policy({ resolvePermissions: unresolved })],
    [context, policy({ resolvePermissions: async () => resolved(["workflow:cancel"]) })],
    [{ ...context, identity: { ...context.identity, userId: "" as UserId } }, policy()],
    [context, policy({ resolveTenant: async () => { throw new Error("policy unavailable"); } })],
  ];
  for (const [candidateContext, candidatePolicy] of cases) {
    assert.deepEqual(await projectProductionWorkflowApiPrincipal(candidateContext, "start", candidatePolicy), { status: "unauthorized" });
  }
});

test("request boundary reconstructs all five committed command DTOs", async () => {
  for (const command of Object.keys(requests) as WorkflowApiCommand[]) {
    const result = await readProductionWorkflowApiRequest(jsonRequest(requests[command]), command);
    assert.equal(result.status, "accepted", command);
    if (result.status === "accepted") {
      assert.equal(result.idempotencyKey, "key-1");
      if (command === "start") assert.equal("command" in result.request, false);
      else assert.equal("command" in result.request && result.request.command, command);
    }
  }
});

test("request transport rejects content-type, length, body, UTF-8, JSON, and smuggling failures", async () => {
  const valid = requests.start;
  const cases: Array<[Request, number, string]> = [
    [jsonRequest(valid, { "content-type": "text/plain" }), 415, "request-invalid"],
    [jsonRequest(valid, { "content-length": "524289" }), 413, "request-invalid"],
    [jsonRequest(valid, { "content-length": "invalid" }), 400, "request-invalid"],
    [requestFromChunks([], { "content-type": "application/json", "idempotency-key": "key" }), 400, "request-invalid"],
    [requestFromChunks([new Uint8Array([0xc3, 0x28])], { "content-type": "application/json", "idempotency-key": "key" }), 400, "request-invalid"],
    [requestFromChunks([new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d])], { "content-type": "application/json", "idempotency-key": "key" }), 400, "request-invalid"],
    [requestFromChunks([encoder.encode("{")], { "content-type": "application/json", "idempotency-key": "key" }), 400, "request-invalid"],
    [jsonRequest([]), 400, "request-invalid"],
    [jsonRequest({ ...(valid as object), unknown: true }), 400, "request-invalid"],
    [jsonRequest({ ...(valid as object), requestVersion: "2.0" }), 400, "request-version-unsupported"],
    [jsonRequest({ ...(valid as object), command: "cancel" }), 400, "request-invalid"],
    [jsonRequest({ ...(valid as object), idempotencyKey: "body-key" }), 400, "request-invalid"],
    [jsonRequest(valid, { "idempotency-key": "" }), 400, "request-invalid"],
    [jsonRequest(valid, { "idempotency-key": "invalid key" }), 400, "request-invalid"],
  ];
  for (const [request, statusCode, code] of cases) {
    const result = await readProductionWorkflowApiRequest(request, "start");
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") assert.deepEqual([result.statusCode, result.code], [statusCode, code]);
  }
});

test("stream byte counting enforces honest, missing, and deceptive length limits", async () => {
  const headers = { "content-type": "application/json", "idempotency-key": "key" };
  const tooLargeStart = requestFromChunks([new Uint8Array(524_288), new Uint8Array(1)], headers);
  assert.deepEqual(await readProductionWorkflowApiRequest(tooLargeStart, "start"), {
    status: "rejected", statusCode: 413, code: "request-invalid",
  });
  for (const command of ["poll-upload", "poll-generation", "result", "cancel"] as const) {
    const request = requestFromChunks(
      [new Uint8Array(8_192), new Uint8Array(1)],
      command === "result" ? { ...headers, "content-length": "1" } : headers,
    );
    assert.deepEqual(await readProductionWorkflowApiRequest(request, command), {
      status: "rejected", statusCode: 413, code: "request-invalid",
    });
  }
});

test("non-MV start applies the committed smaller limit after operation identification", async () => {
  const padding = "x".repeat(131_072);
  const request = jsonRequest({
    requestVersion: "1.0",
    operation: "generate-vocal",
    workflowInput: { contractVersion: "1.0", operation: "generate-vocal", adapterInput: { padding } },
  });
  assert.deepEqual(await readProductionWorkflowApiRequest(request, "start"), {
    status: "rejected", statusCode: 413, code: "request-invalid",
  });
});

const resultReference = reference("workflow-result");
const resultBodies: WorkflowApiResultDTO[] = [
  { responseVersion: "1.0", status: "completed", operation: "generate-mv", assets: [], resultReference },
  { responseVersion: "1.0", status: "degraded", operation: "generate-mv", assets: [], resultReference },
  { responseVersion: "1.0", status: "partial", operation: "generate-mv", assets: [], resultReference },
  { responseVersion: "1.0", status: "cancelled", operation: "generate-mv", resultReference },
  { responseVersion: "1.0", status: "pending-upload", operation: "generate-mv", reference: reference("upload-pending") },
  { responseVersion: "1.0", status: "pending-generation", operation: "generate-mv", reference: reference("generation-job") },
];

test("response projector accepts committed result envelopes and emits JSON no-store only", async () => {
  for (const body of resultBodies) {
    const statusCode = body.status.startsWith("pending-") ? 202 : 200;
    const input: WorkflowApiServiceResult = {
      status: "success",
      http: { statusCode, headers: [{ name: "Set-Cookie", value: "unsafe=secret" }] },
      body,
    };
    const response = projectProductionWorkflowApiResponse(input);
    assert.equal(response.status, statusCode);
    assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.equal(response.headers.has("set-cookie"), false);
    assert.deepEqual(await response.json(), body);
  }
});

test("every committed workflow error maps only to its intended canonical status", async () => {
  const mapping: Record<WorkflowApiErrorCode, number> = {
    "request-invalid": 400,
    "request-version-unsupported": 400,
    "operation-unsupported": 422,
    unauthenticated: 401,
    unauthorized: 403,
    "reference-unavailable": 404,
    "reference-expired": 410,
    "idempotency-conflict": 409,
    "workflow-conflict": 409,
    "workflow-failed": 500,
    "workflow-cancelled": 200,
    "rate-limited": 429,
    "temporarily-unavailable": 503,
    timeout: 504,
    "reconciliation-required": 202,
    "internal-error": 500,
  };
  for (const [code, statusCode] of Object.entries(mapping) as Array<[WorkflowApiErrorCode, number]>) {
    const response = projectProductionWorkflowApiResponse({
      status: "error",
      http: { statusCode, headers: [] },
      body: { errorVersion: "1.0", code, message: "sensitive internal detail", retryable: false },
    });
    assert.equal(response.status, statusCode, code);
    const body = await response.json() as { code: string; message: string };
    assert.equal(body.code, code);
    assert.equal(body.message.includes("sensitive internal detail"), false);
  }
  for (const failure of [
    createProductionWorkflowApiBoundaryFailure(401, "unauthenticated"),
    createProductionWorkflowApiBoundaryFailure(403, "unauthorized"),
  ]) {
    assert.equal(projectProductionWorkflowApiResponse(failure).status, failure.statusCode);
  }
});

test("malformed internal service results fail closed without exception details", async () => {
  for (const malformed of [{}, new Error("super-secret-stack"), { status: "success", http: { statusCode: 200 }, body: {} }]) {
    const response = projectProductionWorkflowApiResponse(malformed);
    assert.equal(response.status, 500);
    const text = await response.text();
    assert.match(text, /"code":"internal-error"/u);
    assert.equal(text.includes("super-secret-stack"), false);
  }
});

test("production boundary source owns no route, retry, polling, recovery, provider, cloud, browser-session, or fixture runtime", () => {
  const files = [
    "productionWorkflowApiBoundaryTypes.ts",
    "productionWorkflowApiPrincipalProjector.ts",
    "productionWorkflowApiRequestBoundary.ts",
    "productionWorkflowApiResponseProjector.ts",
  ];
  const source = files.map((file) => readFileSync(join(process.cwd(), "lib", "server", "workflowApi", file), "utf8")).join("\n");
  for (const forbidden of [
    /\bfetch\s*\(/u,
    /setTimeout|setInterval/u,
    /BrowserSession/u,
    /fixture|developer|referenceWorkflowBrowserSession/u,
    /\baws\b|\bgcp\b|youtube|provider call/iu,
    /route\.ts/u,
    /\bMap\s*</u,
  ]) assert.doesNotMatch(source, forbidden);
});
