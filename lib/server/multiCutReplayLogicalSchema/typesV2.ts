import type {
  MultiCutReplayAuthoritativeIdentity,
  MultiCutReplayFencingToken,
  MultiCutReplayReservationEvidence,
  MultiCutReplayResultReference,
} from "../multiCutReplayShared/types";
import type {
  MultiCutReplayCompletionMetadataV4,
  MultiCutReplayFailureMetadataV4,
  MultiCutReplayReleaseMetadataV4,
} from "../multiCutReplayLifecycle/typesV4";

export type MultiCutReplayLogicalSchemaVersionV2 = "2.0";

export type MultiCutReplayLogicalRecordIdentityV2 = Readonly<{
  identityVersion: "2.0";
  protectedScope:
    MultiCutReplayAuthoritativeIdentity["protectedScope"];
  keyIdentity:
    MultiCutReplayAuthoritativeIdentity["resolvedIdentity"]["keyIdentity"];
}>;

export type MultiCutReplayLogicalRequestSemanticsV2 = Readonly<{
  semanticsVersion: "1.0";
  requestFingerprintIdentity:
    MultiCutReplayAuthoritativeIdentity["resolvedIdentity"]["requestFingerprintIdentity"];
  role: "semantic-compatibility-only";
}>;

export type MultiCutReplayLogicalRecordStateV2 =
  | "processing"
  | "completed"
  | "released"
  | "failed";

export type MultiCutReplayPersistentConcurrencyContinuityV2 = Readonly<{
  continuityVersion: "1.0";
  revision: string;
  lastFencingToken: MultiCutReplayFencingToken;
  lastReservationAttempt: number;
}>;

export type MultiCutReplayPersistentConcurrencyFieldSemanticsV2 = Readonly<{
  purpose:
    | "record-mutation-cas"
    | "ownership-epoch-successor-source"
    | "ownership-acquisition-successor-source";
  lifecycle: "entire-replay-record-lifecycle";
  owner: "replay-persistence";
  generationAuthority: "postgresql";
  mutationAuthority: "successful-authoritative-mutation-only";
  persistenceSemantics: "lifecycle-persistent";
  terminalSemantics: "retained";
  retrySemantics: "never-predict-reconcile-first";
  reconciliationSemantics: "compare-authoritative-persisted-value";
}>;

export type MultiCutReplayPersistentConcurrencyContinuitySemanticsV2 =
  Readonly<{
    semanticsVersion: "1.0";
    revision: MultiCutReplayPersistentConcurrencyFieldSemanticsV2 & {
      purpose: "record-mutation-cas";
    };
    lastFencingToken:
      MultiCutReplayPersistentConcurrencyFieldSemanticsV2 & {
        purpose: "ownership-epoch-successor-source";
      };
    lastReservationAttempt:
      MultiCutReplayPersistentConcurrencyFieldSemanticsV2 & {
        purpose: "ownership-acquisition-successor-source";
      };
  }>;

type MultiCutReplayLogicalRecordBaseV2 = Readonly<{
  logicalSchemaVersion: MultiCutReplayLogicalSchemaVersionV2;
  recordIdentity: MultiCutReplayLogicalRecordIdentityV2;
  requestSemantics: MultiCutReplayLogicalRequestSemanticsV2;
  persistentConcurrencyContinuity:
    MultiCutReplayPersistentConcurrencyContinuityV2;
}>;

export type MultiCutReplayLogicalProcessingRecordV2 = Readonly<
  MultiCutReplayLogicalRecordBaseV2 & {
    state: "processing";
    reservationEvidence: MultiCutReplayReservationEvidence;
  }
>;

export type MultiCutReplayLogicalCompletedRecordV2 = Readonly<
  MultiCutReplayLogicalRecordBaseV2 & {
    state: "completed";
    resultReference: MultiCutReplayResultReference;
    metadata: MultiCutReplayCompletionMetadataV4;
  }
>;

export type MultiCutReplayLogicalFailedRecordV2 = Readonly<
  MultiCutReplayLogicalRecordBaseV2 & {
    state: "failed";
    metadata: MultiCutReplayFailureMetadataV4;
  }
>;

export type MultiCutReplayLogicalReleasedRecordV2 = Readonly<
  MultiCutReplayLogicalRecordBaseV2 & {
    state: "released";
    metadata: MultiCutReplayReleaseMetadataV4;
  }
>;

export type MultiCutReplayLogicalRecordV2 =
  | MultiCutReplayLogicalProcessingRecordV2
  | MultiCutReplayLogicalCompletedRecordV2
  | MultiCutReplayLogicalFailedRecordV2
  | MultiCutReplayLogicalReleasedRecordV2;

export type MultiCutReplayLogicalIdentityInvariantsV2 = Readonly<{
  logicalSchemaVersion: "2.0";
  authoritativeSelector: "complete-protected-scope-and-key";
  fingerprintAuthority: "semantic-compatibility-only";
  lifecycleIdentityBehavior: "preserved";
  recoveryIdentityBehavior: "preserved";
  incompleteIdentityAcceptance: "rejected";
  v1UpgradeBehavior: "not-supported";
  mixedVersionLookup: "not-supported";
  revisionBehavior: "monotonic-lifecycle-persistent";
  fencingTokenBehavior: "monotonic-lifecycle-persistent";
  reservationAttemptBehavior: "monotonic-lifecycle-persistent";
  activeEvidenceRelationship: "independent";
  terminalContinuityBehavior: "preserved";
  replayIdentityMutation: "prohibited";
  fingerprintMutation: "prohibited";
}>;

export type MultiCutReplayLogicalRecordRelationshipsV2 = Readonly<{
  relationshipVersion: "1.0";
  replayRecord: Readonly<{
    replayIdentity: MultiCutReplayLogicalRecordIdentityV2;
    persistentConcurrencyContinuity:
      MultiCutReplayPersistentConcurrencyContinuityV2;
    activeProcessingSession:
      | MultiCutReplayReservationEvidence
      | "absent-in-terminal-state";
  }>;
  boundary: Readonly<{
    persistentContinuityOwnsActiveLease: false;
    activeSessionOwnsSuccessorAuthority: false;
    terminalStateRetainsActiveSession: false;
  }>;
}>;
