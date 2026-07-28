import type {
  MultiCutReplayReservationEvidence,
  MultiCutReplayResolvedIdentity,
  MultiCutReplayResultReference,
} from "../multiCutReplayShared/types";

export type {
  MultiCutReplayReservationEvidence,
  MultiCutReplayResolvedIdentity,
  MultiCutReplayResultReference,
} from "../multiCutReplayShared/types";

export type MultiCutReplayLifecycleContractVersion = "2.0";

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
  reservationEvidence: MultiCutReplayReservationEvidence;
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
  >
  | Readonly<
    MultiCutReplayLifecycleTransitionBase & {
      transition: "renew";
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
    status: "renewed";
    state: "processing";
    replayIdentity: MultiCutReplayResolvedIdentity;
    reservationEvidence: MultiCutReplayReservationEvidence;
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
  /**
   * Transitions an existing processing reservation. A released reservation is
   * re-reserved only through the Resolution capability, never this capability.
   */
  transitionReplay(
    input: MultiCutReplayLifecycleInput,
  ): Promise<MultiCutReplayLifecycleResult>;
}>;

export type MultiCutReplayRecoveryReason =
  | "authoritative-lookup"
  | "reservation-commit-unknown"
  | "lifecycle-commit-unknown"
  | "stale-processing";

export type MultiCutReplayRecoveryLookupInput = Readonly<{
  inputVersion: MultiCutReplayLifecycleContractVersion;
  replayIdentity: MultiCutReplayResolvedIdentity;
  reason: MultiCutReplayRecoveryReason;
}>;

export type MultiCutReplayAuthoritativeRecord =
  | Readonly<{
    recordVersion: "1.0";
    state: "processing";
    replayIdentity: MultiCutReplayResolvedIdentity;
    revision: string;
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

export type MultiCutReplayRecoveryLookupResult =
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

export type MultiCutReplayRecoveryTakeoverInput = Readonly<{
  inputVersion: MultiCutReplayLifecycleContractVersion;
  replayIdentity: MultiCutReplayResolvedIdentity;
  reservationEvidence: MultiCutReplayReservationEvidence;
}>;

export type MultiCutReplayRecoveryTakeoverConflictClassification =
  | "stale-revision"
  | "stale-fence"
  | "takeover-conflict";

export type MultiCutReplayRecoveryTakeoverUnavailableClassification =
  | "dependency-unavailable"
  | "internal-failure";

export type MultiCutReplayRecoveryTakeoverResult =
  | Readonly<{
    resultVersion: MultiCutReplayLifecycleContractVersion;
    status: "taken-over";
    state: "processing";
    replayIdentity: MultiCutReplayResolvedIdentity;
    reservationEvidence: MultiCutReplayReservationEvidence;
  }>
  | Readonly<{
    resultVersion: MultiCutReplayLifecycleContractVersion;
    status: "conflict";
    failure: MultiCutReplayRecoveryTakeoverConflictClassification;
  }>
  | Readonly<{
    resultVersion: MultiCutReplayLifecycleContractVersion;
    status: "unavailable";
    failure: MultiCutReplayRecoveryTakeoverUnavailableClassification;
  }>;

export type MultiCutReplayRecoveryCapability = Readonly<{
  lookupReplay(
    input: MultiCutReplayRecoveryLookupInput,
  ): Promise<MultiCutReplayRecoveryLookupResult>;
  takeoverReplay(
    input: MultiCutReplayRecoveryTakeoverInput,
  ): Promise<MultiCutReplayRecoveryTakeoverResult>;
}>;
