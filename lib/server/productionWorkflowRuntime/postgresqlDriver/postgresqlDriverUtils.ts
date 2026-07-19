const SAFE_IDENTIFIER = /^[a-z][a-z0-9.-]{0,127}$/;
const CANONICAL_DECIMAL = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/;
const CANONICAL_NUMERIC = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export const isSafeStatementId = (value: string): boolean => SAFE_IDENTIFIER.test(value);
export const isCanonicalUuid = (value: string): boolean => UUID.test(value);
export const isCanonicalUtcTimestamp = (value: string): boolean => UTC_TIMESTAMP.test(value) && !value.includes("infinity");

export function parsePostgreSQLBigIntString(value: unknown): string {
  if (typeof value !== "string" || !CANONICAL_DECIMAL.test(value)) throw new Error("postgresql-bigint-invalid");
  return value;
}

export function parsePostgreSQLNumericString(value: unknown): string {
  if (typeof value !== "string" || !CANONICAL_NUMERIC.test(value)) throw new Error("postgresql-numeric-invalid");
  return value;
}

export function parsePostgreSQLSafeInteger(value: unknown, allowNegative = true): number {
  const raw = parsePostgreSQLBigIntString(value);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || (!allowNegative && parsed < 0)) throw new Error("postgresql-safe-integer-invalid");
  return parsed;
}

export const parsePostgreSQLRevision = (value: unknown): number => parsePostgreSQLSafeInteger(value, false);

export function normalizePostgreSQLUtcTimestamp(value: unknown): string {
  if (typeof value !== "string") throw new Error("postgresql-timestamp-invalid");
  const normalized = value.replace(" ", "T").replace(/\+00(?::00)?$/, "Z");
  if (!isCanonicalUtcTimestamp(normalized)) throw new Error("postgresql-timestamp-invalid");
  return normalized;
}
