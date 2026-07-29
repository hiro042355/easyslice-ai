import type {
  MultiCutReplayResolutionCapability,
  MultiCutReplayResolvedIdentity,
  MultiCutRequestAdmissionInput,
  MultiCutRequestAdmissionResult,
} from "./types";
import {
  hasValidFingerprintShape,
  projectRequestFingerprintIdentity,
} from "./admissionIdentityGeneration";

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
