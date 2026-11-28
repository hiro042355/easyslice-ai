import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Deterministic JSON used for DHA/handoff signatures.
 *
 * Only data is accepted: plain objects (sorted keys), arrays, strings, booleans,
 * finite numbers and null. Anything else is rejected instead of coerced, because a
 * silent `undefined`/`Date`/class instance would make two parties sign different
 * bytes for the same logical payload.
 */
export type CanonicalJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalJsonValue[]
  | Readonly<{ [key: string]: CanonicalJsonValue }>;

const canonical = (value: unknown, depth: number): string | undefined => {
  if (depth > 32) return undefined;
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : undefined;
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const entry of value) {
      const part = canonical(entry, depth + 1);
      if (part === undefined) return undefined;
      parts.push(part);
    }
    return `[${parts.join(",")}]`;
  }
  if (typeof value !== "object") return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const part = canonical((value as Record<string, unknown>)[key], depth + 1);
    if (part === undefined) return undefined;
    parts.push(`${JSON.stringify(key)}:${part}`);
  }
  return `{${parts.join(",")}}`;
};

/** Returns the canonical bytes, or undefined when the value is not plain data. */
export const canonicalJson = (value: unknown): string | undefined => canonical(value, 0);

export const sha256Hex = (input: string): string =>
  createHash("sha256").update(input, "utf8").digest("hex");

export const hmacSha256Base64Url = (key: string, message: string): string =>
  createHmac("sha256", key).update(message, "utf8").digest("base64url");

/** Constant-time comparison of two base64url MACs; length mismatch fails closed. */
export function macEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, "base64url");
  const b = Buffer.from(right, "base64url");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
