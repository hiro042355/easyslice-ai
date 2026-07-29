export type MultiCutReplayPersistenceParameterContractVersionV2 = "2.0";

export type MultiCutReplayPersistenceParameterAuthorityV2 =
  | "replay-identity-v2"
  | "request-semantics"
  | "persistence-internal-identity"
  | "ownership-intent"
  | "persisted-concurrency-state"
  | "persistence-lease-policy"
  | "postgresql-clock"
  | "authoritative-persisted-observation";

export type MultiCutReplayPersistenceParameterGenerationOwnerV2 =
  | "admission-runtime"
  | "persistence-generation-capability"
  | "persistence-lease-policy-capability"
  | "postgresql"
  | "none-authoritative-projection";

export type MultiCutReplayPersistenceParameterValidationOwnerV2 =
  | "admission-and-adapter-projection"
  | "generation-capability-and-database-type"
  | "lease-policy-and-adapter-projection"
  | "adapter-projection-and-postgresql"
  | "postgresql-predicate"
  | "postgresql-generation"
  | "recovery-projection";

export type MultiCutReplayPersistenceParameterPersistenceOwnerV2 =
  | "postgresql"
  | "not-persisted";

export type MultiCutReplayPersistenceParameterValueTypeV2 =
  | "uuid"
  | "authoritative-replay-identity-v2"
  | "protected-fingerprint-identity"
  | "protected-reservation-identity"
  | "protected-lease-identity"
  | "opaque-decimal-revision"
  | "opaque-decimal-fencing-token"
  | "bounded-lease-duration"
  | "integer"
  | "timestamp-with-time-zone"
  | "authoritative-reconciliation-evidence";

export type MultiCutReplayPersistenceParameterRequirementV2 =
  | "required"
  | "conditional";

export type MultiCutReplayPersistenceParameterMutabilityV2 =
  | "immutable"
  | "immutable-within-logical-attempt"
  | "mutable-successor"
  | "read-only-projection";

export type MultiCutReplayPersistenceParameterDirectionV2 =
  | "input"
  | "output"
  | "returning";

export type MultiCutReplayPersistenceParameterLifecyclePhaseV2 =
  | "resolution"
  | "lifecycle"
  | "recovery"
  | "reconciliation";

export type MultiCutReplayPersistenceParameterGenerationTimingV2 =
  | "admission"
  | "before-statement"
  | "within-statement"
  | "authoritative-read";

export type MultiCutReplayPersistenceParameterTransactionVisibilityV2 =
  | "known-before-statement"
  | "generated-and-returned-by-statement"
  | "returned-by-authoritative-read";

export type MultiCutReplayPersistenceParameterRetryBehaviorV2 =
  | "reuse-for-logical-attempt"
  | "never-predict-reconcile-first"
  | "repeat-authoritative-read";

export type MultiCutReplayPersistenceParameterGenerationInstructionV2 =
  | "consume-input"
  | "database-generate-per-adr"
  | "project-authoritative-row";

export type MultiCutReplayPersistenceParameterNameV2 =
  | "internal_record_id"
  | "replay_identity"
  | "fingerprint"
  | "reservation_identity"
  | "lease_identity"
  | "lease_duration"
  | "initial_revision"
  | "initial_fence"
  | "initial_lease_expiry"
  | "initial_reservation_attempt"
  | "expected_revision"
  | "expected_ownership_evidence"
  | "next_revision"
  | "expected_fence"
  | "renewed_lease_expiry"
  | "takeover_expected_revision"
  | "takeover_next_revision"
  | "takeover_expected_fence"
  | "takeover_next_fence"
  | "takeover_reservation_identity"
  | "takeover_lease_identity"
  | "takeover_lease_expiry"
  | "takeover_reservation_attempt"
  | "reconciliation_evidence";

export type MultiCutReplayPersistenceParameterMetadataV2 = Readonly<{
  contractVersion: MultiCutReplayPersistenceParameterContractVersionV2;
  name: MultiCutReplayPersistenceParameterNameV2;
  valueType: MultiCutReplayPersistenceParameterValueTypeV2;
  semanticMeaning: string;
  requirement: MultiCutReplayPersistenceParameterRequirementV2;
  mutability: MultiCutReplayPersistenceParameterMutabilityV2;
  authority: MultiCutReplayPersistenceParameterAuthorityV2;
  generationOwner: MultiCutReplayPersistenceParameterGenerationOwnerV2;
  validationOwner: MultiCutReplayPersistenceParameterValidationOwnerV2;
  persistenceOwner: MultiCutReplayPersistenceParameterPersistenceOwnerV2;
  generationTiming: MultiCutReplayPersistenceParameterGenerationTimingV2;
  transactionVisibility:
    MultiCutReplayPersistenceParameterTransactionVisibilityV2;
  retryBehavior: MultiCutReplayPersistenceParameterRetryBehaviorV2;
  sqlBindingName: string;
  physicalBindings: readonly string[];
  sqlDirection: MultiCutReplayPersistenceParameterDirectionV2;
  lifecyclePhase: MultiCutReplayPersistenceParameterLifecyclePhaseV2;
  statementConsumers: readonly string[];
  generationInstruction:
    MultiCutReplayPersistenceParameterGenerationInstructionV2;
  notes: string;
}>;

export type MultiCutReplayPersistenceParameterContractV2 = Readonly<{
  contractVersion: MultiCutReplayPersistenceParameterContractVersionV2;
  authoritySource:
    "replay-concurrency-authority-and-generation-ownership-adr-v1";
  parameters: readonly MultiCutReplayPersistenceParameterMetadataV2[];
  readiness: Readonly<{
    sqlMayChooseAuthority: false;
    sqlMayChooseRetrySemantics: false;
    sqlMayChooseRevisionSemantics: false;
    sqlMayChooseFenceSemantics: false;
    runtimeMayPredictDatabaseValues: false;
  }>;
}>;
