import type {
  MultiCutCanonicalFingerprintInput,
  MultiCutReplayResolutionCapability,
  MultiCutReplayResolvedIdentity,
  MultiCutRequestAdmissionInput,
  MultiCutRequestAdmissionResult,
} from "./types";

const failure = (
  classification: Extract<
    MultiCutRequestAdmissionResult,
    { status: "failed" }
  >["failure"],
): MultiCutRequestAdmissionResult =>
  Object.freeze({
    resultVersion: "3.0",
    status: "failed",
    failure: classification,
  });

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

const projectRequestFingerprintIdentity = (
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

const hasValidFingerprintShape = (
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

export const runReferenceMultiCutRequestAdmission = async (
  input: MultiCutRequestAdmissionInput,
  replay: MultiCutReplayResolutionCapability,
): Promise<MultiCutRequestAdmissionResult> => {
  if (input.admissionInputVersion !== "3.0") {
    return failure("unsupported-version");
  }
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.length === 0) {
    return failure("missing-key");
  }
  if (input.idempotencyKey.trim() !== input.idempotencyKey) {
    return failure("invalid-key");
  }
  if (
    input.fingerprintInput?.fingerprintInputVersion !== "1.0" ||
    !hasValidFingerprintShape(input.fingerprintInput)
  ) {
    return failure(
      input.fingerprintInput?.fingerprintInputVersion === undefined
        ? "invalid-fingerprint"
        : "unsupported-version",
    );
  }

  let projectedFingerprint: string;
  try {
    projectedFingerprint = projectRequestFingerprintIdentity(
      input.fingerprintInput,
    );
  } catch {
    return failure("invalid-fingerprint");
  }

  const projectedIdentity: MultiCutReplayResolvedIdentity = Object.freeze({
    identityVersion: "1.0",
    keyIdentity: input.idempotencyKey,
    requestFingerprintIdentity: projectedFingerprint,
  });

  try {
    const replayResult = await replay.resolveReplay(
      Object.freeze({
        resolutionInputVersion: "3.0",
        scope: input.replayScope,
        identity: projectedIdentity,
      }),
    );

    switch (replayResult.status) {
      case "duplicate-in-flight":
        return failure("duplicate-in-flight");
      case "semantic-conflict":
        return failure("semantic-conflict");
      case "unavailable":
        return failure("dependency-unavailable");
      case "authoritative-failed":
        return Object.freeze({
          resultVersion: "3.0",
          status: "authoritative-failed",
        });
      case "replay":
        return Object.freeze({
          resultVersion: "3.0",
          status: "replay",
          replayIdentity: replayResult.identity,
          resultReference: replayResult.resultReference,
        });
      case "new":
        return Object.freeze({
          resultVersion: "3.0",
          status: "new",
          idempotency: Object.freeze({
            identityVersion: "1.0",
            keyIdentity: replayResult.identity.keyIdentity,
            requestFingerprintIdentity:
              replayResult.identity.requestFingerprintIdentity,
            replayClassification: "new",
          }),
          replayIdentity: replayResult.identity,
          reservationEvidence: replayResult.reservationEvidence,
        });
      default: {
        const unreachable: never = replayResult;
        return unreachable;
      }
    }
  } catch {
    return failure("internal-failure");
  }
};
