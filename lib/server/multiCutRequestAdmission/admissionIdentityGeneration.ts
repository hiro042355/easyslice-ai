import type {
  MultiCutReplayAuthoritativeIdentity,
  MultiCutReplayProtectedScope,
  MultiCutReplayResolvedIdentity,
} from "../multiCutReplayShared/types";
import type {
  MultiCutCanonicalFingerprintInput,
} from "./types";

const canonicalize = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite number");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("unsupported fingerprint value");
};

export const projectRequestFingerprintIdentity = (
  input: MultiCutCanonicalFingerprintInput,
): string => {
  const canonical = canonicalize(input);
  let high = 0x811c9dc5;
  let low = 0x9e3779b9;

  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    high = Math.imul(high ^ code, 0x01000193) >>> 0;
    low = Math.imul(low ^ (code + index), 0x85ebca6b) >>> 0;
  }

  return `multi-cut-request-fingerprint:v1:${high
    .toString(16)
    .padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
};

export const hasValidFingerprintShape = (
  input: MultiCutCanonicalFingerprintInput,
): boolean =>
  input !== null &&
  typeof input === "object" &&
  input.request !== null &&
  typeof input.request === "object" &&
  input.authenticatedRequest !== null &&
  typeof input.authenticatedRequest === "object" &&
  input.sourceArtifactHandoff !== null &&
  typeof input.sourceArtifactHandoff === "object";

export const createMultiCutReplayAuthoritativeIdentity = (
  protectedScope: MultiCutReplayProtectedScope,
  keyIdentity: string,
  requestFingerprintIdentity: string,
): MultiCutReplayAuthoritativeIdentity => {
  const resolvedIdentity: MultiCutReplayResolvedIdentity = Object.freeze({
    identityVersion: "1.0",
    keyIdentity,
    requestFingerprintIdentity,
  });

  return Object.freeze({
    identityVersion: "2.0",
    protectedScope,
    resolvedIdentity,
  });
};
