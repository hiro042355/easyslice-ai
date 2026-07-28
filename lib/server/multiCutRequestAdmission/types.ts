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
  MultiCutReplayResolvedIdentity,
} from "../multiCutReplayShared/types";

export type {
  MultiCutReplayResolvedIdentity,
} from "../multiCutReplayShared/types";

export type MultiCutRequestAdmissionContractVersion = "1.0";

export type MultiCutCanonicalFingerprintInput = Readonly<{
  fingerprintInputVersion: "1.0";
  request: MultiCutRouteRequest;
  authenticatedRequest: AuthenticatedRequestContext;
  sourceArtifactHandoff: MultiCutSourceArtifactHandoff;
}>;

export type MultiCutRequestAdmissionInput = Readonly<{
  admissionInputVersion: MultiCutRequestAdmissionContractVersion;
  idempotencyKey: WorkflowEntryIdempotencyIdentity["keyIdentity"];
  fingerprintInput: MultiCutCanonicalFingerprintInput;
}>;

export type MultiCutReplayResolutionInput = Readonly<{
  resolutionInputVersion: "1.0";
  identity: MultiCutReplayResolvedIdentity;
}>;

export type MultiCutReplayResolutionResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "new" | "replay";
    identity: MultiCutReplayResolvedIdentity;
  }>
  | Readonly<{
    resultVersion: "1.0";
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

export type MultiCutRequestAdmissionOutcome = "new" | "replay";

export type MultiCutRequestAdmissionSuccess = Readonly<{
  resultVersion: "1.0";
  status: "admitted";
  outcome: MultiCutRequestAdmissionOutcome;
  idempotency: WorkflowEntryIdempotencyIdentity;
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
  resultVersion: "1.0";
  status: "failed";
  failure: MultiCutRequestAdmissionFailureClassification;
}>;

export type MultiCutRequestAdmissionResult =
  | MultiCutRequestAdmissionSuccess
  | MultiCutRequestAdmissionFailure;
