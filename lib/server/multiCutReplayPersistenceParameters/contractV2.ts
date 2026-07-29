import type {
  MultiCutReplayPersistenceParameterContractV2,
  MultiCutReplayPersistenceParameterMetadataV2,
} from "./types";

const parameter = (
  value: Omit<
    MultiCutReplayPersistenceParameterMetadataV2,
    "contractVersion"
  >,
): MultiCutReplayPersistenceParameterMetadataV2 =>
  Object.freeze({ contractVersion: "2.0", ...value });

const selectorBindings = Object.freeze([
  "physical_schema_version",
  "logical_schema_version",
  "identity_version",
  "scope_version",
  "replay_namespace",
  "tenant_identity_version",
  "protected_tenant_identity",
  "operation_identity",
  "key_identity",
]);

export const MULTI_CUT_REPLAY_PERSISTENCE_PARAMETER_CONTRACT_V2:
  MultiCutReplayPersistenceParameterContractV2 = Object.freeze({
  contractVersion: "2.0",
  authoritySource:
    "replay-concurrency-authority-and-generation-ownership-adr-v1",
  parameters: Object.freeze([
    parameter({
      name: "internal_record_id", valueType: "uuid", semanticMeaning: "internal non-business physical record identifier", requirement: "required", mutability: "immutable-within-logical-attempt", authority: "persistence-internal-identity", generationOwner: "persistence-generation-capability", validationOwner: "generation-capability-and-database-type", persistenceOwner: "postgresql", generationTiming: "before-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "internal_record_id", physicalBindings: ["internal_record_id"], sqlDirection: "input", lifecyclePhase: "resolution", statementConsumers: ["resolve-new-reservation"], generationInstruction: "consume-input", notes: "never an authoritative Replay selector",
    }),
    parameter({
      name: "replay_identity", valueType: "authoritative-replay-identity-v2", semanticMeaning: "version-pinned complete Protected Scope plus key identity", requirement: "required", mutability: "immutable", authority: "replay-identity-v2", generationOwner: "admission-runtime", validationOwner: "admission-and-adapter-projection", persistenceOwner: "postgresql", generationTiming: "admission", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "replay_identity", physicalBindings: selectorBindings, sqlDirection: "input", lifecyclePhase: "resolution", statementConsumers: ["all-eight-statements"], generationInstruction: "consume-input", notes: "complete selector; never inferred or partially bound",
    }),
    parameter({
      name: "fingerprint", valueType: "protected-fingerprint-identity", semanticMeaning: "request semantic compatibility identity", requirement: "required", mutability: "immutable", authority: "request-semantics", generationOwner: "admission-runtime", validationOwner: "admission-and-adapter-projection", persistenceOwner: "postgresql", generationTiming: "admission", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "request_fingerprint_identity", physicalBindings: ["request_fingerprint_identity"], sqlDirection: "input", lifecyclePhase: "resolution", statementConsumers: ["resolve-new-reservation", "resolve-existing-replay"], generationInstruction: "consume-input", notes: "compared only after authoritative selection",
    }),
    parameter({
      name: "reservation_identity", valueType: "protected-reservation-identity", semanticMeaning: "stable ownership intent for initial or released re-reservation", requirement: "required", mutability: "immutable-within-logical-attempt", authority: "ownership-intent", generationOwner: "persistence-generation-capability", validationOwner: "adapter-projection-and-postgresql", persistenceOwner: "postgresql", generationTiming: "before-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "reservation_identity", physicalBindings: ["reservation_identity"], sqlDirection: "input", lifecyclePhase: "resolution", statementConsumers: ["resolve-new-reservation", "resolve-existing-replay"], generationInstruction: "consume-input", notes: "replaced only by a new ownership generation",
    }),
    parameter({
      name: "lease_identity", valueType: "protected-lease-identity", semanticMeaning: "stable lease intent for the current ownership generation", requirement: "required", mutability: "immutable-within-logical-attempt", authority: "ownership-intent", generationOwner: "persistence-generation-capability", validationOwner: "adapter-projection-and-postgresql", persistenceOwner: "postgresql", generationTiming: "before-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "lease_identity", physicalBindings: ["lease_identity"], sqlDirection: "input", lifecyclePhase: "resolution", statementConsumers: ["resolve-new-reservation", "resolve-existing-replay", "renew-processing-reservation"], generationInstruction: "consume-input", notes: "renew preserves this identity",
    }),
    parameter({
      name: "lease_duration", valueType: "bounded-lease-duration", semanticMeaning: "versioned duration policy input, never an absolute timestamp", requirement: "required", mutability: "immutable-within-logical-attempt", authority: "persistence-lease-policy", generationOwner: "persistence-lease-policy-capability", validationOwner: "lease-policy-and-adapter-projection", persistenceOwner: "not-persisted", generationTiming: "before-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "lease_duration", physicalBindings: [], sqlDirection: "input", lifecyclePhase: "resolution", statementConsumers: ["resolve-new-reservation", "resolve-existing-replay", "renew-processing-reservation", "takeover-stale-processing-replay"], generationInstruction: "consume-input", notes: "PostgreSQL alone converts duration to authoritative expiry",
    }),
    parameter({
      name: "initial_revision", valueType: "opaque-decimal-revision", semanticMeaning: "first PostgreSQL-owned causal revision encoded as canonical decimal text 1", requirement: "required", mutability: "mutable-successor", authority: "persisted-concurrency-state", generationOwner: "postgresql", validationOwner: "postgresql-generation", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "generated-and-returned-by-statement", retryBehavior: "never-predict-reconcile-first", sqlBindingName: "initial_revision", physicalBindings: ["revision", "expected_revision"], sqlDirection: "returning", lifecyclePhase: "resolution", statementConsumers: ["resolve-new-reservation"], generationInstruction: "database-generate-per-adr", notes: "Runtime treats the value as opaque",
    }),
    parameter({
      name: "initial_fence", valueType: "opaque-decimal-fencing-token", semanticMeaning: "first PostgreSQL-owned ownership fence encoded as canonical decimal text 1", requirement: "required", mutability: "mutable-successor", authority: "persisted-concurrency-state", generationOwner: "postgresql", validationOwner: "postgresql-generation", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "generated-and-returned-by-statement", retryBehavior: "never-predict-reconcile-first", sqlBindingName: "initial_fence", physicalBindings: ["fencing_token"], sqlDirection: "returning", lifecyclePhase: "resolution", statementConsumers: ["resolve-new-reservation"], generationInstruction: "database-generate-per-adr", notes: "independent from revision",
    }),
    parameter({
      name: "initial_lease_expiry", valueType: "timestamp-with-time-zone", semanticMeaning: "authoritative initial expiry calculated from PostgreSQL clock and duration", requirement: "required", mutability: "mutable-successor", authority: "postgresql-clock", generationOwner: "postgresql", validationOwner: "postgresql-generation", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "generated-and-returned-by-statement", retryBehavior: "never-predict-reconcile-first", sqlBindingName: "initial_lease_expiry", physicalBindings: ["lease_expires_at"], sqlDirection: "returning", lifecyclePhase: "resolution", statementConsumers: ["resolve-new-reservation"], generationInstruction: "database-generate-per-adr", notes: "application clock is prohibited",
    }),
    parameter({
      name: "initial_reservation_attempt", valueType: "integer", semanticMeaning: "initial PostgreSQL-owned ownership generation counter", requirement: "required", mutability: "mutable-successor", authority: "persisted-concurrency-state", generationOwner: "postgresql", validationOwner: "postgresql-generation", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "generated-and-returned-by-statement", retryBehavior: "never-predict-reconcile-first", sqlBindingName: "initial_reservation_attempt", physicalBindings: ["reservation_attempt"], sqlDirection: "returning", lifecyclePhase: "resolution", statementConsumers: ["resolve-new-reservation"], generationInstruction: "database-generate-per-adr", notes: "first ownership generation; not caller supplied",
    }),
    parameter({
      name: "expected_revision", valueType: "opaque-decimal-revision", semanticMeaning: "authoritative CAS precondition from prior evidence", requirement: "required", mutability: "immutable-within-logical-attempt", authority: "persisted-concurrency-state", generationOwner: "postgresql", validationOwner: "postgresql-predicate", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "expected_revision", physicalBindings: ["revision"], sqlDirection: "input", lifecyclePhase: "lifecycle", statementConsumers: ["renew-processing-reservation", "complete-processing-replay", "fail-processing-replay", "release-processing-replay"], generationInstruction: "consume-input", notes: "generated by an earlier successful database mutation",
    }),
    parameter({
      name: "expected_ownership_evidence", valueType: "authoritative-reconciliation-evidence", semanticMeaning: "prior reservation, lease, and attempt evidence used as a mutation precondition", requirement: "required", mutability: "immutable-within-logical-attempt", authority: "persisted-concurrency-state", generationOwner: "postgresql", validationOwner: "postgresql-predicate", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "expected_ownership_evidence", physicalBindings: ["reservation_identity", "lease_identity", "reservation_attempt"], sqlDirection: "input", lifecyclePhase: "lifecycle", statementConsumers: ["renew-processing-reservation", "complete-processing-replay", "fail-processing-replay", "release-processing-replay", "takeover-stale-processing-replay"], generationInstruction: "consume-input", notes: "forwarded from prior authoritative evidence without regeneration",
    }),
    parameter({
      name: "next_revision", valueType: "opaque-decimal-revision", semanticMeaning: "canonical decimal successor generated by a successful mutation", requirement: "required", mutability: "mutable-successor", authority: "persisted-concurrency-state", generationOwner: "postgresql", validationOwner: "postgresql-generation", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "generated-and-returned-by-statement", retryBehavior: "never-predict-reconcile-first", sqlBindingName: "next_revision", physicalBindings: ["revision", "expected_revision"], sqlDirection: "returning", lifecyclePhase: "lifecycle", statementConsumers: ["renew-processing-reservation", "complete-processing-replay", "fail-processing-replay", "release-processing-replay"], generationInstruction: "database-generate-per-adr", notes: "SQL applies the ADR rule but does not define it",
    }),
    parameter({
      name: "expected_fence", valueType: "opaque-decimal-fencing-token", semanticMeaning: "current ownership fence mutation precondition", requirement: "required", mutability: "immutable-within-logical-attempt", authority: "persisted-concurrency-state", generationOwner: "postgresql", validationOwner: "postgresql-predicate", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "expected_fence", physicalBindings: ["fencing_token"], sqlDirection: "input", lifecyclePhase: "lifecycle", statementConsumers: ["renew-processing-reservation", "complete-processing-replay", "fail-processing-replay", "release-processing-replay"], generationInstruction: "consume-input", notes: "renew and terminal transitions never rotate it",
    }),
    parameter({
      name: "renewed_lease_expiry", valueType: "timestamp-with-time-zone", semanticMeaning: "authoritative expiry from PostgreSQL clock during renew", requirement: "required", mutability: "mutable-successor", authority: "postgresql-clock", generationOwner: "postgresql", validationOwner: "postgresql-generation", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "generated-and-returned-by-statement", retryBehavior: "never-predict-reconcile-first", sqlBindingName: "renewed_lease_expiry", physicalBindings: ["lease_expires_at"], sqlDirection: "returning", lifecyclePhase: "lifecycle", statementConsumers: ["renew-processing-reservation"], generationInstruction: "database-generate-per-adr", notes: "same transaction clock observation as mutation",
    }),
    parameter({
      name: "takeover_expected_revision", valueType: "opaque-decimal-revision", semanticMeaning: "previous authoritative revision compared during takeover", requirement: "required", mutability: "immutable-within-logical-attempt", authority: "persisted-concurrency-state", generationOwner: "postgresql", validationOwner: "postgresql-predicate", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "takeover_expected_revision", physicalBindings: ["revision"], sqlDirection: "input", lifecyclePhase: "recovery", statementConsumers: ["takeover-stale-processing-replay"], generationInstruction: "consume-input", notes: "retained until reconciliation",
    }),
    parameter({
      name: "takeover_next_revision", valueType: "opaque-decimal-revision", semanticMeaning: "canonical decimal revision successor after takeover", requirement: "required", mutability: "mutable-successor", authority: "persisted-concurrency-state", generationOwner: "postgresql", validationOwner: "postgresql-generation", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "generated-and-returned-by-statement", retryBehavior: "never-predict-reconcile-first", sqlBindingName: "takeover_next_revision", physicalBindings: ["revision", "expected_revision"], sqlDirection: "returning", lifecyclePhase: "recovery", statementConsumers: ["takeover-stale-processing-replay"], generationInstruction: "database-generate-per-adr", notes: "not predicted by Recovery",
    }),
    parameter({
      name: "takeover_expected_fence", valueType: "opaque-decimal-fencing-token", semanticMeaning: "previous ownership fence compared during takeover", requirement: "required", mutability: "immutable-within-logical-attempt", authority: "persisted-concurrency-state", generationOwner: "postgresql", validationOwner: "postgresql-predicate", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "takeover_expected_fence", physicalBindings: ["fencing_token"], sqlDirection: "input", lifecyclePhase: "recovery", statementConsumers: ["takeover-stale-processing-replay"], generationInstruction: "consume-input", notes: "stale owner rejection precondition",
    }),
    parameter({
      name: "takeover_next_fence", valueType: "opaque-decimal-fencing-token", semanticMeaning: "canonical decimal ownership epoch successor", requirement: "required", mutability: "mutable-successor", authority: "persisted-concurrency-state", generationOwner: "postgresql", validationOwner: "postgresql-generation", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "generated-and-returned-by-statement", retryBehavior: "never-predict-reconcile-first", sqlBindingName: "takeover_next_fence", physicalBindings: ["fencing_token"], sqlDirection: "returning", lifecyclePhase: "recovery", statementConsumers: ["takeover-stale-processing-replay"], generationInstruction: "database-generate-per-adr", notes: "independent from revision",
    }),
    parameter({
      name: "takeover_reservation_identity", valueType: "protected-reservation-identity", semanticMeaning: "stable requested reservation intent for takeover", requirement: "required", mutability: "immutable-within-logical-attempt", authority: "ownership-intent", generationOwner: "persistence-generation-capability", validationOwner: "adapter-projection-and-postgresql", persistenceOwner: "postgresql", generationTiming: "before-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "takeover_reservation_identity", physicalBindings: ["reservation_identity"], sqlDirection: "input", lifecyclePhase: "recovery", statementConsumers: ["takeover-stale-processing-replay"], generationInstruction: "consume-input", notes: "retained through commit-unknown reconciliation",
    }),
    parameter({
      name: "takeover_lease_identity", valueType: "protected-lease-identity", semanticMeaning: "stable requested lease intent for takeover", requirement: "required", mutability: "immutable-within-logical-attempt", authority: "ownership-intent", generationOwner: "persistence-generation-capability", validationOwner: "adapter-projection-and-postgresql", persistenceOwner: "postgresql", generationTiming: "before-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "takeover_lease_identity", physicalBindings: ["lease_identity"], sqlDirection: "input", lifecyclePhase: "recovery", statementConsumers: ["takeover-stale-processing-replay"], generationInstruction: "consume-input", notes: "retained through commit-unknown reconciliation",
    }),
    parameter({
      name: "takeover_lease_expiry", valueType: "timestamp-with-time-zone", semanticMeaning: "authoritative takeover expiry calculated from PostgreSQL clock", requirement: "required", mutability: "mutable-successor", authority: "postgresql-clock", generationOwner: "postgresql", validationOwner: "postgresql-generation", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "generated-and-returned-by-statement", retryBehavior: "never-predict-reconcile-first", sqlBindingName: "takeover_lease_expiry", physicalBindings: ["lease_expires_at"], sqlDirection: "returning", lifecyclePhase: "recovery", statementConsumers: ["takeover-stale-processing-replay"], generationInstruction: "database-generate-per-adr", notes: "application clock is prohibited",
    }),
    parameter({
      name: "takeover_reservation_attempt", valueType: "integer", semanticMeaning: "PostgreSQL-owned ownership generation successor after takeover", requirement: "required", mutability: "mutable-successor", authority: "persisted-concurrency-state", generationOwner: "postgresql", validationOwner: "postgresql-generation", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "generated-and-returned-by-statement", retryBehavior: "never-predict-reconcile-first", sqlBindingName: "takeover_reservation_attempt", physicalBindings: ["reservation_attempt"], sqlDirection: "returning", lifecyclePhase: "recovery", statementConsumers: ["takeover-stale-processing-replay"], generationInstruction: "database-generate-per-adr", notes: "advanced atomically with ownership replacement",
    }),
    parameter({
      name: "reconciliation_evidence", valueType: "authoritative-reconciliation-evidence", semanticMeaning: "read-only projection of current persisted state and concurrency evidence", requirement: "conditional", mutability: "read-only-projection", authority: "authoritative-persisted-observation", generationOwner: "none-authoritative-projection", validationOwner: "recovery-projection", persistenceOwner: "postgresql", generationTiming: "authoritative-read", transactionVisibility: "returned-by-authoritative-read", retryBehavior: "repeat-authoritative-read", sqlBindingName: "reconciliation_evidence", physicalBindings: ["state", "revision", "reservation_identity", "fencing_token", "lease_identity", "lease_expires_at", "reservation_attempt"], sqlDirection: "output", lifecyclePhase: "reconciliation", statementConsumers: ["lookup-authoritative-replay"], generationInstruction: "project-authoritative-row", notes: "reconciliation creates no new authority",
    }),
  ]),
  readiness: Object.freeze({
    sqlMayChooseAuthority: false,
    sqlMayChooseRetrySemantics: false,
    sqlMayChooseRevisionSemantics: false,
    sqlMayChooseFenceSemantics: false,
    runtimeMayPredictDatabaseValues: false,
  }),
});
