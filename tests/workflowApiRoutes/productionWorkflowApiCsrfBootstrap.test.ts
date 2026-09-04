import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PostgresqlProductionWorkflowApiCsrfAuthority } from "../../lib/server/workflowApi/postgresqlProductionWorkflowApiCsrfAuthority";

import type { AuthenticatedContext, SessionId, UserId } from "../../lib/server/productionIdentity/types";
import { createProductionWorkflowApiCsrfBootstrapHandler } from "../../lib/server/workflowApi/productionWorkflowApiCsrfBootstrap";
import {
  digestParsedProductionWorkflowApiCsrfToken,
  parseProductionWorkflowApiCsrfToken,
} from "../../lib/server/workflowApi/productionWorkflowApiCsrfToken";
import {
  createProductionWorkflowApiCsrfRuntimeProvider,
} from "../../lib/server/workflowApi/productionWorkflowApiCsrfRuntime";
import type {
  ProductionWorkflowApiCsrfAuthority,
  ProductionWorkflowApiCsrfIssueResult,
  ProductionWorkflowApiCsrfPersistenceMaterial,
} from "../../lib/server/workflowApi/productionWorkflowApiCsrfTypes";
import type { PostgreSQLConnectionPool } from "../../lib/server/productionWorkflowRuntime/postgresqlDriver";

const NOW = 1_725_000_000_000;
const SESSION_EXPIRY = NOW + 60_000;

const context: AuthenticatedContext = Object.freeze({
  contextVersion: "1.0",
  requestId: "request-1",
  identity: Object.freeze({
    identityVersion: "1.0",
    userId: "user-1" as UserId,
    providerSubject: "user-1",
    sessionId: "trusted-session" as SessionId,
    issuedAt: NOW - 1_000,
    expiresAt: SESSION_EXPIRY,
  }),
});

function authority(status: "issued" | "unavailable" | "malformed" = "issued") {
  const materials: ProductionWorkflowApiCsrfPersistenceMaterial[] = [];
  const value: ProductionWorkflowApiCsrfAuthority = Object.freeze({
    authorityVersion: "1.0",
    async issueWithAtomicCeiling(material: ProductionWorkflowApiCsrfPersistenceMaterial): Promise<ProductionWorkflowApiCsrfIssueResult> {
      materials.push(material);
      return status === "issued"
        ? Object.freeze({ status: "issued", tokenId: material.tokenId, expiresAt: material.expiresAt, revision: "0" as never })
        : Object.freeze({ status });
    },
    async validate() { return { status: "invalid" as const }; },
    async revokeToken() { return { status: "not-found" as const }; },
    async revokeSession() { return { status: "not-found" as const }; },
  });
  return { value, materials };
}

const request = (init: RequestInit = {}) => new Request("https://app.example/api/v1/workflows/csrf", {
  method: "POST",
  headers: { origin: "https://app.example", ...init.headers },
  ...init,
});

function handler(input: Readonly<{
  authenticated?: boolean;
  authorityStatus?: "issued" | "unavailable" | "malformed";
  session?: AuthenticatedContext;
}> = {}) {
  const durable = authority(input.authorityStatus);
  const value = createProductionWorkflowApiCsrfBootstrapHandler({
    authenticate: async () => input.authenticated === false
      ? { ok: false, response: Response.json({ success: false, error: "authentication-required" }, { status: 401 }) as never }
      : { ok: true, context: input.session ?? context },
    authority: async () => durable.value,
    now: () => NOW,
  });
  return { value, durable };
}

test("authenticated same-origin empty bootstrap durably issues a no-store token", async () => {
  const subject = handler();
  const response = await subject.value(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("content-type") ?? "", /^application\/json; charset=utf-8$/u);
  const body = await response.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["expiresAt", "responseVersion", "token"]);
  assert.equal(body.responseVersion, "1.0");
  assert.equal(body.expiresAt, SESSION_EXPIRY);
  assert.match(String(body.token), /^csrf1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/u);
  assert.equal(subject.durable.materials.length, 1);
  assert.equal(subject.durable.materials[0].sessionId, "trusted-session");
  assert.equal(subject.durable.materials[0].expiresAt, SESSION_EXPIRY);
  assert.equal("token" in subject.durable.materials[0], false);
  assert.equal(JSON.stringify(subject.durable.materials[0]).includes(String(body.token)), false);
});

test("bootstrap rejects unauthenticated, cross-origin, and non-empty requests", async () => {
  assert.equal((await handler({ authenticated: false }).value(request())).status, 401);
  assert.equal((await handler().value(request({ headers: { origin: "https://evil.example" } }))).status, 403);
  assert.equal((await handler().value(request({ body: "{}", headers: { origin: "https://app.example", "content-type": "application/json" } }))).status, 400);
  assert.equal((await handler().value(request({ headers: { origin: "https://app.example", "content-length": "1" } }))).status, 400);
});

for (const status of ["unavailable", "malformed"] as const) {
  test(`bootstrap maps ${status} authority result to safe 503 without token exposure`, async () => {
    const subject = handler({ authorityStatus: status });
    const response = await subject.value(request());
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.equal(text.includes("csrf1."), false);
    assert.match(text, /temporarily-unavailable/u);
  });
}

test("invalid or expired trusted identity timestamp fails closed before durable issuance", async () => {
  for (const expiresAt of [NOW, NOW - 1, Number.NaN]) {
    const subject = handler({ session: Object.freeze({ ...context, identity: Object.freeze({ ...context.identity, expiresAt }) }) });
    assert.equal((await subject.value(request())).status, 503);
    assert.equal(subject.durable.materials.length, 0);
  }
});

test("bootstrap does not require an existing CSRF header", async () => {
  assert.equal(request().headers.has("x-csrf-token"), false);
  assert.equal((await handler().value(request())).status, 200);
});


for (const headers of [{}, { "content-length": "0" }, { "transfer-encoding": "chunked" }] as Record<string, string>[]) {
  test(`stream rejects after one chunk with headers ${JSON.stringify(headers)}`, async () => {
    let pulls = 0;
    let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { pulls++; assert.equal(pulls, 1); controller.enqueue(new Uint8Array([1])); },
      cancel() { cancelled++; },
    }, { highWaterMark: 0 });
    const input = request({ body, duplex: "half", headers: { origin: "https://app.example", ...headers } } as RequestInit & { duplex: "half" });
    for (const method of ["arrayBuffer", "text", "json", "blob"] as const) {
      Object.defineProperty(input, method, { value: () => { throw new Error("Full-body read forbidden"); } });
    }
    assert.equal((await handler().value(input)).status, 400);
    assert.equal(pulls, 1);
    assert.equal(cancelled, 1);
  });
}

test("stream EOF accepted; empty chunk is inconclusive and cancelled without looping", async () => {
  for (const eof of [true, false]) {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) { pulls++; if (eof) c.close(); else c.enqueue(new Uint8Array()); },
    }, { highWaterMark: 0 });
    assert.equal((await handler().value(request({ body, duplex: "half" } as RequestInit & { duplex: "half" }))).status, eof ? 200 : 400);
    assert.equal(pulls, 1);
  }
});

test("body validation performs one read maximum, never accumulates chunks, and cancels after detection", async () => {
  let pulls = 0;
  let cancelled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      assert.equal(pulls, 1, "candidate must never request a second framework-delivered chunk");
      controller.enqueue(new Uint8Array([1, 2, 3]));
    },
    cancel() { cancelled++; },
  }, { highWaterMark: 0 });
  const response = await handler().value(request({ body, duplex: "half" } as RequestInit & { duplex: "half" }));
  assert.equal(response.status, 400);
  assert.equal(pulls, 1);
  assert.equal(cancelled, 1);
  const source = readFileSync("lib/server/workflowApi/productionWorkflowApiCsrfBootstrap.ts", "utf8");
  assert.equal(source.match(/reader\.read\(\)/gu)?.length, 1);
  assert.doesNotMatch(source, /for\s+await|while\s*\(|Buffer\.concat|request\.(?:arrayBuffer|text|json|blob)\(/u);
});

test("invalid Origin rejects directly before authentication or persistence", async () => {
  const subject = createProductionWorkflowApiCsrfBootstrapHandler({
    authenticate: async () => { throw new Error("must not authenticate"); },
    authority: async () => { throw new Error("must not persist"); }, now: () => NOW,
  });
  assert.equal((await subject(request({ headers: { origin: "https://evil.example" } }))).status, 403);
});

test("issuance token ID and expiry mismatches never release a token", async () => {
  for (const mismatch of ["id", "expiry", "expired", "nan"] as const) {
    const durable = authority().value;
    const subject = createProductionWorkflowApiCsrfBootstrapHandler({
      authenticate: async () => ({ ok: true, context }),
      authority: async () => ({
        ...durable,
        async issueWithAtomicCeiling(m) {
          return { status: "issued", revision: "0" as never,
            tokenId: mismatch === "id" ? "different-id" as never : m.tokenId,
            expiresAt: mismatch === "expiry" ? m.expiresAt + 1 : mismatch === "expired" ? NOW : mismatch === "nan" ? NaN : m.expiresAt };
        },
      }), now: () => NOW,
    });
    const response = await subject(request());
    assert.equal(response.status, 503);
    assert.equal((await response.text()).includes("csrf1."), false);
  }
});

test("expiry is clamped to thirty minutes when the trusted session lasts longer", async () => {
  const subject = handler({ session: { ...context, identity: { ...context.identity, expiresAt: NOW + 3_600_000 } } });
  assert.equal((await subject.value(request())).status, 200);
  assert.equal(subject.durable.materials[0].expiresAt, NOW + 1_800_000);
});

const unavailablePool = {
  async checkout() { throw new Error("database checkout must not occur"); },
} as unknown as PostgreSQLConnectionPool;

test("shared runtime is lazy, deduplicates getters and shutdown, and terminalizes retained authority", async () => {
  let creates = 0, acquires = 0, closes = 0;
  const provider = createProductionWorkflowApiCsrfRuntimeProvider({}, {
    createDatabaseRuntime() {
      creates++;
      return { async acquire() { acquires++; return unavailablePool; }, async shutdown() { closes++; } };
    },
  });
  assert.equal(creates, 0);
  const first = provider.get();
  assert.equal(provider.get(), first);
  const result = await first;
  assert.equal(result.status, "ready");
  assert.equal(creates, 1); assert.equal(acquires, 1);
  const stopping = provider.shutdown();
  assert.equal(provider.shutdown(), stopping);
  await stopping;
  assert.equal(closes, 1);
  assert.equal((await provider.get()).status, "unavailable");
  if (result.status !== "ready") return;
  assert.equal((await result.runtime.authority.validate({} as never)).status, "unavailable");
  assert.equal((await result.runtime.authority.issueWithAtomicCeiling({} as never)).status, "unavailable");
  assert.equal((await result.runtime.authority.revokeToken({} as never)).status, "unavailable");
  assert.equal((await result.runtime.authority.revokeSession({} as never)).status, "unavailable");
});

test("startup failure is sanitized, cached, and not retried", async () => {
  let creates = 0, closes = 0;
  const provider = createProductionWorkflowApiCsrfRuntimeProvider({}, {
    createDatabaseRuntime() {
      creates++;
      return { async acquire(): Promise<PostgreSQLConnectionPool> { throw new Error("private detail"); }, async shutdown() { closes++; } };
    },
  });
  assert.deepEqual(await provider.get(), { status: "unavailable" });
  assert.deepEqual(await provider.get(), { status: "unavailable" });
  assert.equal(creates, 1); assert.equal(closes, 1);
});

test("shutdown before startup does not construct a database", async () => {
  const provider = createProductionWorkflowApiCsrfRuntimeProvider({}, {
    createDatabaseRuntime() { throw new Error("must not construct"); },
  });
  await provider.shutdown();
  assert.equal((await provider.get()).status, "unavailable");
});

test("shutdown during pending startup prevents ready publication", async () => {
  let resolve!: (pool: PostgreSQLConnectionPool) => void;
  let closes = 0;
  const pending = new Promise<PostgreSQLConnectionPool>(r => { resolve = r; });
  const provider = createProductionWorkflowApiCsrfRuntimeProvider({}, {
    createDatabaseRuntime: () => ({ acquire: () => pending, async shutdown() { closes++; } }),
  });
  const starting = provider.get();
  await Promise.resolve();
  const stopping = provider.shutdown();
  resolve(unavailablePool);
  assert.equal((await starting).status, "unavailable");
  await stopping;
  assert.equal(closes, 1);
});

test("shutdown failure stays terminal and exposes only sanitized failure", async () => {
  const provider = createProductionWorkflowApiCsrfRuntimeProvider({}, {
    createDatabaseRuntime: () => ({ async acquire() { return unavailablePool; }, async shutdown() { throw new Error("private detail"); } }),
  });
  await provider.get();
  const stopping = provider.shutdown();
  await assert.rejects(stopping, /^Error: Production CSRF runtime shutdown failed$/);
  assert.equal(provider.shutdown(), stopping);
  assert.equal((await provider.get()).status, "unavailable");
});

test("legacy optional numeric overrides never silently fall back", async () => {
  for (const key of ["POSTGRES_PORT", "POSTGRES_MAX_CONNECTIONS", "POSTGRES_CONNECTION_TIMEOUT_MS", "POSTGRES_IDLE_TIMEOUT_MS", "POSTGRES_QUERY_TIMEOUT_MS"]) {
    for (const value of ["", "0", "-1", "NaN", "Infinity", "1.5", "999999999999999999999", "invalid", "4"]) {
      let factoryInvocations = 0;
      const provider = createProductionWorkflowApiCsrfRuntimeProvider({ [key]: value }, {
        createDatabaseRuntime() {
          factoryInvocations++;
          throw new Error("override must reject before foundation construction");
        },
      });
      assert.equal((await provider.get()).status, "unavailable");
      assert.equal(factoryInvocations, 0, `${key}=${JSON.stringify(value)} reached the shared factory`);
    }
  }
});

test("composition imports shared authority with no direct pool/password/TLS implementation", () => {
  const source = readFileSync("lib/server/workflowApi/productionWorkflowApiCsrfRuntime.ts", "utf8");
  assert.match(source, /productionDatabaseRuntime\/productionPostgresqlRuntime/);
  assert.match(source, /createDatabaseRuntime: createProductionPostgresqlRuntime/);
  assert.doesNotMatch(source, /new (?:Pool|Connector)|tls\s*:|password\s*:|readFileSync|createProductionWif/);
  const bootstrap = readFileSync("lib/server/workflowApi/productionWorkflowApiCsrfBootstrap.ts", "utf8");
  assert.doesNotMatch(bootstrap, /request\.(?:arrayBuffer|text|json|blob)\(/);
});

test("mutating a parsed token ID drives production lookup away from the stored original ID", async () => {
  const storedId = Buffer.alloc(16, 1);
  const presentedId = Buffer.alloc(16, 2);
  const secret = Buffer.alloc(32, 3).toString("base64url");
  const originalRawToken = `csrf1.${storedId.toString("base64url")}.${secret}`;
  const mutatedRawToken = `csrf1.${presentedId.toString("base64url")}.${secret}`;
  const original = parseProductionWorkflowApiCsrfToken(originalRawToken);
  const mutated = parseProductionWorkflowApiCsrfToken(mutatedRawToken);
  assert.equal(original.status, "parsed");
  assert.equal(mutated.status, "parsed");
  if (original.status !== "parsed" || mutated.status !== "parsed") return;
  assert.notEqual(mutated.value.tokenId, original.value.tokenId);
  const storedRecords = new Map([[original.value.tokenId, Object.freeze({ tokenId: original.value.tokenId })]]);
  let released = 0, queries = 0;
  const pool = {
    async checkout() {
      return {
        async query(input: { values: readonly { kind: string; value: unknown }[] }) {
          queries++;
          assert.deepEqual(input.values[0].value, new Uint8Array(presentedId));
          assert.notDeepEqual(input.values[0].value, new Uint8Array(storedId));
          assert.equal(storedRecords.has(mutated.value.tokenId), false);
          return { status: "not-found" };
        },
        release() { released++; },
      };
    },
  } as unknown as PostgreSQLConnectionPool;
  const durable = new PostgresqlProductionWorkflowApiCsrfAuthority(pool);
  const result = await durable.validate({
    sessionId: context.identity.sessionId,
    tokenId: mutated.value.tokenId,
    digest: digestParsedProductionWorkflowApiCsrfToken(mutated.value),
    now: NOW,
  });
  assert.equal(result.status, "invalid");
  assert.equal(queries, 1); assert.equal(released, 1);
});
