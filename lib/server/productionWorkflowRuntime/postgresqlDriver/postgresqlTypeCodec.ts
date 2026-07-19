import { types as pgTypes, type CustomTypesConfig } from "pg";
import type { PostgreSQLJsonValue, PostgreSQLParameter, PostgreSQLValue } from "./types";
import { isCanonicalUtcTimestamp, isCanonicalUuid, normalizePostgreSQLUtcTimestamp, parsePostgreSQLBigIntString, parsePostgreSQLNumericString } from "./postgresqlDriverUtils";

const MAX_JSON_BYTES = 1_048_576;
const encoder = new TextEncoder();

function copyJson(value: unknown, seen: Set<object> = new Set()): PostgreSQLJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("postgresql-json-number-invalid");
    return value;
  }
  if (typeof value !== "object") throw new Error("postgresql-json-type-invalid");
  if (seen.has(value)) throw new Error("postgresql-json-cyclic");
  seen.add(value);
  try {
    if (Array.isArray(value)) return Object.freeze(value.map((entry) => copyJson(entry, seen)));
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error("postgresql-json-prototype-invalid");
    if (Object.getOwnPropertySymbols(value).length) throw new Error("postgresql-json-symbol-invalid");
    const output: Record<string, PostgreSQLJsonValue> = {};
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || descriptor.get || descriptor.set) throw new Error("postgresql-json-accessor-invalid");
      output[key] = copyJson(descriptor.value, seen);
    }
    return Object.freeze(output);
  } finally { seen.delete(value); }
}

export function copyValidatedJson(value: unknown): PostgreSQLJsonValue {
  const copy = copyJson(value);
  if (encoder.encode(JSON.stringify(copy)).byteLength > MAX_JSON_BYTES) throw new Error("postgresql-json-too-large");
  return copy;
}

export function encodePostgreSQLParameter(parameter: PostgreSQLParameter): unknown {
  switch (parameter.kind) {
    case "null": return null;
    case "string": return parameter.value;
    case "boolean": return parameter.value;
    case "safe-integer": if (!Number.isSafeInteger(parameter.value)) throw new Error("postgresql-parameter-integer-invalid"); return parameter.value;
    case "bigint": return parsePostgreSQLBigIntString(parameter.value);
    case "uuid": if (!isCanonicalUuid(parameter.value)) throw new Error("postgresql-parameter-uuid-invalid"); return parameter.value;
    case "utc-timestamp": if (!isCanonicalUtcTimestamp(parameter.value)) throw new Error("postgresql-parameter-timestamp-invalid"); return parameter.value;
    case "bytea": return Buffer.from(parameter.value);
    case "json": return copyValidatedJson(parameter.value);
  }
  throw new Error("postgresql-parameter-kind-invalid");
}

export function decodePostgreSQLValue(oid: number, value: unknown): PostgreSQLValue {
  if (value === null) return null;
  if (oid === 20) return parsePostgreSQLBigIntString(value);
  if (oid === 1700) return parsePostgreSQLNumericString(value);
  if (oid === 2950) { if (typeof value !== "string" || !isCanonicalUuid(value)) throw new Error("postgresql-uuid-invalid"); return value; }
  if (oid === 1184) return normalizePostgreSQLUtcTimestamp(value);
  if (oid === 17) {
    if (!(value instanceof Uint8Array)) throw new Error("postgresql-bytea-invalid");
    return Uint8Array.from(value);
  }
  if (oid === 114 || oid === 3802) return copyValidatedJson(value);
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  throw new Error("postgresql-value-unsupported");
}

export function createPostgreSQLTypeParsers(): CustomTypesConfig {
  return {
    getTypeParser(oid, format) {
      if (format === "text" && (oid === 20 || oid === 1700 || oid === 1184 || oid === 1114 || oid === 1082)) return (value: string) => value;
      return pgTypes.getTypeParser(oid, format);
    },
  };
}
