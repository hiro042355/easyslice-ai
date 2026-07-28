import type {
  AuthenticatedRequestContext,
} from "../authBoundary/types";
import type {
  MultiCutRouteRequest,
} from "../multiCutRoute/multiCutRouteContractTypes";
import type {
  MultiCutSourceArtifactHandoff,
} from "../source/multiCutSourceArtifactHandoffTypes";
import type {
  WorkflowEntryIdempotencyIdentity,
} from "../workflowEntry/types";
import type {
  MultiCutReplayProtectedScope,
  MultiCutReplayReservationEvidence,
  MultiCutReplayResolvedIdentity,
  MultiCutReplayResultReference,
} from "../multiCutReplayShared/types";

export type {
  MultiCutReplayProtectedScope,
  MultiCutReplayReservationEvidence,
  MultiCutReplayResolvedIdentity,
  MultiCutReplayResultReference,
} from "../multiCutReplayShared/types";

export type MultiCutRequestAdmissionContractVersion = "2.0";

export type MultiCutCanonicalFingerprintInput = Readonly<{
  fingerprintInputVersion: "1.0";
  request: MultiCutRouteRequest;
  authenticatedRequest: AuthenticatedRequestContext;
  sourceArtifactHandoff: MultiCutSourceArtifactHandoff;
}>;

export type MultiCutRequestAdmissionInput = Readonly<{
  admissionInputVersion: MultiCutRequestAdmissionContractVersion;
  replayScope: MultiCutReplayProtectedScope;
  idempotencyKey: WorkflowEntryIdempotencyIdentity["keyIdentity"];
  fingerprintInput: MultiCutCanonicalFingerprintInput;
}>;

export type MultiCutReplayResolutionInput = Readonly<{
  resolutionInputVersion: "2.0";
  scope: MultiCutReplayProtectedScope;
  identity: MultiCutReplayResolvedIdentity;
}>;

export type MultiCutReplayResolutionResult =
  | Readonly<{
    resultVersion: "2.0";
    status: "new";
    identity: MultiCutReplayResolvedIdentity;
    reservationEvidence: MultiCutReplayReservationEvidence;
  }>
  | Readonly<{
    resultVersion: "2.0";
    status: "replay";
    identity: MultiCutReplayResolvedIdentity;
    resultReference: MultiCutReplayResultReference;
  }>
  | Readonly<{
    resultVersion: "2.0";
    status:
      | "duplicate-in-flight"
      | "semantic-conflict"
      | "unavailable";
  }>;

export type MultiCutReplayResolutionCapability = Readonly<{
  resolveReplay(
    input: MultiCutReplayResolutionInput,
  ): Promise<MultiCutReplayResolutionResult>;
}>;

export type MultiCutRequestAdmissionSuccess =
  | Readonly<{
    resultVersion: "2.0";
    status: "new";
    idempotency: WorkflowEntryIdempotencyIdentity;
    replayIdentity: MultiCutReplayResolvedIdentity;
    reservationEvidence: MultiCutReplayReservationEvidence;
  }>
  | Readonly<{
    resultVersion: "2.0";
    status: "replay";
    replayIdentity: MultiCutReplayResolvedIdentity;
    resultReference: MultiCutReplayResultReference;
  }>;

export type MultiCutRequestAdmissionFailureClassification =
  | "missing-key"
  | "invalid-key"
  | "invalid-fingerprint"
  | "dependency-unavailable"
  | "duplicate-in-flight"
  | "semantic-conflict"
  | "unsupported-version"
  | "internal-failure";

export type MultiCutRequestAdmissionFailure = Readonly<{
  resultVersion: "2.0";
  status: "failed";
  failure: MultiCutRequestAdmissionFailureClassification;
}>;

export type MultiCutRequestAdmissionResult =
  | MultiCutRequestAdmissionSuccess
  | MultiCutRequestAdmissionFailure;
