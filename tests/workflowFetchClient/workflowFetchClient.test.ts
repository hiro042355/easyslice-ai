import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { createWorkflowFetchClient, createWorkflowUiFetchClientAdapter } from "@/lib/workflowFetchClient/workflowFetchClient";
import type {
  WorkflowFetchTimeoutController,
  WorkflowFetchTransport,
  WorkflowFetchTransportRequest,
  WorkflowFetchTransportResponse,
} from "@/lib/workflowFetchClient/types";

const CSRF = "csrf-production-token-0001";
const KEY = "idempotency-key-0001";
const json = (status: number, value: unknown): WorkflowFetchTransportResponse => ({
  status,
  headers: Object.freeze({ "Content-Type": "application/json; charset=utf-8" }),
  body: new TextEncoder().encode(JSON.stringify(value)),
});
const pending = {
  responseVersion: "1.0",
  status: "pending-upload",
  operation: "generate-mv",
  reference: { referenceVersion: "1.0", kind: "upload-pending", reference: "opaque-pending-reference" },
};
const startRequest = {
  requestVersion: "1.0",
  operation: "generate-mv",
  workflowInput: { contractVersion: "1.0", operation: "generate-mv", adapterInput: {} },
};
const references = {
  pollUpload: { requestVersion: "1.0", pendingReference: pending.reference },
  pollGeneration: { requestVersion: "1.0", generationReference: { referenceVersion: "1.0", kind: "generation-job", reference: "opaque-generation-reference" } },
  queryResult: { requestVersion: "1.0", reference: { referenceVersion: "1.0", kind: "workflow-result", reference: "opaque-result-reference" } },
  cancel: { requestVersion: "1.0", reference: pending.reference },
};
const noTimeout: WorkflowFetchTimeoutController = { schedule: () => ({ cancel() {} }) };

class Transport implements WorkflowFetchTransport {
  readonly requests: WorkflowFetchTransportRequest[] = [];
  constructor(private readonly response: (request: WorkflowFetchTransportRequest) => Promise<WorkflowFetchTransportResponse>) {}
  async execute(request: WorkflowFetchTransportRequest) {
    this.requests.push(request);
    return this.response(request);
  }
}

const clientWith = (transport: WorkflowFetchTransport, timeoutController = noTimeout) => createWorkflowFetchClient({
  transport,
  timeoutController,
  csrfProvider: { getToken: () => ({ status: "available", token: CSRF }) },
});

test("five methods project exact POST endpoints and transport authorities once", async () => {
  const transport = new Transport(async () => json(202, pending));
  const client = clientWith(transport);
  const calls = [
    ["start", startRequest, "/api/v1/workflows/start"],
    ["pollUpload", references.pollUpload, "/api/v1/workflows/poll-upload"],
    ["pollGeneration", references.pollGeneration, "/api/v1/workflows/poll-generation"],
    ["queryResult", references.queryResult, "/api/v1/workflows/result"],
    ["cancel", references.cancel, "/api/v1/workflows/cancel"],
  ] as const;
  for (const [method, request, endpoint] of calls) {
    const before = transport.requests.length;
    await client[method]({ request, idempotencyKey: KEY });
    assert.equal(transport.requests.length, before + 1);
    const projected = transport.requests.at(-1)!;
    assert.equal(projected.url, endpoint);
    assert.equal(projected.method, "POST");
    assert.equal(projected.credentials, "same-origin");
    assert.equal(projected.cache, "no-store");
    assert.deepEqual(JSON.parse(projected.body), request);
    assert.equal(projected.headers.Accept, "application/json");
    assert.equal(projected.headers["Content-Type"], "application/json");
    assert.equal(projected.headers["Idempotency-Key"], KEY);
    assert.equal(projected.headers["X-CSRF-Token"], CSRF);
    assert.equal(projected.body.includes(KEY), false);
  }
});

test("UI adapter exposes exactly the frozen five-method transport boundary", () => {
  const adapter = createWorkflowUiFetchClientAdapter(clientWith(new Transport(async () => json(202, pending))));
  assert.deepEqual(Object.keys(adapter).sort(), ["cancel", "pollGeneration", "pollUpload", "queryResult", "start"]);
  assert.equal(Object.isFrozen(adapter), true);
  assert.equal("recover" in adapter, false);
  assert.equal("reset" in adapter, false);
});

test("valid success, workflow error, and service unavailable use existing result vocabulary", async () => {
  const values = [
    json(202, pending),
    json(409, { errorVersion: "1.0", code: "workflow-conflict", message: "conflict", retryable: false }),
    json(503, { errorVersion: "1.0", code: "temporarily-unavailable", message: "unavailable", retryable: true }),
  ];
  const transport = new Transport(async () => values.shift()!);
  const client = clientWith(transport);
  const success = await client.start({ request: startRequest, idempotencyKey: KEY });
  assert.equal(success.status, "response");
  const workflowError = await client.start({ request: startRequest, idempotencyKey: KEY });
  assert.equal(workflowError.status, "response");
  assert.equal(workflowError.status === "response" && workflowError.result.status, "error");
  const unavailable = await client.start({ request: startRequest, idempotencyKey: KEY });
  assert.equal(unavailable.status, "network-error");
  assert.equal(unavailable.status === "network-error" && unavailable.error.code, "service-unavailable");
});

test("invalid response boundaries fail closed as response-invalid", async () => {
  const invalid = [
    { status: 200, headers: { "Content-Type": "application/json" }, body: new TextEncoder().encode("not-json") },
    { status: 200, headers: { "Content-Type": "text/plain" }, body: new TextEncoder().encode("{}") },
    { status: 200, headers: { "Content-Type": "application/json" }, body: new Uint8Array(262145) },
    json(200, { responseVersion: "1.0", status: "completed" }),
  ];
  const transport = new Transport(async () => invalid.shift()!);
  const client = clientWith(transport);
  for (let index = 0; index < 4; index += 1) {
    const result = await client.start({ request: startRequest, idempotencyKey: KEY });
    assert.equal(result.status, "network-error");
    assert.equal(result.status === "network-error" && result.error.code, "response-invalid");
  }
  assert.equal(transport.requests.length, 4);
});

test("invalid operation-specific requests fail before transport", async () => {
  const transport = new Transport(async () => json(202, pending));
  const client = clientWith(transport);
  for (const invocation of [
    () => client.start({ request: { ...startRequest, operation: "invalid" }, idempotencyKey: KEY }),
    () => client.pollUpload({ request: references.pollGeneration, idempotencyKey: KEY }),
    () => client.pollGeneration({ request: references.pollUpload, idempotencyKey: KEY }),
    () => client.queryResult({ request: { requestVersion: "1.0", reference: { ...pending.reference, kind: "invalid" } }, idempotencyKey: KEY }),
    () => client.cancel({ request: { ...references.cancel, command: "result" }, idempotencyKey: KEY }),
  ]) {
    const result = await invocation();
    assert.equal(result.status, "network-error");
    assert.equal(result.status === "network-error" && result.error.code, "response-invalid");
  }
  assert.equal(transport.requests.length, 0);
});

test("network rejection, timeout, and caller abort are deterministic with no retry", async () => {
  const rejected = new Transport(async () => { throw new Error("closed transport failure"); });
  const network = await clientWith(rejected).start({ request: startRequest, idempotencyKey: KEY });
  assert.equal(network.status, "network-error");
  assert.equal(network.status === "network-error" && network.error.code, "network-unavailable");
  assert.equal(rejected.requests.length, 1);

  const pendingTransport = new Transport(() => new Promise(() => {}));
  const timeoutController: WorkflowFetchTimeoutController = {
    schedule(_timeoutMs, onTimeout) { queueMicrotask(onTimeout); return { cancel() {} }; },
  };
  const timeout = await clientWith(pendingTransport, timeoutController).start({ request: startRequest, idempotencyKey: KEY });
  assert.equal(timeout.status, "network-error");
  assert.equal(timeout.status === "network-error" && timeout.error.code, "request-timeout");
  assert.equal(pendingTransport.requests.length, 1);

  const controller = new AbortController();
  controller.abort();
  const abortedTransport = new Transport(async () => json(202, pending));
  const aborted = await clientWith(abortedTransport).start(
    { request: startRequest, idempotencyKey: KEY },
    { optionsVersion: "1.0", signal: controller.signal },
  );
  assert.deepEqual(aborted, { status: "aborted" });
  assert.equal(abortedTransport.requests.length, 0);
});

test("request projection contains no raw identity or Browser Session partition", async () => {
  const transport = new Transport(async () => json(202, pending));
  await clientWith(transport).start({ request: startRequest, idempotencyKey: KEY });
  const serialized = JSON.stringify(transport.requests[0]);
  for (const forbidden of ["opaqueSessionPartition", "uid", "email", "accountId", "accessToken", "authorization"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

const runtimeImports = (source: string) => (source.match(/^\s*import[\s\S]*?;\s*$/gm) ?? []).flatMap((statement) => {
  if (/^\s*import\s+type\b/.test(statement)) return [];
  const match = statement.match(/(?:from\s+)?["']([^"']+)["']/);
  return match ? [match[1]!] : [];
});
const resolveImport = (from: string, specifier: string) => {
  if (!(specifier.startsWith("@/") || specifier.startsWith("."))) return undefined;
  const base = specifier.startsWith("@/") ? resolve(process.cwd(), specifier.slice(2)) : resolve(dirname(from), specifier);
  return [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts"), resolve(base, "index.tsx")]
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
};

test("production runtime closure excludes fixtures, tests, developer modules, and global fetch", () => {
  const entry = resolve(process.cwd(), "lib/workflowFetchClient/workflowFetchClient.ts");
  const pendingPaths = [entry];
  const visited = new Set<string>();
  while (pendingPaths.length > 0) {
    const current = pendingPaths.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const specifier of runtimeImports(readFileSync(current, "utf8"))) {
      const dependency = resolveImport(current, specifier);
      if (dependency && !visited.has(dependency)) pendingPaths.push(dependency);
    }
  }
  const closure = [...visited].map((path) => path.slice(process.cwd().length + 1).replaceAll("\\", "/"));
  assert.deepEqual(closure.filter((path) => /(^|\/)(tests?|app\/dev)(\/|$)|fixture|fake|prototype/u.test(path)), [], closure.join("\n"));
  const source = readFileSync(entry, "utf8");
  assert.equal(/\bfetch\s*\(/u.test(source), false);
  assert.equal(source.includes("createReferenceWorkflowController"), false);
  assert.equal(source.includes("opaqueSessionPartition"), false);
});
