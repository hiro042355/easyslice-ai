-- Slice A Migration Foundation V1
-- Compatibility: reader 1..1, writer 1..1
-- Transactional: yes
-- Direction: forward-only; expand/contract required for future destructive change

CREATE SCHEMA workflow;

CREATE TABLE workflow.workflow_schema_metadata (
  metadata_key text PRIMARY KEY,
  schema_contract_major smallint NOT NULL,
  schema_contract_minor smallint NOT NULL,
  minimum_reader_major smallint NOT NULL,
  maximum_reader_major smallint NOT NULL,
  minimum_writer_major smallint NOT NULL,
  maximum_writer_major smallint NOT NULL,
  migration_head_identifier text NOT NULL,
  migration_history_owner text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT workflow_schema_metadata_singleton_ck CHECK (metadata_key = 'slice-a'),
  CONSTRAINT workflow_schema_metadata_versions_ck CHECK (
    schema_contract_major = 1 AND schema_contract_minor >= 0
    AND minimum_reader_major BETWEEN 1 AND maximum_reader_major
    AND minimum_writer_major BETWEEN 1 AND maximum_writer_major
  ),
  CONSTRAINT workflow_schema_metadata_head_ck CHECK (
    migration_head_identifier ~ '^V[0-9]{6}$'
    AND migration_history_owner = 'flyway_schema_history'
  )
);

CREATE TABLE workflow.workflow_writer_epochs (
  authority_scope text PRIMARY KEY,
  home_region text NOT NULL,
  writer_epoch bigint NOT NULL,
  active_state text NOT NULL,
  revision bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT workflow_writer_epochs_scope_ck CHECK (authority_scope ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
  CONSTRAINT workflow_writer_epochs_region_ck CHECK (home_region ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  CONSTRAINT workflow_writer_epochs_epoch_ck CHECK (writer_epoch >= 0),
  CONSTRAINT workflow_writer_epochs_state_ck CHECK (active_state IN ('active', 'inactive')),
  CONSTRAINT workflow_writer_epochs_revision_ck CHECK (revision >= 0)
);

CREATE UNIQUE INDEX workflow_writer_epochs_one_active_uq
  ON workflow.workflow_writer_epochs ((active_state))
  WHERE active_state = 'active';

CREATE TABLE workflow.workflow_final_results (
  result_id uuid PRIMARY KEY,
  result_digest_algorithm text NOT NULL,
  result_digest_version smallint NOT NULL,
  result_digest bytea NOT NULL,
  tenant_digest_algorithm text NOT NULL,
  tenant_digest_version smallint NOT NULL,
  tenant_digest bytea NOT NULL,
  region text NOT NULL,
  operation text NOT NULL,
  result_status text NOT NULL,
  result_version integer NOT NULL,
  record_version integer NOT NULL,
  schema_version integer NOT NULL,
  revision bigint NOT NULL,
  terminal_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  committed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  expires_at timestamptz NOT NULL,
  retention_class text NOT NULL,
  deletion_state text NOT NULL,
  legal_hold_state text NOT NULL,
  CONSTRAINT workflow_final_results_result_identity_uq UNIQUE
    (result_digest_algorithm, result_digest_version, result_digest, tenant_digest, region, operation),
  CONSTRAINT workflow_final_results_digest_ck CHECK (
    result_digest_algorithm = 'sha256' AND result_digest_version = 1 AND octet_length(result_digest) = 32
    AND tenant_digest_algorithm = 'sha256' AND tenant_digest_version = 1 AND octet_length(tenant_digest) = 32
  ),
  CONSTRAINT workflow_final_results_region_ck CHECK (region ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  CONSTRAINT workflow_final_results_operation_ck CHECK (operation IN ('generate-vocal', 'generate-music', 'generate-mv')),
  CONSTRAINT workflow_final_results_status_ck CHECK (result_status IN ('completed', 'degraded', 'partial', 'failed', 'cancelled')),
  CONSTRAINT workflow_final_results_versions_ck CHECK (result_version = 1 AND record_version = 1 AND schema_version = 1),
  CONSTRAINT workflow_final_results_revision_ck CHECK (revision >= 0),
  CONSTRAINT workflow_final_results_payload_ck CHECK (
    jsonb_typeof(terminal_payload) = 'object'
    AND pg_column_size(terminal_payload) <= 1048576
    AND ((result_status = 'failed' AND terminal_payload ? 'error') OR (result_status <> 'failed' AND NOT terminal_payload ? 'error'))
  ),
  CONSTRAINT workflow_final_results_time_ck CHECK (created_at <= committed_at AND committed_at <= updated_at AND created_at < expires_at),
  CONSTRAINT workflow_final_results_retention_ck CHECK (retention_class ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  CONSTRAINT workflow_final_results_deletion_ck CHECK (deletion_state IN ('active', 'deletion-pending', 'deleted')),
  CONSTRAINT workflow_final_results_legal_hold_ck CHECK (legal_hold_state IN ('none', 'held')),
  CONSTRAINT workflow_final_results_lifecycle_ck CHECK (NOT (deletion_state = 'deleted' AND legal_hold_state = 'held'))
);

CREATE INDEX workflow_final_results_expiry_idx
  ON workflow.workflow_final_results (expires_at, result_id)
  WHERE deletion_state <> 'deleted' AND legal_hold_state = 'none';

CREATE INDEX workflow_final_results_lifecycle_idx
  ON workflow.workflow_final_results (deletion_state, legal_hold_state, updated_at, result_id);

CREATE TABLE workflow.workflow_result_references (
  reference_id uuid PRIMARY KEY,
  token_digest_algorithm text NOT NULL,
  token_digest_version smallint NOT NULL,
  token_digest bytea NOT NULL,
  result_id uuid NOT NULL,
  reference_kind text NOT NULL,
  operation text NOT NULL,
  owner_digest bytea NOT NULL,
  tenant_digest bytea NOT NULL,
  region text NOT NULL,
  reference_state text NOT NULL,
  record_version integer NOT NULL,
  schema_version integer NOT NULL,
  revision bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  expires_at timestamptz NOT NULL,
  deletion_state text NOT NULL,
  legal_hold_state text NOT NULL,
  CONSTRAINT workflow_result_references_token_identity_uq UNIQUE
    (token_digest_algorithm, token_digest_version, token_digest, tenant_digest, region),
  CONSTRAINT workflow_result_references_result_kind_uq UNIQUE (result_id, reference_kind),
  CONSTRAINT workflow_result_references_result_fk FOREIGN KEY (result_id)
    REFERENCES workflow.workflow_final_results (result_id) ON DELETE RESTRICT,
  CONSTRAINT workflow_result_references_digest_ck CHECK (
    token_digest_algorithm = 'sha256' AND token_digest_version = 1 AND octet_length(token_digest) = 32
    AND octet_length(owner_digest) = 32 AND octet_length(tenant_digest) = 32
  ),
  CONSTRAINT workflow_result_references_kind_ck CHECK (reference_kind IN ('upload-pending', 'generation-job', 'workflow-result')),
  CONSTRAINT workflow_result_references_operation_ck CHECK (operation IN ('generate-vocal', 'generate-music', 'generate-mv')),
  CONSTRAINT workflow_result_references_region_ck CHECK (region ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  CONSTRAINT workflow_result_references_state_ck CHECK (reference_state IN ('active', 'revoked', 'expired', 'deleted')),
  CONSTRAINT workflow_result_references_versions_ck CHECK (record_version = 1 AND schema_version = 1),
  CONSTRAINT workflow_result_references_revision_ck CHECK (revision >= 0),
  CONSTRAINT workflow_result_references_time_ck CHECK (created_at <= updated_at AND created_at < expires_at),
  CONSTRAINT workflow_result_references_deletion_ck CHECK (deletion_state IN ('active', 'deletion-pending', 'deleted')),
  CONSTRAINT workflow_result_references_legal_hold_ck CHECK (legal_hold_state IN ('none', 'held')),
  CONSTRAINT workflow_result_references_lifecycle_ck CHECK (
    NOT (deletion_state = 'deleted' AND legal_hold_state = 'held')
    AND (reference_state <> 'deleted' OR deletion_state = 'deleted')
  )
);

CREATE INDEX workflow_result_references_result_fk_idx
  ON workflow.workflow_result_references (result_id);

CREATE INDEX workflow_result_references_expiry_idx
  ON workflow.workflow_result_references (expires_at, reference_id)
  WHERE reference_state = 'active' AND deletion_state <> 'deleted' AND legal_hold_state = 'none';

CREATE TABLE workflow.workflow_outbox_events (
  event_id uuid PRIMARY KEY,
  event_digest_algorithm text NOT NULL,
  event_digest_version smallint NOT NULL,
  event_digest bytea NOT NULL,
  aggregate_kind text NOT NULL,
  aggregate_digest bytea NOT NULL,
  result_id uuid NOT NULL,
  event_type text NOT NULL,
  payload_version integer NOT NULL,
  schema_version integer NOT NULL,
  safe_payload jsonb NOT NULL,
  delivery_state text NOT NULL,
  attempt integer NOT NULL,
  next_eligible_at timestamptz NOT NULL,
  claim_owner_digest bytea,
  fencing_revision bigint,
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  safe_failure_class text,
  revision bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT workflow_outbox_events_identity_uq UNIQUE
    (event_digest_algorithm, event_digest_version, event_digest),
  CONSTRAINT workflow_outbox_events_result_fk FOREIGN KEY (result_id)
    REFERENCES workflow.workflow_final_results (result_id) ON DELETE RESTRICT,
  CONSTRAINT workflow_outbox_events_digest_ck CHECK (
    event_digest_algorithm = 'sha256' AND event_digest_version = 1
    AND octet_length(event_digest) = 32 AND octet_length(aggregate_digest) = 32
    AND (claim_owner_digest IS NULL OR octet_length(claim_owner_digest) = 32)
  ),
  CONSTRAINT workflow_outbox_events_aggregate_ck CHECK (aggregate_kind = 'workflow-final-result'),
  CONSTRAINT workflow_outbox_events_type_ck CHECK (event_type ~ '^[a-z][a-z0-9.-]{0,127}$'),
  CONSTRAINT workflow_outbox_events_versions_ck CHECK (payload_version = 1 AND schema_version = 1),
  CONSTRAINT workflow_outbox_events_payload_ck CHECK (jsonb_typeof(safe_payload) = 'object' AND pg_column_size(safe_payload) <= 1048576),
  CONSTRAINT workflow_outbox_events_state_ck CHECK (delivery_state IN ('pending', 'claimed', 'delivered', 'reconciliation-required')),
  CONSTRAINT workflow_outbox_events_attempt_ck CHECK (attempt >= 0),
  CONSTRAINT workflow_outbox_events_revision_ck CHECK (revision >= 0 AND (fencing_revision IS NULL OR fencing_revision >= 0)),
  CONSTRAINT workflow_outbox_events_time_ck CHECK (created_at <= updated_at),
  CONSTRAINT workflow_outbox_events_delivery_ck CHECK (
    (delivery_state = 'pending' AND claim_owner_digest IS NULL AND fencing_revision IS NULL AND lease_expires_at IS NULL AND delivered_at IS NULL AND safe_failure_class IS NULL)
    OR (delivery_state = 'claimed' AND claim_owner_digest IS NOT NULL AND fencing_revision IS NOT NULL AND lease_expires_at IS NOT NULL AND delivered_at IS NULL AND safe_failure_class IS NULL)
    OR (delivery_state = 'delivered' AND claim_owner_digest IS NULL AND fencing_revision IS NOT NULL AND lease_expires_at IS NULL AND delivered_at IS NOT NULL AND safe_failure_class IS NULL)
    OR (delivery_state = 'reconciliation-required' AND delivered_at IS NULL AND safe_failure_class ~ '^[a-z][a-z0-9-]{0,127}$')
  )
);

CREATE INDEX workflow_outbox_events_result_fk_idx
  ON workflow.workflow_outbox_events (result_id);

CREATE INDEX workflow_outbox_events_claim_poll_idx
  ON workflow.workflow_outbox_events (next_eligible_at, event_id)
  WHERE delivery_state IN ('pending', 'claimed', 'reconciliation-required');

INSERT INTO workflow.workflow_schema_metadata (
  metadata_key, schema_contract_major, schema_contract_minor,
  minimum_reader_major, maximum_reader_major,
  minimum_writer_major, maximum_writer_major,
  migration_head_identifier, migration_history_owner
) VALUES ('slice-a', 1, 0, 1, 1, 1, 1, 'V000001', 'flyway_schema_history');
