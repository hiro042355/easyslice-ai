/**
 * BLK-05 staging smoke runner. It is transport-injected so the same checks run
 * in offline tests and against the approved staging origin. It only performs
 * unauthenticated, read-only requests: no OAuth flow, no upload, no publish.
 */
import { STAGING_APP_ORIGIN } from "./stagingEnvironment";

export const SMOKE_APPROVAL_ENV = "STAGING_SMOKE_APPROVED";
export const SMOKE_APPROVAL_TOKEN = "YES";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export type SmokeCheckStatus = "PASS" | "FAIL";
export type SmokeStatus = "PASS" | "FAIL" | "BLOCKED";

export interface SmokeCheck {
  readonly id: string;
  readonly status: SmokeCheckStatus;
  readonly detail: string;
}

export interface SmokeReport {
  readonly reportVersion: "1.0";
  readonly baseUrl: string;
  readonly status: SmokeStatus;
  readonly checks: readonly SmokeCheck[];
  readonly reason?: string;
}

export interface SmokeFetchResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  text(): Promise<string>;
}

export type SmokeFetch = (
  url: string,
  init: Readonly<{ method: string; headers: Readonly<Record<string, string>>; body?: string }>,
) => Promise<SmokeFetchResponse>;

export interface SmokeDependencies {
  readonly fetch: SmokeFetch;
  readonly log: (line: string) => void;
  readonly approval: string | undefined;
  readonly allowLoopback?: boolean;
}

const REDACTIONS: readonly (readonly [RegExp, string])[] = [
  [/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]"],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[REDACTED_JWT]"],
  [/(access_token|refresh_token|id_token|client_secret)"?\s*[:=]\s*"?[^",\s}]+/gi, "$1=[REDACTED]"],
  [/(authorization)"?\s*[:=]\s*"?[^\n",}]+/gi, "$1=[REDACTED]"],
  [/"uploadUrl"\s*:\s*"[^"]+"/g, '"uploadUrl":"[REDACTED]"'],
];

export function redactSmokeText(text: string): string {
  return REDACTIONS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}

export function resolveSmokeBaseUrl(raw: string, allowLoopback: boolean): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`invalid-base-url: ${redactSmokeText(raw)}`);
  }
  if (url.origin === STAGING_APP_ORIGIN) return STAGING_APP_ORIGIN;
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname) && allowLoopback) return url.origin;
  throw new Error(`unapproved-smoke-origin: ${url.origin}`);
}

const readBody = async (response: SmokeFetchResponse): Promise<{ text: string; json: unknown }> => {
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { text, json };
};

const detailOf = (response: SmokeFetchResponse, body: { text: string; json: unknown }): string => {
  const error = typeof body.json === "object" && body.json !== null && "error" in body.json
    ? String((body.json as { error: unknown }).error)
    : undefined;
  const status = typeof body.json === "object" && body.json !== null && "status" in body.json
    ? String((body.json as { status: unknown }).status)
    : undefined;
  const label = error ?? status ?? redactSmokeText(body.text).slice(0, 120);
  return `HTTP ${response.status}${label.length > 0 ? ` (${label})` : ""}`;
};

interface Expectation {
  readonly status: number;
  readonly predicate?: (json: unknown) => boolean;
  readonly expected: string;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;

const check = async (
  id: string,
  response: SmokeFetchResponse,
  expectation: Expectation,
): Promise<SmokeCheck> => {
  const body = await readBody(response);
  const matchesStatus = response.status === expectation.status;
  const matchesBody = expectation.predicate === undefined || expectation.predicate(body.json);
  if (matchesStatus && matchesBody) {
    return { id, status: "PASS", detail: `${expectation.expected}; observed ${detailOf(response, body)}` };
  }
  return { id, status: "FAIL", detail: `expected ${expectation.expected}; observed ${detailOf(response, body)}` };
};

const looksLikeSecretLeak = (text: string): boolean =>
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/.test(text) ||
  /"(access_token|refresh_token|id_token)"\s*:\s*"[^"]+"/.test(text);

const request = (
  deps: SmokeDependencies,
  baseUrl: string,
  path: string,
  init: { method?: "GET" | "POST"; origin?: string; body?: unknown } = {},
): Promise<SmokeFetchResponse> => {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.origin !== undefined) headers.origin = init.origin;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return deps.fetch(`${baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
};

export async function runStagingSmoke(baseUrl: string, deps: SmokeDependencies): Promise<SmokeReport> {
  const origin = resolveSmokeBaseUrl(baseUrl, deps.allowLoopback === true);
  if (deps.approval !== SMOKE_APPROVAL_TOKEN) {
    deps.log(`BLOCKED: set ${SMOKE_APPROVAL_ENV}=${SMOKE_APPROVAL_TOKEN} after staging approval; no request was sent.`);
    return {
      reportVersion: "1.0",
      baseUrl: origin,
      status: "BLOCKED",
      checks: [],
      reason: "approval-required",
    };
  }

  deps.log(`staging smoke against ${origin}`);
  const checks: SmokeCheck[] = [];
  const bodies: string[] = [];

  const capture = async (id: string, path: string, init: Parameters<typeof request>[3], expectation: Expectation) => {
    const response = await request(deps, origin, path, init);
    const body = await readBody(response);
    bodies.push(body.text);
    const result = await check(id, { ...response, text: async () => body.text }, expectation);
    checks.push(result);
    deps.log(`[${result.status}] ${id}: ${result.detail}`);
  };

  await capture("health-live", "/api/health/live", {}, {
    status: 200,
    expected: "200 status=live",
    predicate: (json) => asRecord(json)?.status === "live",
  });

  const readyResponse = await request(deps, origin, "/api/health/ready", {});
  const readyBody = await readBody(readyResponse);
  bodies.push(readyBody.text);
  const ready = asRecord(readyBody.json);
  const readyCheck: SmokeCheck = readyResponse.status === 200 && ready?.status === "ready"
    ? { id: "health-ready", status: "PASS", detail: `200 status=ready` }
    : {
        id: "health-ready",
        status: "FAIL",
        detail: `expected 200 status=ready; observed ${detailOf(readyResponse, readyBody)}${
          ready?.reason === undefined ? "" : ` reason=${redactSmokeText(String(ready.reason))}`
        }`,
      };
  checks.push(readyCheck);
  deps.log(`[${readyCheck.status}] health-ready: ${readyCheck.detail}`);

  await capture(
    "import-cross-origin-rejected",
    "/api/v1/assets/import",
    {
      method: "POST",
      origin: "https://smoke.invalid",
      body: { url: "https://www.tiktok.com/@staging_smoke/video/7300000000000000000" },
    },
    {
      status: 403,
      expected: "403 forbidden",
      predicate: (json) => asRecord(json)?.error === "forbidden",
    },
  );

  await capture(
    "import-auth-boundary",
    "/api/v1/assets/import",
    {
      method: "POST",
      origin,
      body: { url: "https://www.tiktok.com/@staging_smoke/video/7300000000000000000" },
    },
    { status: 401, expected: "401 unauthenticated" },
  );

  await capture(
    "media-admit-auth-boundary",
    "/api/media/admit",
    { method: "POST", origin, body: { action: "initiate", mime: "video/mp4", size: 1 } },
    { status: 401, expected: "401 unauthenticated" },
  );

  const leaked = bodies.filter(looksLikeSecretLeak).length;
  const leakCheck: SmokeCheck = leaked === 0
    ? { id: "no-secret-leakage", status: "PASS", detail: "no token-shaped values in responses" }
    : { id: "no-secret-leakage", status: "FAIL", detail: `${leaked} response bodies contain token-shaped values` };
  checks.push(leakCheck);
  deps.log(`[${leakCheck.status}] no-secret-leakage: ${leakCheck.detail}`);

  const failed = checks.filter((entry) => entry.status === "FAIL").length;
  const status: SmokeStatus = failed === 0 ? "PASS" : "FAIL";
  deps.log(`staging smoke ${status}: ${checks.length - failed}/${checks.length} checks passed`);
  return { reportVersion: "1.0", baseUrl: origin, status, checks };
}
