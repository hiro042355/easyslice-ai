export type MultiCutReplayPersistenceParameterContractVersionV2 = "2.0";

export type MultiCutReplayPersistenceParameterAuthorityV2 =
  | "replay-identity-v2"
  | "request-semantics"
  | "persistence-internal-identity"
  | "ownership-intent"
  | "persisted-concurrency-state"
  | "persistence-lease-policy"
  | "postgresql-clock"
  | "result-reference-boundary"
  | "lifecycle-terminal-metadata"
  | "authoritative-persisted-observation";

export type MultiCutReplayPersistenceParameterGenerationOwnerV2 =
  | "admission-runtime"
  | "persistence-generation-capability"
  | "persistence-lease-policy-capability"
  | "result-reference-capability"
  | "lifecycle-input-owner"
  | "postgresql"
  | "none-authoritative-projection";

export type MultiCutReplayPersistenceParameterValidationOwnerV2 =
  | "admission-and-adapter-projection"
  | "generation-capability-and-database-type"
  | "lease-policy-and-adapter-projection"
  | "adapter-projection-and-postgresql"
  | "postgresql-predicate"
  | "postgresql-generation"
  | "completion-boundary-and-adapter-projection"
  | "lifecycle-validation-and-adapter-projection"
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
  | "text"
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
  | "result_reference_version"
  | "result_reference_identity"
  | "terminal_metadata_version"
  | "terminal_timestamp"
  | "terminal_classification"
  | "reconciliation_evidence";

export type MultiCutReplayPersistencePostgresqlTypeV2 =
  | "bigint"
  | "boolean"
  | "integer"
  | "text"
  | "timestamp-with-time-zone";

export type MultiCutReplayPersistencePostgresqlExpressionNameV2 =
  | "initial-reservation-attempt"
  | "takeover-reservation-attempt"
  | "authoritative-current-time"
  | "initial-lease-expiry"
  | "renewal-lease-expiry"
  | "takeover-lease-expiry"
  | "stale-lease-comparison"
  | "renewable-lease-comparison"
  | "terminal-timestamp";

export type MultiCutReplayPersistencePostgresqlExpressionV2 = Readonly<{
  name: MultiCutReplayPersistencePostgresqlExpressionNameV2;
  expression: string;
  requiredBindings: readonly string[];
  outputType: MultiCutReplayPersistencePostgresqlTypeV2;
  transactionStability:
    | "transaction-stable"
    | "atomic-mutation"
    | "stable-input";
  retryBehavior:
    | "observe-after-unknown-commit"
    | "retain-expectation-and-reconcile"
    | "reuse-input-until-reconciliation"
    | "zero-row-requires-authoritative-resolution";
}>;

export type MultiCutReplayPersistenceAttemptPolicyV2 = Readonly<{
  initialValue: 1;
  postgresqlType: "integer";
  minimum: 1;
  maximum: 2147483647;
  progression: "advance-by-one-on-successful-ownership-replacement-only";
  renewalBehavior: "preserve";
  terminalTransitionBehavior: "no-successor";
  overflowBehavior: "reject-mutation";
}>;

export type MultiCutReplayPersistenceLeaseDurationPolicyV2 = Readonly<{
  policyVersion: "1.0";
  logicalType: "lease-duration-milliseconds-v1";
  canonicalUnit: "milliseconds";
  typescriptType: "finite-safe-integer-number";
  postgresqlType: "bigint";
  sqlBindingName: "lease_duration_milliseconds";
  minimumInclusive: 1;
  maximumInclusive: 86400000;
  zeroAllowed: false;
  negativeAllowed: false;
  fractionalAllowed: false;
  persistence: "not-persisted";
  serialization: "canonical-base-10-integer";
}>;

export type MultiCutReplayPersistenceDatabaseClockPolicyV2 = Readonly<{
  authority: "postgresql";
  expression: "transaction_timestamp()";
  outputType: "timestamp-with-time-zone";
  stability: "transaction-stable";
  applicationClockAllowed: false;
}>;

export type MultiCutReplayPersistenceStaleLeasePolicyV2 = Readonly<{
  comparisonOperator: "<=";
  staleExpression: "lease_expires_at <= transaction_timestamp()";
  renewableExpression: "lease_expires_at > transaction_timestamp()";
  expiryInstantIsStale: true;
  nullExpiryEligible: false;
  nonProcessingStateEligible: false;
}>;

export type MultiCutReplayPersistenceStatementIdV2 =
  | "resolve-new-reservation"
  | "resolve-existing-replay"
  | "lookup-authoritative-replay"
  | "renew-processing-reservation"
  | "complete-processing-replay"
  | "fail-processing-replay"
  | "release-processing-replay"
  | "takeover-stale-processing-replay";

export type MultiCutReplayPersistenceStatementBindingV2 = Readonly<{
  statementId: MultiCutReplayPersistenceStatementIdV2;
  inputBindings: readonly string[];
  returningBindings: readonly string[];
  transactionVisibility:
    | "read-consistent"
    | "atomic-mutation"
    | "workflow-completion-transaction";
  retryRule:
    | "authoritative-lookup-after-unknown-commit"
    | "reservation-reconciliation-after-unknown-commit"
    | "workflow-completion-recovery-after-unknown-commit"
    | "repeat-read";
}>;

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
  authoritySources: readonly [
    "replay-identity-authority-and-contract-versioning-adr-v1",
    "replay-concurrency-authority-and-generation-ownership-adr-v1",
    "replay-lease-and-attempt-persistence-policy-adr-v1",
  ];
  attemptPolicy: MultiCutReplayPersistenceAttemptPolicyV2;
  leaseDurationPolicy: MultiCutReplayPersistenceLeaseDurationPolicyV2;
  databaseClockPolicy: MultiCutReplayPersistenceDatabaseClockPolicyV2;
  staleLeasePolicy: MultiCutReplayPersistenceStaleLeasePolicyV2;
  postgresqlExpressions:
    readonly MultiCutReplayPersistencePostgresqlExpressionV2[];
  statementBindings:
    readonly MultiCutReplayPersistenceStatementBindingV2[];
  parameters: readonly MultiCutReplayPersistenceParameterMetadataV2[];
  readiness: Readonly<{
    sqlMayChooseAuthority: false;
    sqlMayChooseRetrySemantics: false;
    sqlMayChooseRevisionSemantics: false;
    sqlMayChooseFenceSemantics: false;
    sqlMayChooseAttemptSemantics: false;
    sqlMayChooseDurationSemantics: false;
    sqlMayChooseClockExpression: false;
    sqlMayChooseExpiryExpression: false;
    sqlMayChooseStaleBoundary: false;
    runtimeMayPredictDatabaseValues: false;
  }>;
}>;
