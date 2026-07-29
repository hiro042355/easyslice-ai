import type {
  WorkflowEntryIdempotencyIdentity,
} from "../workflowEntry/types";
import type {
  MultiCutReplayAuthoritativeIdentity,
  MultiCutReplayProtectedScope,
  MultiCutReplayReservationEvidence,
  MultiCutReplayResultReference,
} from "../multiCutReplayShared/types";
import type {
  MultiCutReplayResolutionCapabilityV4,
} from "./replayResolutionTypesV4";
import type {
  MultiCutCanonicalFingerprintInput,
  MultiCutRequestAdmissionFailureClassification,
} from "./types";
import {
  createMultiCutReplayAuthoritativeIdentity,
  hasValidFingerprintShape,
  projectRequestFingerprintIdentity,
} from "./admissionIdentityGeneration";

export type MultiCutRequestAdmissionInputV4 = Readonly<{
  admissionInputVersion: "4.0";
  replayScope: MultiCutReplayProtectedScope;
  idempotencyKey: WorkflowEntryIdempotencyIdentity["keyIdentity"];
  fingerprintInput: MultiCutCanonicalFingerprintInput;
}>;

export type MultiCutRequestAdmissionFailureClassificationV4 =
  | MultiCutRequestAdmissionFailureClassification
  | "invalid-scope";

export type MultiCutRequestAdmissionResultV4 =
  | Readonly<{
      resultVersion: "4.0";
      status: "new";
      idempotency: WorkflowEntryIdempotencyIdentity;
      replayIdentity: MultiCutReplayAuthoritativeIdentity;
      reservationEvidence: MultiCutReplayReservationEvidence;
    }>
  | Readonly<{
      resultVersion: "4.0";
      status: "replay";
      replayIdentity: MultiCutReplayAuthoritativeIdentity;
      resultReference: MultiCutReplayResultReference;
    }>
  | Readonly<{
      resultVersion: "4.0";
      status: "failed";
      failure: MultiCutRequestAdmissionFailureClassificationV4;
    }>
  | Readonly<{
      resultVersion: "4.0";
      status: "authoritative-failed";
    }>;

const failure = (
  classification: MultiCutRequestAdmissionFailureClassificationV4,
): MultiCutRequestAdmissionResultV4 =>
  Object.freeze({
    resultVersion: "4.0",
    status: "failed",
    failure: classification,
  });

const hasCompleteProtectedScope = (
  scope: MultiCutReplayProtectedScope,
): boolean =>
  scope !== null &&
  typeof scope === "object" &&
  scope.scopeVersion === "1.0" &&
  typeof scope.replayNamespace === "string" &&
  scope.replayNamespace.length > 0 &&
  scope.tenant !== null &&
  typeof scope.tenant === "object" &&
  scope.tenant.identityVersion === "1.0" &&
  typeof scope.tenant.protectedTenantIdentity === "string" &&
  scope.tenant.protectedTenantIdentity.length > 0 &&
  typeof scope.operationIdentity === "string" &&
  scope.operationIdentity.length > 0;

export const runReferenceMultiCutRequestAdmissionV4 = async (
  input: MultiCutRequestAdmissionInputV4,
  replay: MultiCutReplayResolutionCapabilityV4,
): Promise<MultiCutRequestAdmissionResultV4> => {
  if (input.admissionInputVersion !== "4.0") {
    return failure("unsupported-version");
  }
  if (!hasCompleteProtectedScope(input.replayScope)) {
    return failure("invalid-scope");
  }
  if (
    typeof input.idempotencyKey !== "string" ||
    input.idempotencyKey.length === 0
  ) {
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

  let requestFingerprintIdentity: string;
  try {
    requestFingerprintIdentity = projectRequestFingerprintIdentity(
      input.fingerprintInput,
    );
  } catch {
    return failure("invalid-fingerprint");
  }

  const authoritativeIdentity = createMultiCutReplayAuthoritativeIdentity(
    input.replayScope,
    input.idempotencyKey,
    requestFingerprintIdentity,
  );

  try {
    const replayResult = await replay.resolveReplay(
      Object.freeze({
        resolutionInputVersion: "4.0",
        identity: authoritativeIdentity,
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
          resultVersion: "4.0",
          status: "authoritative-failed",
        });
      case "replay":
        return Object.freeze({
          resultVersion: "4.0",
          status: "replay",
          replayIdentity: replayResult.identity,
          resultReference: replayResult.resultReference,
        });
      case "new":
        return Object.freeze({
          resultVersion: "4.0",
          status: "new",
          idempotency: Object.freeze({
            identityVersion: "1.0",
            keyIdentity: replayResult.identity.resolvedIdentity.keyIdentity,
            requestFingerprintIdentity:
              replayResult.identity.resolvedIdentity
                .requestFingerprintIdentity,
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
