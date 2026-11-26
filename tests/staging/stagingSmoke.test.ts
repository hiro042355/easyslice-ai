import assert from "node:assert/strict";
import test from "node:test";
import {
  SMOKE_APPROVAL_TOKEN,
  redactSmokeText,
  resolveSmokeBaseUrl,
  runStagingSmoke,
  type SmokeFetch,
  type SmokeFetchResponse,
} from "../../lib/staging/stagingSmoke";
import { STAGING_APP_ORIGIN } from "../../lib/staging/stagingEnvironment";

type Route = Readonly<{ status: number; body: unknown }>;

function response(status: number, body: unknown): SmokeFetchResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { status, headers: { "cache-control": "no-store" }, text: async () => text };
}

function healthyFetch(calls: string[] = [], override?: (url: string) => Route | undefined): SmokeFetch {
  return async (url, init) => {
    calls.push(`${init.method} ${url}`);
    const custom = override?.(url);
    if (custom) return response(custom.status, custom.body);
    if (url.endsWith("/api/health/live")) return response(200, { status: "live" });
    if (url.endsWith("/api/health/ready")) return response(200, { status: "ready" });
    if (url.endsWith("/api/v1/assets/import")) {
      return init.headers.origin === STAGING_APP_ORIGIN
        ? response(401, { error: "unauthenticated" })
        : response(403, { error: "forbidden" });
    }
    if (url.endsWith("/api/media/admit")) return response(401, { error: "unauthenticated" });
    return response(404, { error: "not-found" });
  };
}

const run = (fetchImpl: SmokeFetch, approval: string | undefined = SMOKE_APPROVAL_TOKEN) => {
  const lines: string[] = [];
  return runStagingSmoke(STAGING_APP_ORIGIN, { fetch: fetchImpl, approval, log: (line) => lines.push(line) })
    .then((report) => ({ report, lines }));
};

test("approved smoke passes every check without mutating anything", async () => {
  const calls: string[] = [];
  const { report, lines } = await run(healthyFetch(calls));
  assert.equal(report.status, "PASS");
  assert.deepEqual(report.checks.map((entry) => entry.id), [
    "health-live",
    "health-ready",
    "import-cross-origin-rejected",
    "import-auth-boundary",
    "media-admit-auth-boundary",
    "no-secret-leakage",
  ]);
  assert.deepEqual(calls.map((call) => call.split(" ")[0]), ["GET", "GET", "POST", "POST", "POST"]);
  assert.ok(lines.some((line) => line.includes("6/6 checks passed")));
});

test("no request is issued without approval", async () => {
  let called = 0;
  const fetchImpl: SmokeFetch = async () => {
    called += 1;
    return response(500, {});
  };
  const lines: string[] = [];
  const report = await runStagingSmoke(STAGING_APP_ORIGIN, {
    fetch: fetchImpl,
    approval: undefined,
    log: (line) => lines.push(line),
  });
  assert.equal(report.status, "BLOCKED");
  assert.equal(report.reason, "approval-required");
  assert.equal(called, 0);
  assert.ok(lines.some((line) => line.includes("BLOCKED")));
});

test("an unapproved approval value is rejected", async () => {
  const { report } = await run(healthyFetch(), "yes");
  assert.equal(report.status, "BLOCKED");
});

test("a reachable protected route without authentication fails the smoke", async () => {
  const { report } = await run(healthyFetch([], (url) =>
    url.endsWith("/api/v1/assets/import") ? { status: 200, body: { accepted: true } } : undefined,
  ));
  assert.equal(report.status, "FAIL");
  const boundary = report.checks.find((entry) => entry.id === "import-auth-boundary");
  assert.equal(boundary?.status, "FAIL");
  assert.match(boundary?.detail ?? "", /expected 401/);
});

test("a ready endpoint reporting not-ready fails with its reason", async () => {
  const { report } = await run(healthyFetch([], (url) =>
    url.endsWith("/api/health/ready") ? { status: 503, body: { status: "not-ready", reason: "kms-unavailable" } } : undefined,
  ));
  assert.equal(report.status, "FAIL");
  const ready = report.checks.find((entry) => entry.id === "health-ready");
  assert.equal(ready?.status, "FAIL");
  assert.match(ready?.detail ?? "", /503/);
  assert.match(ready?.detail ?? "", /kms-unavailable/);
});

test("cross-origin acceptance is a failure", async () => {
  const { report } = await run(healthyFetch([], (url) =>
    url.endsWith("/api/v1/assets/import") ? { status: 401, body: { error: "unauthenticated" } } : undefined,
  ));
  assert.equal(report.status, "FAIL");
  assert.equal(report.checks.find((entry) => entry.id === "import-cross-origin-rejected")?.status, "FAIL");
});

test("token-shaped response values fail the leak check", async () => {
  const leak = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzdGFnaW5nIn0.c2lnbmF0dXJl";
  const { report } = await run(healthyFetch([], (url) =>
    url.endsWith("/api/health/live") ? { status: 200, body: { status: "live", token: leak } } : undefined,
  ));
  assert.equal(report.status, "FAIL");
  assert.equal(report.checks.find((entry) => entry.id === "no-secret-leakage")?.status, "FAIL");
  assert.ok(!report.checks.some((entry) => entry.detail.includes(leak)));
});

test("only the approved staging origin or explicit loopback is accepted", () => {
  assert.equal(resolveSmokeBaseUrl(STAGING_APP_ORIGIN, false), STAGING_APP_ORIGIN);
  assert.equal(resolveSmokeBaseUrl("http://127.0.0.1:3000", true), "http://127.0.0.1:3000");
  assert.throws(() => resolveSmokeBaseUrl("http://127.0.0.1:3000", false), /unapproved-smoke-origin/);
  assert.throws(() => resolveSmokeBaseUrl("https://nexcut.app", false), /unapproved-smoke-origin/);
  assert.throws(() => resolveSmokeBaseUrl("https://nexcut-staging.vercel.app", true), /unapproved-smoke-origin/);
  assert.throws(() => resolveSmokeBaseUrl("https://staging.nexcut.app.evil.example", false), /unapproved-smoke-origin/);
});

test("redaction removes jwt, bearer and upload urls", () => {
  const redacted = redactSmokeText(
    'Authorization: Bearer abc.def.ghi access_token=secret eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln "uploadUrl":"https://signed.example/x"',
  );
  assert.doesNotMatch(redacted, /abc\.def\.ghi/);
  assert.doesNotMatch(redacted, /access_token=secret/);
  assert.doesNotMatch(redacted, /signed\.example/);
  assert.match(redacted, /\[REDACTED_JWT\]|\[REDACTED\]/);
});
