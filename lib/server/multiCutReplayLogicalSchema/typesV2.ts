import type {
  MultiCutReplayAuthoritativeIdentity,
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

type MultiCutReplayLogicalRecordBaseV2 = Readonly<{
  logicalSchemaVersion: MultiCutReplayLogicalSchemaVersionV2;
  recordIdentity: MultiCutReplayLogicalRecordIdentityV2;
  requestSemantics: MultiCutReplayLogicalRequestSemanticsV2;
  revision: string;
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
}>;
