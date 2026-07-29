import type {
  MultiCutReplayAuthoritativeIdentity,
  MultiCutReplayLeaseIdentity,
  MultiCutReplayReservationIdentity,
  MultiCutReplayReservationEvidence,
  MultiCutReplayResultReference,
} from "../multiCutReplayShared/types";

export type MultiCutReplayLifecycleContractVersionV4 = "4.0";

export type MultiCutReplayRecordStateV4 =
  | "processing"
  | "completed"
  | "released"
  | "failed";

export type MultiCutReplayCompletionMetadataV4 = Readonly<{
  metadataVersion: "1.0";
  completedAt: string;
  completionClassification: "workflow-completed";
}>;

export type MultiCutReplayFailureMetadataV4 = Readonly<{
  metadataVersion: "1.0";
  failedAt: string;
  failureClassification:
    | "workflow-failed"
    | "workflow-cancelled"
    | "recovery-required";
}>;

export type MultiCutReplayReleaseMetadataV4 = Readonly<{
  metadataVersion: "1.0";
  releasedAt: string;
  releaseClassification: "before-side-effect" | "safe-checkpoint";
}>;

type MultiCutReplayLifecycleTransitionBaseV4 = Readonly<{
  inputVersion: MultiCutReplayLifecycleContractVersionV4;
  replayIdentity: MultiCutReplayAuthoritativeIdentity;
  reservationEvidence: MultiCutReplayReservationEvidence;
}>;

export type MultiCutReplayLifecycleInputV4 =
  | Readonly<
      MultiCutReplayLifecycleTransitionBaseV4 & {
        transition: "complete";
        resultReference: MultiCutReplayResultReference;
        metadata: MultiCutReplayCompletionMetadataV4;
      }
    >
  | Readonly<
      MultiCutReplayLifecycleTransitionBaseV4 & {
        transition: "fail";
        metadata: MultiCutReplayFailureMetadataV4;
      }
    >
  | Readonly<
      MultiCutReplayLifecycleTransitionBaseV4 & {
        transition: "release";
        metadata: MultiCutReplayReleaseMetadataV4;
      }
    >
  | Readonly<
      MultiCutReplayLifecycleTransitionBaseV4 & {
        transition: "renew";
      }
    >;

export type MultiCutReplayLifecycleConflictClassificationV4 =
  | "stale-revision"
  | "stale-fence"
  | "terminal-preserved"
  | "invalid-transition"
  | "result-reference-conflict";

export type MultiCutReplayLifecycleUnavailableClassificationV4 =
  | "dependency-unavailable"
  | "commit-outcome-unknown"
  | "internal-failure";

export type MultiCutReplayLifecycleResultV4 =
  | Readonly<{
      resultVersion: MultiCutReplayLifecycleContractVersionV4;
      status: "completed";
      state: "completed";
      replayIdentity: MultiCutReplayAuthoritativeIdentity;
      resultReference: MultiCutReplayResultReference;
      revision: string;
    }>
  | Readonly<{
      resultVersion: MultiCutReplayLifecycleContractVersionV4;
      status: "failed";
      state: "failed";
      replayIdentity: MultiCutReplayAuthoritativeIdentity;
      revision: string;
    }>
  | Readonly<{
      resultVersion: MultiCutReplayLifecycleContractVersionV4;
      status: "released";
      state: "released";
      replayIdentity: MultiCutReplayAuthoritativeIdentity;
      revision: string;
    }>
  | Readonly<{
      resultVersion: MultiCutReplayLifecycleContractVersionV4;
      status: "renewed";
      state: "processing";
      replayIdentity: MultiCutReplayAuthoritativeIdentity;
      reservationEvidence: MultiCutReplayReservationEvidence;
    }>
  | Readonly<{
      resultVersion: MultiCutReplayLifecycleContractVersionV4;
      status: "conflict";
      failure: MultiCutReplayLifecycleConflictClassificationV4;
    }>
  | Readonly<{
      resultVersion: MultiCutReplayLifecycleContractVersionV4;
      status: "unavailable";
      failure: MultiCutReplayLifecycleUnavailableClassificationV4;
    }>;

export type MultiCutReplayLifecycleCapabilityV4 = Readonly<{
  transitionReplay(
    input: MultiCutReplayLifecycleInputV4,
  ): Promise<MultiCutReplayLifecycleResultV4>;
}>;

export type MultiCutReplayRecoveryReasonV4 =
  | "authoritative-lookup"
  | "reservation-commit-unknown"
  | "lifecycle-commit-unknown"
  | "stale-processing";

export type MultiCutReplayRecoveryLookupInputV4 = Readonly<{
  inputVersion: MultiCutReplayLifecycleContractVersionV4;
  replayIdentity: MultiCutReplayAuthoritativeIdentity;
  reason: MultiCutReplayRecoveryReasonV4;
}>;

export type MultiCutReplayAuthoritativeRecordV4 =
  | Readonly<{
      recordVersion: "1.0";
      state: "processing";
      replayIdentity: MultiCutReplayAuthoritativeIdentity;
      revision: string;
      leaseExpiresAt: string;
    }>
  | Readonly<{
      recordVersion: "1.0";
      state: "completed";
      replayIdentity: MultiCutReplayAuthoritativeIdentity;
      revision: string;
      resultReference: MultiCutReplayResultReference;
      completedAt: string;
    }>
  | Readonly<{
      recordVersion: "1.0";
      state: "released";
      replayIdentity: MultiCutReplayAuthoritativeIdentity;
      revision: string;
      releasedAt: string;
    }>
  | Readonly<{
      recordVersion: "1.0";
      state: "failed";
      replayIdentity: MultiCutReplayAuthoritativeIdentity;
      revision: string;
      failedAt: string;
      failureClassification:
        MultiCutReplayFailureMetadataV4["failureClassification"];
    }>;

export type MultiCutReplayRecoveryFailureClassificationV4 =
  | "record-not-found"
  | "record-corrupted"
  | "reconciliation-required"
  | "dependency-unavailable"
  | "internal-failure";

export type MultiCutReplayRecoveryLookupResultV4 =
  | Readonly<{
      resultVersion: MultiCutReplayLifecycleContractVersionV4;
      status: "authoritative";
      record: MultiCutReplayAuthoritativeRecordV4;
    }>
  | Readonly<{
      resultVersion: MultiCutReplayLifecycleContractVersionV4;
      status: "unavailable";
      failure: MultiCutReplayRecoveryFailureClassificationV4;
    }>;

export type MultiCutReplayRecoveryTakeoverInputV4 = Readonly<{
  inputVersion: MultiCutReplayLifecycleContractVersionV4;
  replayIdentity: MultiCutReplayAuthoritativeIdentity;
  reservationEvidence: MultiCutReplayReservationEvidence;
}>;

export type MultiCutReplayRecoveryTakeoverConflictClassificationV4 =
  | "stale-revision"
  | "stale-fence"
  | "takeover-conflict";

export type MultiCutReplayRecoveryTakeoverUnavailableClassificationV4 =
  | "dependency-unavailable"
  | "internal-failure";

export type MultiCutReplayRecoveryTakeoverResultV4 =
  | Readonly<{
      resultVersion: MultiCutReplayLifecycleContractVersionV4;
      status: "taken-over";
      state: "processing";
      replayIdentity: MultiCutReplayAuthoritativeIdentity;
      reservationEvidence: MultiCutReplayReservationEvidence;
    }>
  | Readonly<{
      resultVersion: MultiCutReplayLifecycleContractVersionV4;
      status: "conflict";
      failure: MultiCutReplayRecoveryTakeoverConflictClassificationV4;
    }>
  | Readonly<{
      resultVersion: MultiCutReplayLifecycleContractVersionV4;
      status: "unavailable";
      failure: MultiCutReplayRecoveryTakeoverUnavailableClassificationV4;
    }>;

export type MultiCutReplayReservationMutationReconciliationInputV4 =
  | Readonly<{
      inputVersion: MultiCutReplayLifecycleContractVersionV4;
      mutation: "renew";
      replayIdentity: MultiCutReplayAuthoritativeIdentity;
      previousReservationEvidence: MultiCutReplayReservationEvidence;
    }>
  | Readonly<{
      inputVersion: MultiCutReplayLifecycleContractVersionV4;
      mutation: "takeover";
      replayIdentity: MultiCutReplayAuthoritativeIdentity;
      previousReservationEvidence: MultiCutReplayReservationEvidence;
      requestedNextReservation: MultiCutReplayReservationIdentity;
      requestedNextLease: MultiCutReplayLeaseIdentity;
    }>;

export type MultiCutReplayReservationMutationConflictClassificationV4 =
  | "reservation-changed"
  | "lease-changed"
  | "fence-changed"
  | "attempt-changed"
  | "mutation-advanced"
  | "takeover-intent-mismatch";

export type MultiCutReplayReservationMutationReconciliationResultV4 =
  | Readonly<{
      resultVersion: MultiCutReplayLifecycleContractVersionV4;
      status: "confirmed" | "not-applied";
      mutation: "renew" | "takeover";
      replayIdentity: MultiCutReplayAuthoritativeIdentity;
      authoritativeReservationEvidence: MultiCutReplayReservationEvidence;
    }>
  | Readonly<{
      resultVersion: MultiCutReplayLifecycleContractVersionV4;
      status: "conflict";
      mutation: "renew" | "takeover";
      failure: MultiCutReplayReservationMutationConflictClassificationV4;
    }>
  | Readonly<{
      resultVersion: MultiCutReplayLifecycleContractVersionV4;
      status: "terminal";
      state: "completed" | "failed" | "released";
      replayIdentity: MultiCutReplayAuthoritativeIdentity;
    }>
  | Readonly<{
      resultVersion: MultiCutReplayLifecycleContractVersionV4;
      status:
        | "not-found"
        | "corrupted"
        | "unavailable"
        | "reconciliation-required";
    }>;

export type MultiCutReplayRecoveryCapabilityV4 = Readonly<{
  lookupReplay(
    input: MultiCutReplayRecoveryLookupInputV4,
  ): Promise<MultiCutReplayRecoveryLookupResultV4>;
  takeoverReplay(
    input: MultiCutReplayRecoveryTakeoverInputV4,
  ): Promise<MultiCutReplayRecoveryTakeoverResultV4>;
  reconcileReservationMutation(
    input: MultiCutReplayReservationMutationReconciliationInputV4,
  ): Promise<MultiCutReplayReservationMutationReconciliationResultV4>;
}>;
