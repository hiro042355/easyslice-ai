-- Multi-cut Replay PostgreSQL Migration Foundation V2
-- Forward-only, transactional, contract-derived, no guessed backfill

CREATE TABLE multi_cut_replay_records_v2 (
  internal_record_id uuid NOT NULL,
  physical_schema_version text NOT NULL,
  logical_schema_version text NOT NULL,
  identity_version text NOT NULL,
  scope_version text NOT NULL,
  replay_namespace text NOT NULL,
  tenant_identity_version text NOT NULL,
  protected_tenant_identity text NOT NULL,
  operation_identity text NOT NULL,
  key_identity text NOT NULL,
  request_fingerprint_identity text NOT NULL,
  state text NOT NULL,
  revision text NOT NULL,
  last_fencing_token text NOT NULL,
  last_reservation_attempt integer NOT NULL,
  reservation_evidence_version text,
  reservation_version text,
  reservation_identity text,
  expected_revision_version text,
  expected_revision text,
  fencing_version text,
  fencing_token text,
  lease_version text,
  lease_identity text,
  lease_expires_at timestamptz,
  reservation_attempt integer,
  result_reference_version text,
  result_reference_identity text,
  terminal_metadata_version text,
  terminal_at timestamptz,
  terminal_classification text,
  CONSTRAINT pk_multi_cut_replay_v2_internal PRIMARY KEY (internal_record_id),
  CONSTRAINT uq_multi_cut_replay_v2_authority UNIQUE (
    physical_schema_version,
    logical_schema_version,
    identity_version,
    scope_version,
    replay_namespace,
    tenant_identity_version,
    protected_tenant_identity,
    operation_identity,
    key_identity
  ),
  CONSTRAINT ck_multi_cut_replay_v2_schema CHECK (
    physical_schema_version = '2.0'
    AND logical_schema_version = '2.0'
    AND identity_version = '2.0'
  ),
  CONSTRAINT ck_multi_cut_replay_v2_state CHECK (
    state IN ('processing', 'completed', 'failed', 'released')
  ),
  CONSTRAINT ck_multi_cut_replay_v2_identity_complete CHECK (
    length(scope_version) > 0
    AND length(replay_namespace) > 0
    AND length(tenant_identity_version) > 0
    AND length(protected_tenant_identity) > 0
    AND length(operation_identity) > 0
    AND length(key_identity) > 0
  ),
  CONSTRAINT ck_multi_cut_replay_v2_fingerprint CHECK (
    length(request_fingerprint_identity) > 0
  ),
  CONSTRAINT ck_multi_cut_replay_v2_continuity CHECK (
    revision ~ '^[1-9][0-9]*$'
    AND last_fencing_token ~ '^[1-9][0-9]*$'
    AND last_reservation_attempt >= 1
  ),
  CONSTRAINT ck_multi_cut_replay_v2_processing CHECK (
    (
      state = 'processing'
      AND reservation_evidence_version IS NOT NULL
      AND reservation_version IS NOT NULL
      AND reservation_identity IS NOT NULL
      AND expected_revision_version IS NOT NULL
      AND expected_revision IS NOT NULL
      AND fencing_version IS NOT NULL
      AND fencing_token IS NOT NULL
      AND lease_version IS NOT NULL
      AND lease_identity IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND reservation_attempt IS NOT NULL
      AND fencing_token = last_fencing_token
      AND reservation_attempt = last_reservation_attempt
    )
    OR (
      state IN ('completed', 'failed', 'released')
      AND reservation_evidence_version IS NULL
      AND reservation_version IS NULL
      AND reservation_identity IS NULL
      AND expected_revision_version IS NULL
      AND expected_revision IS NULL
      AND fencing_version IS NULL
      AND fencing_token IS NULL
      AND lease_version IS NULL
      AND lease_identity IS NULL
      AND lease_expires_at IS NULL
      AND reservation_attempt IS NULL
    )
  ),
  CONSTRAINT ck_multi_cut_replay_v2_result CHECK (
    (
      state = 'completed'
      AND result_reference_version IS NOT NULL
      AND result_reference_identity IS NOT NULL
    )
    OR (
      state <> 'completed'
      AND result_reference_version IS NULL
      AND result_reference_identity IS NULL
    )
  ),
  CONSTRAINT ck_multi_cut_replay_v2_terminal CHECK (
    (
      state = 'processing'
      AND terminal_metadata_version IS NULL
      AND terminal_at IS NULL
      AND terminal_classification IS NULL
    )
    OR (
      state IN ('completed', 'failed', 'released')
      AND terminal_metadata_version IS NOT NULL
      AND terminal_at IS NOT NULL
      AND terminal_classification IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX ix_multi_cut_replay_v2_authority
  ON multi_cut_replay_records_v2 (
    physical_schema_version,
    logical_schema_version,
    identity_version,
    scope_version,
    replay_namespace,
    tenant_identity_version,
    protected_tenant_identity,
    operation_identity,
    key_identity
  );

CREATE INDEX ix_multi_cut_replay_v2_lease_expiry
  ON multi_cut_replay_records_v2 (state, lease_expires_at);

CREATE INDEX ix_multi_cut_replay_v2_ownership
  ON multi_cut_replay_records_v2 (
    state,
    reservation_identity,
    lease_identity
  );

CREATE INDEX ix_multi_cut_replay_v2_state
  ON multi_cut_replay_records_v2 (state);

CREATE INDEX ix_multi_cut_replay_v2_result
  ON multi_cut_replay_records_v2 (
    state,
    result_reference_version,
    result_reference_identity
  );
