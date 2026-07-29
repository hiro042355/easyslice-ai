import type {
  MultiCutReplayLogicalRecordV2,
} from "../multiCutReplayLogicalSchema/typesV2";

export type MultiCutReplayPhysicalSchemaV2 = Readonly<{
  physicalSchemaVersion: "2.0";
  table: {
    name: "multi_cut_replay_records_v2";
    primaryKeyStrategy: "internal-uuid";
    columns: readonly MultiCutReplayPhysicalColumnV2[];
  };
  authoritativeUniqueConstraint: MultiCutReplayPhysicalConstraintV2;
  constraints: readonly MultiCutReplayPhysicalConstraintV2[];
  indexes: readonly MultiCutReplayPhysicalIndexV2[];
  relationships: readonly MultiCutReplayPhysicalRelationshipV2[];
  persistentConcurrencyContinuity:
    MultiCutReplayPhysicalPersistentConcurrencyContinuityV2;
  physicalInvariants: readonly string[];
  responsibilities: {
    database: readonly string[];
    runtimeOrStatement: readonly string[];
  };
}>;

export type MultiCutReplayPhysicalLogicalModelV2 =
  MultiCutReplayLogicalRecordV2;

export type MultiCutReplayPhysicalColumnV2 = Readonly<{
  name: string;
  type: "uuid" | "text" | "integer" | "timestamp-with-time-zone";
  nullable: boolean;
  default: "none";
  mutable: boolean;
  logicalSource: string;
}>;

export type MultiCutReplayPhysicalConstraintV2 = Readonly<{
  name: string;
  kind: "primary-key" | "unique" | "check";
  columns: readonly string[];
  invariant: string;
}>;

export type MultiCutReplayPhysicalIndexV2 = Readonly<{
  name: string;
  columns: readonly string[];
  unique: boolean;
  purpose: string;
  supportedOperations: readonly string[];
  authoritativeIdentity: boolean;
  whyRequired: string;
  whyNotAuthoritative: string;
}>;

export type MultiCutReplayPhysicalRelationshipV2 = Readonly<{
  name: string;
  localColumns: readonly string[];
  referencedTable: string;
  referencedColumns: readonly string[];
  purpose: string;
}>;

export type MultiCutReplayPhysicalPersistentConcurrencyFieldV2 = Readonly<{
  name: "revision" | "last_fencing_token" | "last_reservation_attempt";
  type: "text" | "integer";
  nullable: false;
  defaultPolicy: "none";
  persistenceSemantics: "lifecycle-persistent";
  lifecycle: "processing-and-terminal";
  owner: "replay-record";
  generationAuthority: "postgresql-only";
  mutationAuthority: "successful-authoritative-mutation-only";
  terminalSemantics: "retained";
  retrySemantics: "never-predict-reconcile-first";
  reconciliationSemantics: "compare-authoritative-persisted-value";
  migrationClassification: Readonly<{
    backfillable: boolean;
    derived: boolean;
    requiresRuntime: false;
    requiresQuarantine: boolean;
    impossibleToReconstruct: boolean;
    scope:
      | "existing-field-no-new-backfill"
      | "processing-from-active-evidence-terminal-from-authority";
  }>;
}>;

export type MultiCutReplayPhysicalPersistentConcurrencyContinuityV2 =
  Readonly<{
    continuityVersion: "1.0";
    columnOrdering: readonly [
      "revision",
      "last_fencing_token",
      "last_reservation_attempt",
    ];
    fields: readonly MultiCutReplayPhysicalPersistentConcurrencyFieldV2[];
    activeProcessingEvidenceStartsAfter: "last_reservation_attempt";
    relationship: Readonly<{
      replayIdentityOwnsContinuity: true;
      continuityIsActiveProcessingEvidence: false;
      activeProcessingEvidenceIsTerminalPersistent: false;
    }>;
    terminalRowMigration: Readonly<{
      existingTerminalRowsAreDirectlyBackfillable: false;
      authoritativeSourceRequired: true;
      guessedValuesPermitted: false;
      nullToZeroPermitted: false;
      unresolvedRows: "quarantine-from-re-reservation";
      impossibleToReconstructWithoutAuthority: true;
    }>;
  }>;

const identityColumns = [
  "physical_schema_version",
  "logical_schema_version",
  "identity_version",
  "scope_version",
  "replay_namespace",
  "tenant_identity_version",
  "protected_tenant_identity",
  "operation_identity",
  "key_identity",
] as const;

export const MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2:
  MultiCutReplayPhysicalSchemaV2 = Object.freeze({
  physicalSchemaVersion: "2.0",
  table: Object.freeze({
    name: "multi_cut_replay_records_v2",
    primaryKeyStrategy: "internal-uuid",
    columns: Object.freeze([
      { name: "internal_record_id", type: "uuid", nullable: false, default: "none", mutable: false, logicalSource: "internal-only" },
      { name: "physical_schema_version", type: "text", nullable: false, default: "none", mutable: false, logicalSource: "physical-schema-boundary" },
      { name: "logical_schema_version", type: "text", nullable: false, default: "none", mutable: false, logicalSource: "logicalSchemaVersion" },
      { name: "identity_version", type: "text", nullable: false, default: "none", mutable: false, logicalSource: "recordIdentity.identityVersion" },
      { name: "scope_version", type: "text", nullable: false, default: "none", mutable: false, logicalSource: "recordIdentity.protectedScope.scopeVersion" },
      { name: "replay_namespace", type: "text", nullable: false, default: "none", mutable: false, logicalSource: "recordIdentity.protectedScope.replayNamespace" },
      { name: "tenant_identity_version", type: "text", nullable: false, default: "none", mutable: false, logicalSource: "recordIdentity.protectedScope.tenant.identityVersion" },
      { name: "protected_tenant_identity", type: "text", nullable: false, default: "none", mutable: false, logicalSource: "recordIdentity.protectedScope.tenant.protectedTenantIdentity" },
      { name: "operation_identity", type: "text", nullable: false, default: "none", mutable: false, logicalSource: "recordIdentity.protectedScope.operationIdentity" },
      { name: "key_identity", type: "text", nullable: false, default: "none", mutable: false, logicalSource: "recordIdentity.keyIdentity" },
      { name: "request_fingerprint_identity", type: "text", nullable: false, default: "none", mutable: false, logicalSource: "requestSemantics.requestFingerprintIdentity" },
      { name: "state", type: "text", nullable: false, default: "none", mutable: true, logicalSource: "state" },
      { name: "revision", type: "text", nullable: false, default: "none", mutable: true, logicalSource: "persistentConcurrencyContinuity.revision" },
      { name: "last_fencing_token", type: "text", nullable: false, default: "none", mutable: true, logicalSource: "persistentConcurrencyContinuity.lastFencingToken" },
      { name: "last_reservation_attempt", type: "integer", nullable: false, default: "none", mutable: true, logicalSource: "persistentConcurrencyContinuity.lastReservationAttempt" },
      { name: "reservation_evidence_version", type: "text", nullable: true, default: "none", mutable: true, logicalSource: "reservationEvidence.evidenceVersion" },
      { name: "reservation_version", type: "text", nullable: true, default: "none", mutable: true, logicalSource: "reservationEvidence.reservation.reservationVersion" },
      { name: "reservation_identity", type: "text", nullable: true, default: "none", mutable: true, logicalSource: "reservationEvidence.reservation.reservationIdentity" },
      { name: "expected_revision_version", type: "text", nullable: true, default: "none", mutable: true, logicalSource: "reservationEvidence.expectedRevision.revisionVersion" },
      { name: "expected_revision", type: "text", nullable: true, default: "none", mutable: true, logicalSource: "reservationEvidence.expectedRevision.expectedRevision" },
      { name: "fencing_version", type: "text", nullable: true, default: "none", mutable: true, logicalSource: "reservationEvidence.fencing.fencingVersion" },
      { name: "fencing_token", type: "text", nullable: true, default: "none", mutable: true, logicalSource: "reservationEvidence.fencing.fencingToken" },
      { name: "lease_version", type: "text", nullable: true, default: "none", mutable: true, logicalSource: "reservationEvidence.lease.leaseVersion" },
      { name: "lease_identity", type: "text", nullable: true, default: "none", mutable: true, logicalSource: "reservationEvidence.lease.leaseIdentity" },
      { name: "lease_expires_at", type: "timestamp-with-time-zone", nullable: true, default: "none", mutable: true, logicalSource: "reservationEvidence.leaseExpiresAt" },
      { name: "reservation_attempt", type: "integer", nullable: true, default: "none", mutable: true, logicalSource: "reservationEvidence.reservationAttempt" },
      { name: "result_reference_version", type: "text", nullable: true, default: "none", mutable: true, logicalSource: "resultReference.referenceVersion" },
      { name: "result_reference_identity", type: "text", nullable: true, default: "none", mutable: true, logicalSource: "resultReference.resultReferenceIdentity" },
      { name: "terminal_metadata_version", type: "text", nullable: true, default: "none", mutable: true, logicalSource: "metadata.metadataVersion" },
      { name: "terminal_at", type: "timestamp-with-time-zone", nullable: true, default: "none", mutable: true, logicalSource: "metadata completedAt|failedAt|releasedAt" },
      { name: "terminal_classification", type: "text", nullable: true, default: "none", mutable: true, logicalSource: "metadata classification" },
    ] as const),
  }),
  authoritativeUniqueConstraint: Object.freeze({
    name: "uq_multi_cut_replay_v2_authority",
    kind: "unique",
    columns: identityColumns,
    invariant: "one record per complete protected scope and key identity",
  }),
  constraints: Object.freeze([
    { name: "pk_multi_cut_replay_v2_internal", kind: "primary-key", columns: ["internal_record_id"], invariant: "internal identity only; never a replay authority" },
    { name: "ck_multi_cut_replay_v2_schema", kind: "check", columns: ["physical_schema_version", "logical_schema_version", "identity_version"], invariant: "physical, logical, and identity versions are exactly 2.0" },
    { name: "ck_multi_cut_replay_v2_state", kind: "check", columns: ["state"], invariant: "processing, completed, failed, or released only" },
    { name: "ck_multi_cut_replay_v2_identity_complete", kind: "check", columns: identityColumns, invariant: "all authoritative identity components are present and non-empty" },
    { name: "ck_multi_cut_replay_v2_fingerprint", kind: "check", columns: ["request_fingerprint_identity"], invariant: "semantic fingerprint is present but is not a selector" },
    { name: "ck_multi_cut_replay_v2_continuity", kind: "check", columns: ["state", "revision", "last_fencing_token", "last_reservation_attempt"], invariant: "persistent concurrency continuity remains present and monotonic in processing and terminal states" },
    { name: "ck_multi_cut_replay_v2_processing", kind: "check", columns: ["state", "last_fencing_token", "last_reservation_attempt", "reservation_evidence_version", "reservation_version", "reservation_identity", "expected_revision_version", "expected_revision", "fencing_version", "fencing_token", "lease_version", "lease_identity", "lease_expires_at", "reservation_attempt"], invariant: "processing has complete versioned active ownership and lease evidence whose fence and attempt equal persistent continuity; terminal states clear active evidence without clearing persistent continuity" },
    { name: "ck_multi_cut_replay_v2_result", kind: "check", columns: ["state", "result_reference_version", "result_reference_identity"], invariant: "result linkage exists exactly for completed state" },
    { name: "ck_multi_cut_replay_v2_terminal", kind: "check", columns: ["state", "terminal_metadata_version", "terminal_at", "terminal_classification"], invariant: "versioned terminal metadata matches completed, failed, or released state" },
  ] as const),
  indexes: Object.freeze([
    { name: "ix_multi_cut_replay_v2_authority", columns: identityColumns, unique: true, purpose: "authoritative record selection", supportedOperations: ["resolution", "lifecycle", "recovery", "reconciliation"], authoritativeIdentity: true, whyRequired: "all identity-addressed operations require one version-pinned access path", whyNotAuthoritative: "not applicable; this is the sole authoritative identity index" },
    { name: "ix_multi_cut_replay_v2_lease_expiry", columns: ["state", "lease_expires_at"], unique: false, purpose: "stale processing candidates", supportedOperations: ["takeover", "lease-expiry"], authoritativeIdentity: false, whyRequired: "candidate discovery begins with processing state and lease expiry", whyNotAuthoritative: "candidate discovery must be followed by authoritative identity and fencing checks" },
    { name: "ix_multi_cut_replay_v2_ownership", columns: ["state", "reservation_identity", "lease_identity"], unique: false, purpose: "ownership evidence diagnostics", supportedOperations: ["ownership-lookup"], authoritativeIdentity: false, whyRequired: "ownership diagnostics filter current processing evidence", whyNotAuthoritative: "reservation and lease evidence are mutable concurrency evidence" },
    { name: "ix_multi_cut_replay_v2_state", columns: ["state"], unique: false, purpose: "state-filtered maintenance", supportedOperations: ["state-filtered-lookup"], authoritativeIdentity: false, whyRequired: "maintenance and reconciliation enumerate a bounded state set", whyNotAuthoritative: "many replay records share the same lifecycle state" },
    { name: "ix_multi_cut_replay_v2_result", columns: ["state", "result_reference_version", "result_reference_identity"], unique: false, purpose: "completed result linkage", supportedOperations: ["result-linkage-lookup"], authoritativeIdentity: false, whyRequired: "completed records may be found by their existing result linkage", whyNotAuthoritative: "result linkage is terminal output metadata, not replay identity" },
  ] as const),
  relationships: Object.freeze([]),
  persistentConcurrencyContinuity: Object.freeze({
    continuityVersion: "1.0",
    columnOrdering: Object.freeze([
      "revision",
      "last_fencing_token",
      "last_reservation_attempt",
    ] as const),
    fields: Object.freeze([
      {
        name: "revision",
        type: "text",
        nullable: false,
        defaultPolicy: "none",
        persistenceSemantics: "lifecycle-persistent",
        lifecycle: "processing-and-terminal",
        owner: "replay-record",
        generationAuthority: "postgresql-only",
        mutationAuthority: "successful-authoritative-mutation-only",
        terminalSemantics: "retained",
        retrySemantics: "never-predict-reconcile-first",
        reconciliationSemantics: "compare-authoritative-persisted-value",
        migrationClassification: Object.freeze({
          backfillable: true,
          derived: false,
          requiresRuntime: false,
          requiresQuarantine: false,
          impossibleToReconstruct: false,
          scope: "existing-field-no-new-backfill",
        }),
      },
      {
        name: "last_fencing_token",
        type: "text",
        nullable: false,
        defaultPolicy: "none",
        persistenceSemantics: "lifecycle-persistent",
        lifecycle: "processing-and-terminal",
        owner: "replay-record",
        generationAuthority: "postgresql-only",
        mutationAuthority: "successful-authoritative-mutation-only",
        terminalSemantics: "retained",
        retrySemantics: "never-predict-reconcile-first",
        reconciliationSemantics: "compare-authoritative-persisted-value",
        migrationClassification: Object.freeze({
          backfillable: true,
          derived: false,
          requiresRuntime: false,
          requiresQuarantine: true,
          impossibleToReconstruct: true,
          scope: "processing-from-active-evidence-terminal-from-authority",
        }),
      },
      {
        name: "last_reservation_attempt",
        type: "integer",
        nullable: false,
        defaultPolicy: "none",
        persistenceSemantics: "lifecycle-persistent",
        lifecycle: "processing-and-terminal",
        owner: "replay-record",
        generationAuthority: "postgresql-only",
        mutationAuthority: "successful-authoritative-mutation-only",
        terminalSemantics: "retained",
        retrySemantics: "never-predict-reconcile-first",
        reconciliationSemantics: "compare-authoritative-persisted-value",
        migrationClassification: Object.freeze({
          backfillable: true,
          derived: false,
          requiresRuntime: false,
          requiresQuarantine: true,
          impossibleToReconstruct: true,
          scope: "processing-from-active-evidence-terminal-from-authority",
        }),
      },
    ] as const),
    activeProcessingEvidenceStartsAfter: "last_reservation_attempt",
    relationship: Object.freeze({
      replayIdentityOwnsContinuity: true,
      continuityIsActiveProcessingEvidence: false,
      activeProcessingEvidenceIsTerminalPersistent: false,
    }),
    terminalRowMigration: Object.freeze({
      existingTerminalRowsAreDirectlyBackfillable: false,
      authoritativeSourceRequired: true,
      guessedValuesPermitted: false,
      nullToZeroPermitted: false,
      unresolvedRows: "quarantine-from-re-reservation",
      impossibleToReconstructWithoutAuthority: true,
    }),
  }),
  physicalInvariants: Object.freeze([
    "revision-monotonic",
    "last-fencing-token-monotonic",
    "last-reservation-attempt-monotonic",
    "terminal-transition-preserves-continuity",
    "active-processing-evidence-independent",
    "replay-identity-mutation-prohibited",
    "semantic-fingerprint-mutation-prohibited",
  ]),
  responsibilities: Object.freeze({
    database: Object.freeze(["not-null", "schema-version", "state-domain", "scope-key-uniqueness", "state-nullability-consistency", "persistent-continuity-generation", "persistent-continuity-mutation"]),
    runtimeOrStatement: Object.freeze(["identity-immutability-after-insert", "expected-revision-comparison", "fencing-comparison", "semantic-fingerprint-comparison", "transaction-atomicity", "persistent-continuity-generation-prohibited"]),
  }),
} as const);
