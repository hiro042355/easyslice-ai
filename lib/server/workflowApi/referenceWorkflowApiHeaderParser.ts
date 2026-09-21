const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_HEADER_LENGTH = 2048;

export type ParsedHeader =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "valid"; value: string };

export function parseSingleWorkflowApiHeader(
  headers: Headers,
  name: "content-type" | "content-length" | "idempotency-key" | "origin" | "host" | "sec-fetch-site" | "cookie" | "x-csrf-token",
  options: { required?: boolean; maxLength?: number } = {},
): ParsedHeader {
  const raw = headers.get(name);
  if (raw === null) return options.required ? { status: "invalid" } : { status: "missing" };
  const maxLength = options.maxLength ?? MAX_HEADER_LENGTH;
  if (
    raw.length === 0 ||
    raw.length > maxLength ||
    raw !== raw.trim() ||
    raw.includes(",") ||
    CONTROL.test(raw)
  ) return { status: "invalid" };
  return { status: "valid", value: raw };
}

export function parseWorkflowApiContentType(headers: Headers): { status: "valid" } | { status: "invalid" } {
  const parsed = parseSingleWorkflowApiHeader(headers, "content-type", { required: true, maxLength: 256 });
  if (parsed.status !== "valid") return { status: "invalid" };
  const segments = parsed.value.split(";").map((segment) => segment.trim());
  if (segments[0]?.toLowerCase() !== "application/json" || segments.length > 2) return { status: "invalid" };
  if (segments.length === 1) return { status: "valid" };
  const match = /^charset\s*=\s*(?:utf-8|"utf-8")$/i.exec(segments[1] ?? "");
  return match ? { status: "valid" } : { status: "invalid" };
}

export function parseWorkflowApiContentLength(headers: Headers):
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "valid"; value: number } {
  const parsed = parseSingleWorkflowApiHeader(headers, "content-length", { maxLength: 32 });
  if (parsed.status !== "valid") return parsed;
  if (!/^(?:0|[1-9]\d*)$/.test(parsed.value)) return { status: "invalid" };
  const value = Number(parsed.value);
  return Number.isSafeInteger(value) ? { status: "valid", value } : { status: "invalid" };
}
