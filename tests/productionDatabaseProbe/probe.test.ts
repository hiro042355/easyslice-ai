import assert from "node:assert/strict";
import { test } from "node:test";
import { createProbeRoute, runProbe, PROBE_SQL, PROBE_ORIGIN, type ProbeConnection } from "../../lib/server/productionDatabaseProbe/probeCore";
import type { AuthenticatedContext, UserId, SessionId } from "../../lib/server/productionIdentity/types";
const context = (owner = "synthetic-owner"): AuthenticatedContext => ({ contextVersion: "1.0", requestId: "synthetic",
  identity: { identityVersion: "1.0", userId: owner as UserId, sessionId: "synthetic-session" as SessionId,
    providerSubject: owner, issuedAt: 1, expiresAt: 2 } });
function fake(fail?: string, denied = false) {
  const calls: string[] = [];
  const connection: ProbeConnection = { async query(sql) {
    calls.push(sql);
    if (sql === fail) throw Object.assign(new Error("RAW_SECRET_DATABASE_HOST_TOKEN"), { code: denied ? "42501" : "XX000" });
    if (sql === PROBE_SQL.metadata) return { rows: [{ database_identity: "RAW_DATABASE", role_identity: "RAW_ROLE", version: "123456" }] };
    if (sql === PROBE_SQL.schema) return { rows: [{ present: true }] };
    if (sql === PROBE_SQL.history) return { rows: [{ schema_name: "public" }] };
    if (sql === PROBE_SQL.shape) return { rows: [{ table_schema: "public", column_name: "version", data_type: "character varying" }, { table_schema: "public", column_name: "success", data_type: "boolean" }] };
    if (sql === PROBE_SQL.privileges) return { rows: [{ schema_create: true, database_create: false, schema_usage: true }] };
    return { rows: [] };
  } };
  return { calls, connection };
}
const request = (options: { method?: string; origin?: string | null; query?: string; body?: string; cookie?: boolean } = {}) => {
  const headers: Record<string, string> = {};
  if (options.origin !== null) headers.origin = options.origin ?? PROBE_ORIGIN;
  if (options.cookie !== false) headers.cookie = "__Host-nexcut_session=synthetic-cookie";
  return new Request(PROBE_ORIGIN + "/api/internal/production-db-authority-probe" + (options.query ?? ""), {
    method: options.method ?? "POST", headers, ...(options.body === undefined ? {} : { body: options.body }),
  });
};
function harness(options: { environment?: Record<string, string | undefined>; authenticated?: boolean; owner?: string; throws?: boolean } = {}) {
  let count = 0;
  const handler = createProbeRoute({ environment: options.environment ?? { VERCEL_ENV: "production", NEXCUT_PRODUCTION_DB_PROBE_ENABLED: "true", NEXCUT_PRODUCTION_OWNER_UID: "synthetic-owner" },
    async authenticate() { return options.authenticated === false ? { ok: false } : { ok: true, context: context(options.owner) }; },
    async probe() { count++; if (options.throws) throw new Error("RAW_SECRET"); return runProbe(async run => run(fake().connection)); },
  });
  return { handler, count: () => count };
}
for (const [name, environment] of [
  ["disabled by default", { VERCEL_ENV: "production" }],
  ["non production", { VERCEL_ENV: "preview", NEXCUT_PRODUCTION_DB_PROBE_ENABLED: "true" }],
  ["exact enable only", { VERCEL_ENV: "production", NEXCUT_PRODUCTION_DB_PROBE_ENABLED: "TRUE" }],
] as const) test(name, async () => { const h = harness({ environment }); assert.equal((await h.handler(request())).status, 404); assert.equal(h.count(), 0); });
for (const [name, options, status] of [
  ["GET rejected", { method: "GET" }, 405], ["wrong Origin", { origin: "https://evil.example" }, 403],
  ["missing Origin", { origin: null }, 403], ["query SQL rejected", { query: "?sql=SELECT+1" }, 400],
  ["query database selection rejected", { query: "?database=evil&schema=evil&table=evil" }, 400],
  ["nonempty body", { body: "{}" }, 400], ["malformed body", { body: "not-json" }, 400],
  ["missing session", { cookie: false }, 401],
] as const) test(name, async () => { const h = harness(); assert.equal((await h.handler(request(options))).status, status); assert.equal(h.count(), 0); });
test("unauthenticated and non-owner fail before DB", async () => {
  for (const options of [{ authenticated: false }, { owner: "other" }]) { const h = harness(options); assert.ok((await h.handler(request())).status >= 400); assert.equal(h.count(), 0); }
});
test("valid owner reaches one fixed read-only service; response contains no identifiers", async () => {
  const h = harness(); const response = await h.handler(request());
  assert.equal(response.status, 200); assert.equal(h.count(), 1);
  const text = await response.text(); assert.doesNotMatch(text, /RAW_|synthetic-owner|123456|public/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("all owned SQL is static and mutation-free", () => {
  assert.equal(Object.keys(PROBE_SQL).length, 7);
  for (const sql of Object.values(PROBE_SQL)) assert.doesNotMatch(sql, /\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|COMMIT)\b/i);
});
test("same connection requests BEGIN READ ONLY and ends with ROLLBACK", async () => {
  const f = fake(); const result = await runProbe(async run => run(f.connection));
  assert.equal(result.result, "PASS"); assert.equal(f.calls[0], "BEGIN READ ONLY"); assert.equal(f.calls.at(-1), "ROLLBACK");
  assert.deepEqual(f.calls, Object.values(PROBE_SQL));
  assert.equal(result.historyTable, "PRESENT"); assert.equal(result.authoritativeHistory, "UNKNOWN");
  assert.equal(result.migrationVersions, "NOT_RUN"); assert.equal(result.migrationIdentityAuthority, "UNKNOWN");
});
test("SQL failure and catalog denied remain redacted and rollback", async () => {
  for (const denied of [false, true]) {
    const f = fake(PROBE_SQL.metadata, denied); const result = await runProbe(async run => run(f.connection));
    assert.equal(result.result, "FAIL"); assert.equal(result.failure, denied ? "CATALOG_PRIVILEGE_DENIED" : "SQL_METADATA_FAILED");
    assert.equal(f.calls.at(-1), "ROLLBACK"); assert.doesNotMatch(JSON.stringify(result), /RAW_/);
  }
});
test("failed BEGIN attempts rollback; cleanup failure fails closed", async () => {
  for (const statement of [PROBE_SQL.begin, PROBE_SQL.rollback]) {
    const f = fake(statement); const result = await runProbe(async run => run(f.connection));
    assert.equal(result.result, "FAIL"); assert.equal(f.calls.at(-1), "ROLLBACK");
  }
});
test("combined DB path failure is not falsely attributed", async () => {
  const result = await runProbe(async () => { throw new Error("RAW_SECRET"); });
  assert.equal(result.failure, "DB_AUTHORITY_PATH_FAILED"); assert.equal(result.metadata, "NOT_RUN");
  assert.doesNotMatch(JSON.stringify(result), /RAW_/);
});
test("unexpected failure and logging do not expose raw errors", async () => {
  const logged: unknown[] = []; const old = console.error; console.error = (...args) => { logged.push(args); };
  try { const h = harness({ throws: true }); const r = await h.handler(request()); assert.equal(r.status, 503); assert.deepEqual(await r.json(), { error: "INTERNAL_FAILED" }); assert.deepEqual(logged, []); }
  finally { console.error = old; }
});
test("operational one-shot policy does not pretend a process latch exists", async () => {
  const h = harness(); await h.handler(request()); await h.handler(request()); assert.equal(h.count(), 2);
});
