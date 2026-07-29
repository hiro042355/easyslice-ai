import type {
  MultiCutReplayPersistenceParameterContractV2,
  MultiCutReplayPersistenceParameterMetadataV2,
  MultiCutReplayPersistencePostgresqlExpressionV2,
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

const leaseExpiryExpression =
  "transaction_timestamp() + ($lease_duration_milliseconds::bigint * INTERVAL '1 millisecond')";

const postgresqlExpressions: readonly MultiCutReplayPersistencePostgresqlExpressionV2[] =
  Object.freeze([
    Object.freeze({
      name: "initial-reservation-attempt",
      expression: "1::integer",
      requiredBindings: Object.freeze([]),
      outputType: "integer",
      transactionStability: "atomic-mutation",
      retryBehavior: "observe-after-unknown-commit",
    }),
    Object.freeze({
      name: "takeover-reservation-attempt",
      expression: "(reservation_attempt::bigint + 1)::integer",
      requiredBindings: Object.freeze(["expected_reservation_attempt"]),
      outputType: "integer",
      transactionStability: "atomic-mutation",
      retryBehavior: "retain-expectation-and-reconcile",
    }),
    Object.freeze({
      name: "authoritative-current-time",
      expression: "transaction_timestamp()",
      requiredBindings: Object.freeze([]),
      outputType: "timestamp-with-time-zone",
      transactionStability: "transaction-stable",
      retryBehavior: "observe-after-unknown-commit",
    }),
    ...(["initial", "renewal", "takeover"] as const).map((phase) =>
      Object.freeze({
        name: `${phase}-lease-expiry`,
        expression: leaseExpiryExpression,
        requiredBindings: Object.freeze(["lease_duration_milliseconds"]),
        outputType: "timestamp-with-time-zone",
        transactionStability: "transaction-stable",
        retryBehavior: "reuse-input-until-reconciliation",
      } as const),
    ),
    Object.freeze({
      name: "stale-lease-comparison",
      expression: "lease_expires_at <= transaction_timestamp()",
      requiredBindings: Object.freeze([]),
      outputType: "boolean",
      transactionStability: "transaction-stable",
      retryBehavior: "zero-row-requires-authoritative-resolution",
    }),
    Object.freeze({
      name: "renewable-lease-comparison",
      expression: "lease_expires_at > transaction_timestamp()",
      requiredBindings: Object.freeze([]),
      outputType: "boolean",
      transactionStability: "transaction-stable",
      retryBehavior: "zero-row-requires-authoritative-resolution",
    }),
    Object.freeze({
      name: "terminal-timestamp",
      expression: "$terminal_at::timestamptz",
      requiredBindings: Object.freeze(["terminal_at"]),
      outputType: "timestamp-with-time-zone",
      transactionStability: "stable-input",
      retryBehavior: "reuse-input-until-reconciliation",
    }),
  ]);

export const MULTI_CUT_REPLAY_PERSISTENCE_PARAMETER_CONTRACT_V2:
  MultiCutReplayPersistenceParameterContractV2 = Object.freeze({
  contractVersion: "2.0",
  authoritySources: Object.freeze([
    "replay-identity-authority-and-contract-versioning-adr-v1",
    "replay-concurrency-authority-and-generation-ownership-adr-v1",
    "replay-lease-and-attempt-persistence-policy-adr-v1",
  ] as const),
  attemptPolicy: Object.freeze({
    initialValue: 1,
    postgresqlType: "integer",
    minimum: 1,
    maximum: 2147483647,
    progression: "advance-by-one-on-successful-ownership-replacement-only",
    renewalBehavior: "preserve",
    terminalTransitionBehavior: "no-successor",
    overflowBehavior: "reject-mutation",
  }),
  leaseDurationPolicy: Object.freeze({
    policyVersion: "1.0",
    logicalType: "lease-duration-milliseconds-v1",
    canonicalUnit: "milliseconds",
    typescriptType: "finite-safe-integer-number",
    postgresqlType: "bigint",
    sqlBindingName: "lease_duration_milliseconds",
    minimumInclusive: 1,
    maximumInclusive: 86400000,
    zeroAllowed: false,
    negativeAllowed: false,
    fractionalAllowed: false,
    persistence: "not-persisted",
    serialization: "canonical-base-10-integer",
  }),
  databaseClockPolicy: Object.freeze({
    authority: "postgresql",
    expression: "transaction_timestamp()",
    outputType: "timestamp-with-time-zone",
    stability: "transaction-stable",
    applicationClockAllowed: false,
  }),
  staleLeasePolicy: Object.freeze({
    comparisonOperator: "<=",
    staleExpression: "lease_expires_at <= transaction_timestamp()",
    renewableExpression: "lease_expires_at > transaction_timestamp()",
    expiryInstantIsStale: true,
    nullExpiryEligible: false,
    nonProcessingStateEligible: false,
  }),
  postgresqlExpressions,
  statementBindings: Object.freeze([
    Object.freeze({
      statementId: "resolve-new-reservation",
      inputBindings: Object.freeze(["internal_record_id", "replay_identity", "request_fingerprint_identity", "reservation_identity", "lease_identity", "lease_duration_milliseconds"]),
      returningBindings: Object.freeze(["initial_revision", "initial_fence", "initial_lease_expiry", "initial_reservation_attempt"]),
      transactionVisibility: "atomic-mutation",
      retryRule: "authoritative-lookup-after-unknown-commit",
    }),
    Object.freeze({
      statementId: "resolve-existing-replay",
      inputBindings: Object.freeze(["replay_identity", "request_fingerprint_identity", "reservation_identity", "lease_identity", "lease_duration_milliseconds"]),
      returningBindings: Object.freeze(["reconciliation_evidence"]),
      transactionVisibility: "atomic-mutation",
      retryRule: "authoritative-lookup-after-unknown-commit",
    }),
    Object.freeze({
      statementId: "lookup-authoritative-replay",
      inputBindings: Object.freeze(["replay_identity"]),
      returningBindings: Object.freeze(["reconciliation_evidence"]),
      transactionVisibility: "read-consistent",
      retryRule: "repeat-read",
    }),
    Object.freeze({
      statementId: "renew-processing-reservation",
      inputBindings: Object.freeze(["replay_identity", "expected_revision", "expected_ownership_evidence", "expected_fence", "lease_duration_milliseconds"]),
      returningBindings: Object.freeze(["next_revision", "expected_ownership_evidence", "expected_fence", "renewed_lease_expiry"]),
      transactionVisibility: "atomic-mutation",
      retryRule: "reservation-reconciliation-after-unknown-commit",
    }),
    Object.freeze({
      statementId: "complete-processing-replay",
      inputBindings: Object.freeze(["replay_identity", "expected_revision", "expected_ownership_evidence", "expected_fence", "result_reference_version", "result_reference_identity", "terminal_metadata_version", "terminal_at", "terminal_classification"]),
      returningBindings: Object.freeze(["next_revision", "result_reference_version", "result_reference_identity", "terminal_metadata_version", "terminal_at", "terminal_classification"]),
      transactionVisibility: "workflow-completion-transaction",
      retryRule: "workflow-completion-recovery-after-unknown-commit",
    }),
    ...(["fail", "release"] as const).map((transition) =>
      Object.freeze({
        statementId: `${transition}-processing-replay`,
        inputBindings: Object.freeze(["replay_identity", "expected_revision", "expected_ownership_evidence", "expected_fence", "terminal_metadata_version", "terminal_at", "terminal_classification"]),
        returningBindings: Object.freeze(["next_revision", "terminal_metadata_version", "terminal_at", "terminal_classification"]),
        transactionVisibility: "atomic-mutation",
        retryRule: "authoritative-lookup-after-unknown-commit",
      } as const),
    ),
    Object.freeze({
      statementId: "takeover-stale-processing-replay",
      inputBindings: Object.freeze(["replay_identity", "takeover_expected_revision", "expected_ownership_evidence", "takeover_expected_fence", "takeover_reservation_identity", "takeover_lease_identity", "lease_duration_milliseconds"]),
      returningBindings: Object.freeze(["takeover_next_revision", "takeover_next_fence", "takeover_reservation_identity", "takeover_lease_identity", "takeover_lease_expiry", "takeover_reservation_attempt"]),
      transactionVisibility: "atomic-mutation",
      retryRule: "reservation-reconciliation-after-unknown-commit",
    }),
  ]),
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
      name: "lease_duration", valueType: "bounded-lease-duration", semanticMeaning: "versioned integer-millisecond duration policy input, never an absolute timestamp", requirement: "required", mutability: "immutable-within-logical-attempt", authority: "persistence-lease-policy", generationOwner: "persistence-lease-policy-capability", validationOwner: "lease-policy-and-adapter-projection", persistenceOwner: "not-persisted", generationTiming: "before-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "lease_duration_milliseconds", physicalBindings: [], sqlDirection: "input", lifecyclePhase: "resolution", statementConsumers: ["resolve-new-reservation", "resolve-existing-replay", "renew-processing-reservation", "takeover-stale-processing-replay"], generationInstruction: "consume-input", notes: "finite safe integer 1..86400000; PostgreSQL bigint; not persisted",
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
      name: "initial_reservation_attempt", valueType: "integer", semanticMeaning: "one-based ordinal of successful processing ownership acquisition", requirement: "required", mutability: "mutable-successor", authority: "persisted-concurrency-state", generationOwner: "postgresql", validationOwner: "postgresql-generation", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "generated-and-returned-by-statement", retryBehavior: "never-predict-reconcile-first", sqlBindingName: "initial_reservation_attempt", physicalBindings: ["reservation_attempt"], sqlDirection: "returning", lifecyclePhase: "resolution", statementConsumers: ["resolve-new-reservation"], generationInstruction: "database-generate-per-adr", notes: "exact expression 1::integer; not caller supplied",
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
      name: "renewed_lease_expiry", valueType: "timestamp-with-time-zone", semanticMeaning: "authoritative expiry from PostgreSQL transaction clock during renew", requirement: "required", mutability: "mutable-successor", authority: "postgresql-clock", generationOwner: "postgresql", validationOwner: "postgresql-generation", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "generated-and-returned-by-statement", retryBehavior: "never-predict-reconcile-first", sqlBindingName: "renewed_lease_expiry", physicalBindings: ["lease_expires_at"], sqlDirection: "returning", lifecyclePhase: "lifecycle", statementConsumers: ["renew-processing-reservation"], generationInstruction: "database-generate-per-adr", notes: "calculated from transaction_timestamp(), never from prior expiry",
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
      name: "takeover_reservation_attempt", valueType: "integer", semanticMeaning: "PostgreSQL-owned one-step ownership acquisition successor", requirement: "required", mutability: "mutable-successor", authority: "persisted-concurrency-state", generationOwner: "postgresql", validationOwner: "postgresql-generation", persistenceOwner: "postgresql", generationTiming: "within-statement", transactionVisibility: "generated-and-returned-by-statement", retryBehavior: "never-predict-reconcile-first", sqlBindingName: "takeover_reservation_attempt", physicalBindings: ["reservation_attempt"], sqlDirection: "returning", lifecyclePhase: "recovery", statementConsumers: ["takeover-stale-processing-replay"], generationInstruction: "database-generate-per-adr", notes: "exact expression (reservation_attempt::bigint + 1)::integer; overflow rejects mutation",
    }),
    parameter({
      name: "result_reference_version", valueType: "text", semanticMeaning: "version of the completed Replay result linkage", requirement: "required", mutability: "immutable", authority: "result-reference-boundary", generationOwner: "result-reference-capability", validationOwner: "completion-boundary-and-adapter-projection", persistenceOwner: "postgresql", generationTiming: "before-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "result_reference_version", physicalBindings: ["result_reference_version"], sqlDirection: "input", lifecyclePhase: "lifecycle", statementConsumers: ["complete-processing-replay"], generationInstruction: "consume-input", notes: "returned as the persisted completed-result projection",
    }),
    parameter({
      name: "result_reference_identity", valueType: "text", semanticMeaning: "opaque completed Replay result reference identity", requirement: "required", mutability: "immutable", authority: "result-reference-boundary", generationOwner: "result-reference-capability", validationOwner: "completion-boundary-and-adapter-projection", persistenceOwner: "postgresql", generationTiming: "before-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "result_reference_identity", physicalBindings: ["result_reference_identity"], sqlDirection: "input", lifecyclePhase: "lifecycle", statementConsumers: ["complete-processing-replay"], generationInstruction: "consume-input", notes: "returned as the persisted completed-result projection",
    }),
    parameter({
      name: "terminal_metadata_version", valueType: "text", semanticMeaning: "Lifecycle V4 terminal metadata version", requirement: "required", mutability: "immutable", authority: "lifecycle-terminal-metadata", generationOwner: "lifecycle-input-owner", validationOwner: "lifecycle-validation-and-adapter-projection", persistenceOwner: "postgresql", generationTiming: "before-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "terminal_metadata_version", physicalBindings: ["terminal_metadata_version"], sqlDirection: "input", lifecyclePhase: "lifecycle", statementConsumers: ["complete-processing-replay", "fail-processing-replay", "release-processing-replay"], generationInstruction: "consume-input", notes: "returned from the persisted terminal projection",
    }),
    parameter({
      name: "terminal_timestamp", valueType: "timestamp-with-time-zone", semanticMeaning: "Lifecycle-owned completedAt, failedAt, or releasedAt timestamp", requirement: "required", mutability: "immutable", authority: "lifecycle-terminal-metadata", generationOwner: "lifecycle-input-owner", validationOwner: "lifecycle-validation-and-adapter-projection", persistenceOwner: "postgresql", generationTiming: "before-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "terminal_at", physicalBindings: ["terminal_at"], sqlDirection: "input", lifecyclePhase: "lifecycle", statementConsumers: ["complete-processing-replay", "fail-processing-replay", "release-processing-replay"], generationInstruction: "consume-input", notes: "exact expression $terminal_at::timestamptz; returned after mutation",
    }),
    parameter({
      name: "terminal_classification", valueType: "text", semanticMeaning: "safe Lifecycle V4 terminal classification", requirement: "required", mutability: "immutable", authority: "lifecycle-terminal-metadata", generationOwner: "lifecycle-input-owner", validationOwner: "lifecycle-validation-and-adapter-projection", persistenceOwner: "postgresql", generationTiming: "before-statement", transactionVisibility: "known-before-statement", retryBehavior: "reuse-for-logical-attempt", sqlBindingName: "terminal_classification", physicalBindings: ["terminal_classification"], sqlDirection: "input", lifecyclePhase: "lifecycle", statementConsumers: ["complete-processing-replay", "fail-processing-replay", "release-processing-replay"], generationInstruction: "consume-input", notes: "returned from the persisted terminal projection",
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
    sqlMayChooseAttemptSemantics: false,
    sqlMayChooseDurationSemantics: false,
    sqlMayChooseClockExpression: false,
    sqlMayChooseExpiryExpression: false,
    sqlMayChooseStaleBoundary: false,
    runtimeMayPredictDatabaseValues: false,
  }),
});
