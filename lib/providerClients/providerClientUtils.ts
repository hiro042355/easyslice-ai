import type { NormalizedProviderClientError, ProviderClientErrorCategory, ProviderHttpStatusClass, ProviderLatencyClass, ProviderRetryAdvice, ProviderRetryReason, ProviderTimeoutCategory, ReferenceTransportScenario, SafeTransportMetadata } from "./types";

export const deepCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const deepFreeze = <T>(value: T): T => { if (value && typeof value === "object") { Object.freeze(value); Object.values(value as Record<string, unknown>).forEach(deepFreeze); } return value; };
export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export const isPositiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0;
export const isSafeOpaqueRef = (value: unknown, maximum = 128): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maximum &&
  value.trim() === value &&
  !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
  !/[\\/\r\n]/.test(value);
export const normalizeProgress = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : undefined;
export const normalizeRetryAfter = (value: unknown): number | undefined => isPositiveInteger(value) ? value : undefined;

const ERROR_MAP: Readonly<Partial<Record<ReferenceTransportScenario, { category: ProviderClientErrorCategory; retryable: boolean; reason: ProviderRetryReason; safeCode?: string; timeoutCategory?: ProviderTimeoutCategory; http: ProviderHttpStatusClass; latency: ProviderLatencyClass; retryAfterMs?: number }>>> = deepFreeze({
  "provider-failed": { category: "generation-failed", retryable: false, reason: "not-retryable", http: "5xx", latency: "normal" },
  "rate-limited": { category: "rate-limit", retryable: true, reason: "rate-limit", http: "4xx", latency: "fast", retryAfterMs: 30000 },
  "rate-limited-no-retry-after": { category: "rate-limit", retryable: true, reason: "rate-limit", http: "4xx", latency: "fast" },
  "connect-timeout": { category: "timeout", retryable: true, reason: "timeout", timeoutCategory: "connect", http: "network", latency: "timeout" },
  "request-timeout": { category: "timeout", retryable: true, reason: "timeout", timeoutCategory: "request", http: "network", latency: "timeout" },
  "read-timeout": { category: "timeout", retryable: true, reason: "timeout", timeoutCategory: "read", http: "network", latency: "timeout" },
  "provider-unavailable": { category: "provider-unavailable", retryable: true, reason: "provider-unavailable", http: "5xx", latency: "slow" },
  "authentication-failed": { category: "authentication", retryable: false, reason: "not-retryable", http: "4xx", latency: "fast" },
  "authorization-failed": { category: "authorization", retryable: false, reason: "not-retryable", http: "4xx", latency: "fast" },
  "invalid-request": { category: "invalid-request", retryable: false, reason: "not-retryable", http: "4xx", latency: "fast" },
  unsupported: { category: "unsupported", retryable: false, reason: "not-retryable", http: "4xx", latency: "fast" },
  "content-policy": { category: "content-policy", retryable: false, reason: "not-retryable", http: "4xx", latency: "normal" },
  "payload-too-large": { category: "payload-too-large", retryable: false, reason: "not-retryable", http: "4xx", latency: "fast" },
  "job-not-found": { category: "job-not-found", retryable: false, reason: "not-retryable", http: "4xx", latency: "fast" },
  cancelled: { category: "cancelled", retryable: false, reason: "not-retryable", http: "network", latency: "fast" },
  "timeout-after-acceptance": { category: "timeout", retryable: false, reason: "not-retryable", safeCode: "acceptance-unknown", timeoutCategory: "request", http: "network", latency: "timeout" },
  "malformed-json": { category: "malformed-response", retryable: false, reason: "not-retryable", http: "2xx", latency: "normal" }, "empty-body": { category: "malformed-response", retryable: false, reason: "not-retryable", http: "2xx", latency: "normal" }, "html-body": { category: "malformed-response", retryable: false, reason: "not-retryable", http: "5xx", latency: "normal" }, "null-body": { category: "malformed-response", retryable: false, reason: "not-retryable", http: "2xx", latency: "normal" }, "array-body": { category: "malformed-response", retryable: false, reason: "not-retryable", http: "2xx", latency: "normal" }, "missing-field": { category: "malformed-response", retryable: false, reason: "not-retryable", http: "2xx", latency: "normal" }, "wrong-field-type": { category: "malformed-response", retryable: false, reason: "not-retryable", http: "2xx", latency: "normal" }, "wrong-version": { category: "malformed-response", retryable: false, reason: "not-retryable", http: "2xx", latency: "normal" }, "oversized-response": { category: "malformed-response", retryable: false, reason: "not-retryable", http: "2xx", latency: "slow" }, "unknown-status": { category: "malformed-response", retryable: false, reason: "not-retryable", http: "2xx", latency: "normal" },
});

export function mapReferenceScenarioToError(scenario: ReferenceTransportScenario): { error: NormalizedProviderClientError; retryAdvice: ProviderRetryAdvice; transportBase: Omit<SafeTransportMetadata, "attempt" | "requestAccepted"> } | undefined {
  const mapped = ERROR_MAP[scenario]; if (!mapped) return undefined;
  const retryAfterMs = normalizeRetryAfter(mapped.retryAfterMs);
  return { error: { category: mapped.category, retryable: mapped.retryable, ...(retryAfterMs ? { retryAfterMs } : {}), ...(mapped.safeCode ? { safeCode: mapped.safeCode } : {}) }, retryAdvice: { retryable: mapped.retryable, reason: mapped.reason, ...(retryAfterMs ? { retryAfterMs } : {}) }, transportBase: { httpStatusClass: mapped.http, latencyClass: mapped.latency, ...(mapped.timeoutCategory ? { timeoutCategory: mapped.timeoutCategory } : {}), ...(mapped.category === "rate-limit" ? { rateLimit: { ...(retryAfterMs ? { retryAfterMs } : {}), remainingClass: "none", limitClass: "minute" } } : {}) } };
}

export const nonRetryAdvice = (): ProviderRetryAdvice => ({ retryable: false, reason: "not-retryable" });

// Gregorian conversion without Date/new Date keeps the Reference environment deterministic.
export function parseIsoEpochSeconds(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.000Z$/.exec(value); if (!m) return undefined;
  const y=Number(m[1]), mo=Number(m[2]), d=Number(m[3]), h=Number(m[4]), mi=Number(m[5]), s=Number(m[6]);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mo<1||mo>12||d<1||d>daysInMonth[mo-1]||h>23||mi>59||s>59) return undefined;
  const adjustedY = y - (mo <= 2 ? 1 : 0); const era = Math.floor(adjustedY / 400); const yoe = adjustedY - era * 400; const mp = mo + (mo > 2 ? -3 : 9); const doy = Math.floor((153 * mp + 2) / 5) + d - 1; const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; const days = era * 146097 + doe - 719468;
  return days * 86400 + h * 3600 + mi * 60 + s;
}
