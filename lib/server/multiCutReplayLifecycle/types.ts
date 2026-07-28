import type {
  MultiCutReplayExpectedRevision,
  MultiCutReplayFencingToken,
  MultiCutReplayReservationIdentity,
  MultiCutReplayResolvedIdentity,
  MultiCutReplayResultReference,
} from "../multiCutReplayShared/types";

export type {
  MultiCutReplayExpectedRevision,
  MultiCutReplayFencingToken,
  MultiCutReplayReservationIdentity,
  MultiCutReplayResolvedIdentity,
  MultiCutReplayResultReference,
} from "../multiCutReplayShared/types";

export type MultiCutReplayLifecycleContractVersion = "1.0";

export type MultiCutReplayRecordState =
  | "processing"
  | "completed"
  | "released"
  | "failed";

export type MultiCutReplayCompletionMetadata = Readonly<{
  metadataVersion: "1.0";
  completedAt: string;
  completionClassification: "workflow-completed";
}>;

export type MultiCutReplayFailureMetadata = Readonly<{
  metadataVersion: "1.0";
  failedAt: string;
  failureClassification:
    | "workflow-failed"
    | "workflow-cancelled"
    | "recovery-required";
}>;

export type MultiCutReplayReleaseMetadata = Readonly<{
  metadataVersion: "1.0";
  releasedAt: string;
  releaseClassification:
    | "before-side-effect"
    | "safe-checkpoint";
}>;

type MultiCutReplayLifecycleTransitionBase = Readonly<{
  inputVersion: MultiCutReplayLifecycleContractVersion;
  replayIdentity: MultiCutReplayResolvedIdentity;
  reservation: MultiCutReplayReservationIdentity;
  expectedRevision: MultiCutReplayExpectedRevision;
  fencing: MultiCutReplayFencingToken;
}>;

export type MultiCutReplayLifecycleInput =
  | Readonly<
    MultiCutReplayLifecycleTransitionBase & {
      transition: "complete";
      resultReference: MultiCutReplayResultReference;
      metadata: MultiCutReplayCompletionMetadata;
    }
  >
  | Readonly<
    MultiCutReplayLifecycleTransitionBase & {
      transition: "fail";
      metadata: MultiCutReplayFailureMetadata;
    }
  >
  | Readonly<
    MultiCutReplayLifecycleTransitionBase & {
      transition: "release";
      metadata: MultiCutReplayReleaseMetadata;
    }
  >;

export type MultiCutReplayLifecycleConflictClassification =
  | "stale-revision"
  | "stale-fence"
  | "terminal-preserved"
  | "invalid-transition"
  | "result-reference-conflict";

export type MultiCutReplayLifecycleUnavailableClassification =
  | "dependency-unavailable"
  | "commit-outcome-unknown"
  | "internal-failure";

export type MultiCutReplayLifecycleResult =
  | Readonly<{
    resultVersion: MultiCutReplayLifecycleContractVersion;
    status: "completed";
    state: "completed";
    replayIdentity: MultiCutReplayResolvedIdentity;
    resultReference: MultiCutReplayResultReference;
    revision: string;
  }>
  | Readonly<{
    resultVersion: MultiCutReplayLifecycleContractVersion;
    status: "failed";
    state: "failed";
    replayIdentity: MultiCutReplayResolvedIdentity;
    revision: string;
  }>
  | Readonly<{
    resultVersion: MultiCutReplayLifecycleContractVersion;
    status: "released";
    state: "released";
    replayIdentity: MultiCutReplayResolvedIdentity;
    revision: string;
  }>
  | Readonly<{
    resultVersion: MultiCutReplayLifecycleContractVersion;
    status: "conflict";
    failure: MultiCutReplayLifecycleConflictClassification;
  }>
  | Readonly<{
    resultVersion: MultiCutReplayLifecycleContractVersion;
    status: "unavailable";
    failure: MultiCutReplayLifecycleUnavailableClassification;
  }>;

export type MultiCutReplayLifecycleCapability = Readonly<{
  transitionReplay(
    input: MultiCutReplayLifecycleInput,
  ): Promise<MultiCutReplayLifecycleResult>;
}>;

export type MultiCutReplayRecoveryReason =
  | "authoritative-lookup"
  | "reservation-commit-unknown"
  | "lifecycle-commit-unknown"
  | "stale-processing";

export type MultiCutReplayRecoveryInput = Readonly<{
  inputVersion: MultiCutReplayLifecycleContractVersion;
  replayIdentity: MultiCutReplayResolvedIdentity;
  reason: MultiCutReplayRecoveryReason;
}>;

export type MultiCutReplayAuthoritativeRecord =
  | Readonly<{
    recordVersion: "1.0";
    state: "processing";
    replayIdentity: MultiCutReplayResolvedIdentity;
    reservation: MultiCutReplayReservationIdentity;
    revision: string;
    fencing: MultiCutReplayFencingToken;
    leaseExpiresAt: string;
  }>
  | Readonly<{
    recordVersion: "1.0";
    state: "completed";
    replayIdentity: MultiCutReplayResolvedIdentity;
    revision: string;
    resultReference: MultiCutReplayResultReference;
    completedAt: string;
  }>
  | Readonly<{
    recordVersion: "1.0";
    state: "released";
    replayIdentity: MultiCutReplayResolvedIdentity;
    revision: string;
    releasedAt: string;
  }>
  | Readonly<{
    recordVersion: "1.0";
    state: "failed";
    replayIdentity: MultiCutReplayResolvedIdentity;
    revision: string;
    failedAt: string;
    failureClassification:
      MultiCutReplayFailureMetadata["failureClassification"];
  }>;

export type MultiCutReplayRecoveryFailureClassification =
  | "record-not-found"
  | "record-corrupted"
  | "reconciliation-required"
  | "dependency-unavailable"
  | "internal-failure";

export type MultiCutReplayRecoveryResult =
  | Readonly<{
    resultVersion: MultiCutReplayLifecycleContractVersion;
    status: "authoritative";
    record: MultiCutReplayAuthoritativeRecord;
  }>
  | Readonly<{
    resultVersion: MultiCutReplayLifecycleContractVersion;
    status: "unavailable";
    failure: MultiCutReplayRecoveryFailureClassification;
  }>;

export type MultiCutReplayRecoveryCapability = Readonly<{
  recoverReplay(
    input: MultiCutReplayRecoveryInput,
  ): Promise<MultiCutReplayRecoveryResult>;
}>;
