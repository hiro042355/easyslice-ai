import { copy, isPlainObject, validIdempotencyKey } from "@/lib/workflowApi/workflowApiUtils";
import { createWorkflowUiError } from "@/lib/workflowUi/workflowUiUtils";
import type { WorkflowUiApiClientResult } from "@/lib/workflowUi/types";

export const RESPONSE_BYTE_LIMIT = 262144;
export const ENDPOINTS = Object.freeze({ start: "/api/v1/workflows/start", pollUpload: "/api/v1/workflows/poll-upload", pollGeneration: "/api/v1/workflows/poll-generation", queryResult: "/api/v1/workflows/result", cancel: "/api/v1/workflows/cancel" });
export const DEFAULT_TIMEOUTS = Object.freeze({ start: 30000, pollUpload: 15000, pollGeneration: 15000, queryResult: 15000, cancel: 15000 });
const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);

export const networkResult = (code: "network-unavailable" | "request-timeout" | "response-invalid" | "service-unavailable"): WorkflowUiApiClientResult => ({ status: "network-error", error: createWorkflowUiError(code, code !== "response-invalid") });
export const abortedResult = (): WorkflowUiApiClientResult => ({ status: "aborted" });
export const validKey = (value: unknown): value is string => validIdempotencyKey(value) && !value.includes(",") && !value.includes("\r") && !value.includes("\n");
export const validCsrf = (value: unknown): value is string => typeof value === "string" && value.length >= 16 && value.length <= 512 && /^[A-Za-z0-9._~-]+$/.test(value) && value !== "undefined";

function safeValue(value: unknown, depth = 0): boolean {
  if (depth > 32 || value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 1000 && value.every((item) => safeValue(item, depth + 1));
  if (!isPlainObject(value)) return false;
  return Object.keys(value).every((key) => !forbiddenKeys.has(key)) && Object.values(value).every((item) => safeValue(item, depth + 1));
}
export function serializeRequest(value: unknown): { status: "serialized"; body: string; bytes: number } | { status: "invalid" } {
  try {
    if (!isPlainObject(value) || !safeValue(value) || "idempotencyKey" in value || "scenario" in value) return { status: "invalid" };
    const cloned = copy(value);
    const body = JSON.stringify(cloned);
    if (!body || body === "{}" && Object.keys(value).length > 0) return { status: "invalid" };
    return { status: "serialized", body, bytes: new TextEncoder().encode(body).length };
  } catch { return { status: "invalid" }; }
}
export function requestLimit(method: keyof typeof ENDPOINTS, request: Record<string, unknown>): number {
  if (method !== "start") return 8192;
  return request.operation === "generate-mv" ? 524288 : 131072;
}
export function validJsonContentType(headers: Readonly<Record<string, string>>): boolean {
  const values = Object.entries(headers).filter(([name]) => name.toLowerCase() === "content-type").map(([, value]) => value);
  if (values.length !== 1 || values[0].includes(",")) return false;
  const parts = values[0].split(";").map((part) => part.trim());
  if (parts.shift()?.toLowerCase() !== "application/json") return false;
  if (parts.length === 0) return true;
  if (parts.length !== 1) return false;
  return /^charset=(?:utf-8|"utf-8")$/i.test(parts[0]);
}
export function decodeJson(body: Uint8Array): unknown | undefined {
  if (body.byteLength === 0 || body.byteLength > RESPONSE_BYTE_LIMIT) return undefined;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    if (!text.trim() || text.charCodeAt(0) === 0xfeff) return undefined;
    const value = JSON.parse(text);
    return isPlainObject(value) ? value : undefined;
  } catch { return undefined; }
}
