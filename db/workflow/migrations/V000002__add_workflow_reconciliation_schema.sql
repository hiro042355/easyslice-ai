-- Workflow Reconciliation Migration Foundation V1
-- Compatibility: V000001 readers/writers preserved; reconciliation reader/writer 1..1
-- Transactional: yes
-- Direction: forward-only, additive

CREATE TABLE workflow.workflow_reconciliation_requests (
  reconciliation_id uuid PRIMARY KEY,
  identity_digest_algorithm text NOT NULL,
  identity_digest_version integer NOT NULL,
  identity_digest bytea NOT NULL,
  tenant_digest bytea NOT NULL,
  workflow_digest bytea NOT NULL,
  provider_digest bytea,
  reconciliation_class text NOT NULL,
  operation text NOT NULL,
  home_region text NOT NULL,
  provider_binding_version text,
  state text NOT NULL,
  resolution_class text,
  escalation_class text,
  safe_reason_code text,
  policy_version integer NOT NULL,
  temporal_policy_class text NOT NULL,
  max_observation_count integer NOT NULL,
  max_attempt_count integer NOT NULL,
  observation_count integer NOT NULL DEFAULT 0,
  attempt integer NOT NULL DEFAULT 0,
  first_observed_at timestamptz,
  last_observed_at timestamptz,
  next_eligible_at timestamptz,
  policy_deadline_at timestamptz NOT NULL,
  policy_supplemental jsonb,
  claim_owner_digest bytea,
  fencing_revision bigint NOT NULL DEFAULT 0,
  lease_expires_at timestamptz,
  writer_epoch bigint NOT NULL,
  revision bigint NOT NULL DEFAULT 0,
  retention_class text NOT NULL,
  deletion_state text NOT NULL DEFAULT 'active',
  legal_hold_state text NOT NULL DEFAULT 'none',
  expires_at timestamptz,
  terminal_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT workflow_reconciliation_requests_identity_uq UNIQUE
    (identity_digest_algorithm, identity_digest_version, identity_digest, tenant_digest, home_region),
  CONSTRAINT workflow_reconciliation_requests_digest_ck CHECK (
    identity_digest_algorithm IN ('sha256', 'hmac-sha256')
    AND identity_digest_version = 1
    AND octet_length(identity_digest) = 32
    AND octet_length(tenant_digest) = 32
    AND octet_length(workflow_digest) = 32
    AND (provider_digest IS NULL OR octet_length(provider_digest) = 32)
  ),
  CONSTRAINT workflow_reconciliation_requests_provider_ck CHECK (
    (provider_digest IS NULL) = (provider_binding_version IS NULL)
    AND (
      reconciliation_class NOT IN ('provider-submit-unknown', 'provider-poll-unknown')
      OR provider_digest IS NOT NULL
    )
  ),
  CONSTRAINT workflow_reconciliation_requests_class_ck CHECK (reconciliation_class IN (
    'database-commit-unknown', 'provider-submit-unknown', 'provider-poll-unknown',
    'output-ingestion-unknown', 'cancellation-unknown', 'webhook-scheduler-race',
    'outbox-delivery-unknown'
  )),
  CONSTRAINT workflow_reconciliation_requests_operation_ck CHECK (
    operation IN ('generate-vocal', 'generate-music', 'generate-mv')
  ),
  CONSTRAINT workflow_reconciliation_requests_region_ck CHECK (
    home_region ~ '^[a-z0-9][a-z0-9-]{0,62}$'
  ),
  CONSTRAINT workflow_reconciliation_requests_binding_ck CHECK (
    provider_binding_version IS NULL
    OR provider_binding_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  ),
  CONSTRAINT workflow_reconciliation_requests_state_ck CHECK (state IN (
    'pending-observation', 'claimed', 'observing', 'retry-wait', 'resolved',
    'still-unknown', 'corrupted', 'manual-repair-required', 'cancelled', 'deleted'
  )),
  CONSTRAINT workflow_reconciliation_requests_resolution_ck CHECK (
    resolution_class IS NULL OR resolution_class IN (
      'committed', 'not-committed', 'provider-job-found', 'provider-job-not-found',
      'terminal-preserved', 'cancelled', 'retry-later', 'manual-repair',
      'operator-review', 'still-unknown', 'corrupted'
    )
  ),
  CONSTRAINT workflow_reconciliation_requests_escalation_ck CHECK (
    escalation_class IS NULL OR escalation_class IN ('manual-repair', 'operator-review')
  ),
  CONSTRAINT workflow_reconciliation_requests_reason_ck CHECK (
    safe_reason_code IS NULL OR safe_reason_code IN (
      'database-commit-acknowledgement-lost', 'authoritative-store-unavailable',
      'provider-submit-acknowledgement-lost', 'provider-job-not-yet-visible',
      'provider-job-not-found-authoritative', 'provider-job-conflict',
      'webhook-poll-race', 'output-ingestion-status-unknown',
      'cancellation-status-unknown', 'outbox-delivery-status-unknown',
      'terminal-state-preserved', 'invariant-conflict-detected',
      'observation-window-exhausted', 'manual-repair-required',
      'authorization-required', 'legal-hold-active', 'record-expired',
      'record-deleted', 'failover-wait', 'stale-writer-epoch',
      'retry-budget-exhausted'
    )
  ),
  CONSTRAINT workflow_reconciliation_requests_policy_ck CHECK (
    policy_version = 1
    AND temporal_policy_class IN (
      'immediate-database', 'short-provider', 'standard-provider', 'long-provider',
      'cancellation', 'output-ingestion', 'outbox-delivery'
    )
    AND max_observation_count BETWEEN 1 AND 64
    AND max_attempt_count BETWEEN 1 AND 32
    AND observation_count BETWEEN 0 AND max_observation_count
    AND attempt BETWEEN 0 AND max_attempt_count
  ),
  CONSTRAINT workflow_reconciliation_requests_policy_payload_ck CHECK (
    policy_supplemental IS NULL OR (
      jsonb_typeof(policy_supplemental) = 'object'
      AND octet_length(policy_supplemental::text) <= 8192
    )
  ),
  CONSTRAINT workflow_reconciliation_requests_claim_ck CHECK (
    (
      state IN ('claimed', 'observing')
      AND claim_owner_digest IS NOT NULL
      AND octet_length(claim_owner_digest) = 32
      AND lease_expires_at IS NOT NULL
    ) OR (
      state NOT IN ('claimed', 'observing')
      AND claim_owner_digest IS NULL
      AND lease_expires_at IS NULL
    )
  ),
  CONSTRAINT workflow_reconciliation_requests_terminal_ck CHECK (
    (
      state IN ('resolved', 'still-unknown', 'corrupted', 'manual-repair-required', 'cancelled', 'deleted')
      AND terminal_at IS NOT NULL
      AND next_eligible_at IS NULL
    ) OR (
      state NOT IN ('resolved', 'still-unknown', 'corrupted', 'manual-repair-required', 'cancelled', 'deleted')
      AND terminal_at IS NULL
    )
  ),
  CONSTRAINT workflow_reconciliation_requests_outcome_ck CHECK (
    (state = 'resolved' AND resolution_class IS NOT NULL AND escalation_class IS NULL)
    OR (state = 'still-unknown' AND resolution_class = 'still-unknown' AND escalation_class IN ('manual-repair', 'operator-review'))
    OR (state = 'corrupted' AND resolution_class = 'corrupted' AND escalation_class = 'manual-repair')
    OR (state = 'manual-repair-required' AND resolution_class = 'manual-repair' AND escalation_class = 'manual-repair')
    OR (state = 'cancelled' AND resolution_class = 'cancelled')
    OR (state = 'deleted' AND resolution_class IS NOT NULL)
    OR (state NOT IN ('resolved', 'still-unknown', 'corrupted', 'manual-repair-required', 'cancelled', 'deleted') AND resolution_class IS NULL AND escalation_class IS NULL)
  ),
  CONSTRAINT workflow_reconciliation_requests_revision_ck CHECK (
    fencing_revision >= 0 AND writer_epoch >= 0 AND revision >= 0
  ),
  CONSTRAINT workflow_reconciliation_requests_time_ck CHECK (
    created_at <= updated_at
    AND created_at <= policy_deadline_at
    AND (first_observed_at IS NULL OR created_at <= first_observed_at)
    AND (last_observed_at IS NULL OR first_observed_at IS NOT NULL AND first_observed_at <= last_observed_at)
    AND (last_observed_at IS NULL OR last_observed_at <= policy_deadline_at)
    AND (next_eligible_at IS NULL OR created_at <= next_eligible_at)
    AND (lease_expires_at IS NULL OR updated_at < lease_expires_at)
    AND (expires_at IS NULL OR created_at < expires_at)
    AND (terminal_at IS NULL OR created_at <= terminal_at)
  ),
  CONSTRAINT workflow_reconciliation_requests_retention_ck CHECK (retention_class IN (
    'reconciliation-standard', 'reconciliation-extended',
    'reconciliation-manual-repair', 'reconciliation-legal-hold',
    'reconciliation-corrupted', 'reconciliation-security-review'
  )),
  CONSTRAINT workflow_reconciliation_requests_lifecycle_ck CHECK (
    deletion_state IN ('active', 'deletion-pending', 'deleted')
    AND legal_hold_state IN ('none', 'held')
    AND NOT (deletion_state = 'deleted' AND legal_hold_state = 'held')
    AND (state <> 'deleted' OR deletion_state = 'deleted')
  )
);

CREATE INDEX workflow_reconciliation_requests_due_idx
  ON workflow.workflow_reconciliation_requests (next_eligible_at, reconciliation_id)
  WHERE state IN ('pending-observation', 'retry-wait');

CREATE INDEX workflow_reconciliation_requests_takeover_idx
  ON workflow.workflow_reconciliation_requests (lease_expires_at, reconciliation_id)
  WHERE state IN ('claimed', 'observing');

CREATE INDEX workflow_reconciliation_requests_workflow_idx
  ON workflow.workflow_reconciliation_requests (tenant_digest, workflow_digest, home_region);

CREATE INDEX workflow_reconciliation_requests_provider_idx
  ON workflow.workflow_reconciliation_requests (tenant_digest, provider_digest, home_region)
  WHERE provider_digest IS NOT NULL;

CREATE INDEX workflow_reconciliation_requests_state_due_idx
  ON workflow.workflow_reconciliation_requests (state, next_eligible_at, reconciliation_id);

CREATE INDEX workflow_reconciliation_requests_retention_idx
  ON workflow.workflow_reconciliation_requests (retention_class, deletion_state, updated_at, reconciliation_id);

CREATE INDEX workflow_reconciliation_requests_hold_idx
  ON workflow.workflow_reconciliation_requests (legal_hold_state, updated_at, reconciliation_id)
  WHERE legal_hold_state = 'held';

CREATE TABLE workflow.workflow_reconciliation_observations (
  observation_id uuid PRIMARY KEY,
  reconciliation_id uuid NOT NULL,
  identity_digest_algorithm text NOT NULL,
  identity_digest_version integer NOT NULL,
  identity_digest bytea NOT NULL,
  tenant_digest bytea NOT NULL,
  observation_sequence bigint NOT NULL,
  source_class text NOT NULL,
  source_result_class text NOT NULL,
  safe_evidence_class text NOT NULL,
  provider_binding_version text,
  attempt integer NOT NULL,
  observed_at timestamptz NOT NULL,
  safe_payload jsonb NOT NULL,
  payload_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT workflow_reconciliation_observations_request_fk FOREIGN KEY (reconciliation_id)
    REFERENCES workflow.workflow_reconciliation_requests (reconciliation_id) ON DELETE RESTRICT,
  CONSTRAINT workflow_reconciliation_observations_identity_uq UNIQUE
    (identity_digest_algorithm, identity_digest_version, identity_digest, tenant_digest),
  CONSTRAINT workflow_reconciliation_observations_sequence_uq UNIQUE
    (reconciliation_id, observation_sequence),
  CONSTRAINT workflow_reconciliation_observations_digest_ck CHECK (
    identity_digest_algorithm IN ('sha256', 'hmac-sha256')
    AND identity_digest_version = 1
    AND octet_length(identity_digest) = 32
    AND octet_length(tenant_digest) = 32
  ),
  CONSTRAINT workflow_reconciliation_observations_sequence_ck CHECK (
    observation_sequence BETWEEN 1 AND 64 AND attempt BETWEEN 1 AND 32
  ),
  CONSTRAINT workflow_reconciliation_observations_source_ck CHECK (source_class IN (
    'slice-a-store', 'generation-submit-idempotency', 'provider-job-lookup',
    'safe-journal', 'webhook-inbox', 'terminal-store',
    'output-ingestion-store', 'outbox-delivery-ledger', 'cancellation-store'
  )),
  CONSTRAINT workflow_reconciliation_observations_result_ck CHECK (source_result_class IN (
    'committed', 'not-committed', 'found', 'not-found', 'pending', 'terminal',
    'unavailable', 'conflict', 'corrupted', 'malformed', 'stale'
  )),
  CONSTRAINT workflow_reconciliation_observations_evidence_ck CHECK (safe_evidence_class IN (
    'authoritative-summary', 'non-authoritative-summary', 'consistency-window', 'safe-diagnostic'
  )),
  CONSTRAINT workflow_reconciliation_observations_binding_ck CHECK (
    provider_binding_version IS NULL OR provider_binding_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  ),
  CONSTRAINT workflow_reconciliation_observations_payload_ck CHECK (
    payload_version = 1
    AND jsonb_typeof(safe_payload) = 'object'
    AND octet_length(safe_payload::text) <= 16384
  ),
  CONSTRAINT workflow_reconciliation_observations_time_ck CHECK (observed_at <= created_at)
);

CREATE INDEX workflow_reconciliation_observations_request_idx
  ON workflow.workflow_reconciliation_observations (reconciliation_id, observation_sequence);

CREATE INDEX workflow_reconciliation_observations_source_idx
  ON workflow.workflow_reconciliation_observations (source_class, source_result_class, observed_at);

CREATE INDEX workflow_reconciliation_observations_observed_idx
  ON workflow.workflow_reconciliation_observations (observed_at, observation_id);

CREATE TABLE workflow.workflow_reconciliation_resolutions (
  resolution_id uuid PRIMARY KEY,
  reconciliation_id uuid NOT NULL,
  identity_digest_algorithm text NOT NULL,
  identity_digest_version integer NOT NULL,
  identity_digest bytea NOT NULL,
  tenant_digest bytea NOT NULL,
  resolution_sequence bigint NOT NULL,
  resolution_class text NOT NULL,
  safe_reason_code text NOT NULL,
  safe_summary jsonb NOT NULL,
  summary_version integer NOT NULL,
  committed_revision bigint NOT NULL,
  resolved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT workflow_reconciliation_resolutions_request_fk FOREIGN KEY (reconciliation_id)
    REFERENCES workflow.workflow_reconciliation_requests (reconciliation_id) ON DELETE RESTRICT,
  CONSTRAINT workflow_reconciliation_resolutions_identity_uq UNIQUE
    (identity_digest_algorithm, identity_digest_version, identity_digest, tenant_digest),
  CONSTRAINT workflow_reconciliation_resolutions_sequence_uq UNIQUE
    (reconciliation_id, resolution_sequence),
  CONSTRAINT workflow_reconciliation_resolutions_digest_ck CHECK (
    identity_digest_algorithm IN ('sha256', 'hmac-sha256')
    AND identity_digest_version = 1
    AND octet_length(identity_digest) = 32
    AND octet_length(tenant_digest) = 32
  ),
  CONSTRAINT workflow_reconciliation_resolutions_sequence_ck CHECK (
    resolution_sequence >= 1 AND committed_revision >= 0
  ),
  CONSTRAINT workflow_reconciliation_resolutions_class_ck CHECK (resolution_class IN (
    'committed', 'not-committed', 'provider-job-found', 'provider-job-not-found',
    'terminal-preserved', 'cancelled', 'retry-later', 'manual-repair',
    'operator-review', 'still-unknown', 'corrupted'
  )),
  CONSTRAINT workflow_reconciliation_resolutions_reason_ck CHECK (safe_reason_code IN (
    'database-commit-acknowledgement-lost', 'authoritative-store-unavailable',
    'provider-submit-acknowledgement-lost', 'provider-job-not-yet-visible',
    'provider-job-not-found-authoritative', 'provider-job-conflict',
    'webhook-poll-race', 'output-ingestion-status-unknown',
    'cancellation-status-unknown', 'outbox-delivery-status-unknown',
    'terminal-state-preserved', 'invariant-conflict-detected',
    'observation-window-exhausted', 'manual-repair-required',
    'authorization-required', 'legal-hold-active', 'record-expired',
    'record-deleted', 'failover-wait', 'stale-writer-epoch',
    'retry-budget-exhausted'
  )),
  CONSTRAINT workflow_reconciliation_resolutions_summary_ck CHECK (
    summary_version = 1
    AND jsonb_typeof(safe_summary) = 'object'
    AND octet_length(safe_summary::text) <= 16384
  ),
  CONSTRAINT workflow_reconciliation_resolutions_time_ck CHECK (resolved_at <= created_at)
);

CREATE INDEX workflow_reconciliation_resolutions_request_idx
  ON workflow.workflow_reconciliation_resolutions (reconciliation_id, resolution_sequence);

CREATE INDEX workflow_reconciliation_resolutions_class_idx
  ON workflow.workflow_reconciliation_resolutions (resolution_class, resolved_at);

CREATE TABLE workflow.workflow_reconciliation_manual_repairs (
  repair_request_id uuid PRIMARY KEY,
  reconciliation_id uuid NOT NULL,
  identity_digest_algorithm text NOT NULL,
  identity_digest_version integer NOT NULL,
  identity_digest bytea NOT NULL,
  tenant_digest bytea NOT NULL,
  state text NOT NULL,
  requested_action_class text NOT NULL,
  requester_subject_digest bytea NOT NULL,
  approver_subject_digest bytea,
  authorization_decision_reference_digest bytea NOT NULL,
  approval_decision_reference_digest bytea,
  safe_reason_code text NOT NULL,
  safe_metadata jsonb NOT NULL,
  metadata_version integer NOT NULL,
  revision bigint NOT NULL DEFAULT 0,
  requested_at timestamptz NOT NULL,
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  retention_class text NOT NULL,
  deletion_state text NOT NULL DEFAULT 'active',
  legal_hold_state text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT workflow_reconciliation_manual_repairs_request_fk FOREIGN KEY (reconciliation_id)
    REFERENCES workflow.workflow_reconciliation_requests (reconciliation_id) ON DELETE RESTRICT,
  CONSTRAINT workflow_reconciliation_manual_repairs_identity_uq UNIQUE
    (identity_digest_algorithm, identity_digest_version, identity_digest, tenant_digest),
  CONSTRAINT workflow_reconciliation_manual_repairs_digest_ck CHECK (
    identity_digest_algorithm IN ('sha256', 'hmac-sha256')
    AND identity_digest_version = 1
    AND octet_length(identity_digest) = 32
    AND octet_length(tenant_digest) = 32
    AND octet_length(requester_subject_digest) = 32
    AND (approver_subject_digest IS NULL OR octet_length(approver_subject_digest) = 32)
    AND octet_length(authorization_decision_reference_digest) = 32
    AND (approval_decision_reference_digest IS NULL OR octet_length(approval_decision_reference_digest) = 32)
  ),
  CONSTRAINT workflow_reconciliation_manual_repairs_state_ck CHECK (state IN (
    'requested', 'authorized', 'rejected', 'executing', 'reconciled',
    'deferred', 'terminal-safe-failure'
  )),
  CONSTRAINT workflow_reconciliation_manual_repairs_action_ck CHECK (requested_action_class IN (
    'inspect-only', 'attach-evidence', 'mark-resolved-without-mutation',
    'retry-observation', 'transition-business-state', 'revoke-reference',
    'reissue-outbox', 'cancel-repair'
  )),
  CONSTRAINT workflow_reconciliation_manual_repairs_approval_ck CHECK (
    (
      requested_action_class IN ('transition-business-state', 'revoke-reference', 'reissue-outbox', 'cancel-repair')
      AND approver_subject_digest IS NOT NULL
      AND approval_decision_reference_digest IS NOT NULL
      AND requester_subject_digest <> approver_subject_digest
    ) OR requested_action_class NOT IN ('transition-business-state', 'revoke-reference', 'reissue-outbox', 'cancel-repair')
  ),
  CONSTRAINT workflow_reconciliation_manual_repairs_reason_ck CHECK (safe_reason_code IN (
    'database-commit-acknowledgement-lost', 'authoritative-store-unavailable',
    'provider-submit-acknowledgement-lost', 'provider-job-not-yet-visible',
    'provider-job-not-found-authoritative', 'provider-job-conflict',
    'webhook-poll-race', 'output-ingestion-status-unknown',
    'cancellation-status-unknown', 'outbox-delivery-status-unknown',
    'terminal-state-preserved', 'invariant-conflict-detected',
    'observation-window-exhausted', 'manual-repair-required',
    'authorization-required', 'legal-hold-active', 'record-expired',
    'record-deleted', 'failover-wait', 'stale-writer-epoch',
    'retry-budget-exhausted'
  )),
  CONSTRAINT workflow_reconciliation_manual_repairs_metadata_ck CHECK (
    metadata_version = 1
    AND jsonb_typeof(safe_metadata) = 'object'
    AND octet_length(safe_metadata::text) <= 16384
  ),
  CONSTRAINT workflow_reconciliation_manual_repairs_state_time_ck CHECK (
    (state = 'requested' AND approved_at IS NULL AND started_at IS NULL AND completed_at IS NULL)
    OR (state IN ('authorized', 'rejected') AND approved_at IS NOT NULL AND started_at IS NULL AND completed_at IS NULL)
    OR (state = 'executing' AND approved_at IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NULL)
    OR (state IN ('reconciled', 'deferred', 'terminal-safe-failure') AND approved_at IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NOT NULL)
  ),
  CONSTRAINT workflow_reconciliation_manual_repairs_time_ck CHECK (
    requested_at <= created_at
    AND (approved_at IS NULL OR requested_at <= approved_at)
    AND (started_at IS NULL OR approved_at IS NOT NULL AND approved_at <= started_at)
    AND (completed_at IS NULL OR started_at IS NOT NULL AND started_at <= completed_at)
    AND created_at <= updated_at
  ),
  CONSTRAINT workflow_reconciliation_manual_repairs_revision_ck CHECK (revision >= 0),
  CONSTRAINT workflow_reconciliation_manual_repairs_retention_ck CHECK (retention_class IN (
    'reconciliation-standard', 'reconciliation-extended',
    'reconciliation-manual-repair', 'reconciliation-legal-hold',
    'reconciliation-corrupted', 'reconciliation-security-review'
  )),
  CONSTRAINT workflow_reconciliation_manual_repairs_lifecycle_ck CHECK (
    deletion_state IN ('active', 'deletion-pending', 'deleted')
    AND legal_hold_state IN ('none', 'held')
    AND NOT (deletion_state = 'deleted' AND legal_hold_state = 'held')
  )
);

CREATE UNIQUE INDEX workflow_reconciliation_manual_repairs_one_active_uq
  ON workflow.workflow_reconciliation_manual_repairs (reconciliation_id)
  WHERE state IN ('requested', 'authorized', 'executing');

CREATE INDEX workflow_reconciliation_manual_repairs_state_idx
  ON workflow.workflow_reconciliation_manual_repairs (state, requested_at, repair_request_id);

CREATE INDEX workflow_reconciliation_manual_repairs_request_idx
  ON workflow.workflow_reconciliation_manual_repairs (reconciliation_id, requested_at);

CREATE INDEX workflow_reconciliation_manual_repairs_retention_idx
  ON workflow.workflow_reconciliation_manual_repairs (retention_class, deletion_state, updated_at);

CREATE INDEX workflow_reconciliation_manual_repairs_hold_idx
  ON workflow.workflow_reconciliation_manual_repairs (legal_hold_state, updated_at)
  WHERE legal_hold_state = 'held';

CREATE TABLE workflow.workflow_reconciliation_outbox_events (
  event_id uuid PRIMARY KEY,
  reconciliation_id uuid NOT NULL,
  identity_digest_algorithm text NOT NULL,
  identity_digest_version integer NOT NULL,
  identity_digest bytea NOT NULL,
  tenant_digest bytea NOT NULL,
  event_type text NOT NULL,
  payload_version integer NOT NULL,
  safe_payload jsonb NOT NULL,
  delivery_state text NOT NULL,
  attempt integer NOT NULL DEFAULT 0,
  next_eligible_at timestamptz NOT NULL,
  claim_owner_digest bytea,
  fencing_revision bigint NOT NULL DEFAULT 0,
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  safe_failure_class text,
  revision bigint NOT NULL DEFAULT 0,
  retention_class text NOT NULL,
  deletion_state text NOT NULL DEFAULT 'active',
  legal_hold_state text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT workflow_reconciliation_outbox_events_request_fk FOREIGN KEY (reconciliation_id)
    REFERENCES workflow.workflow_reconciliation_requests (reconciliation_id) ON DELETE RESTRICT,
  CONSTRAINT workflow_reconciliation_outbox_events_identity_uq UNIQUE
    (identity_digest_algorithm, identity_digest_version, identity_digest, tenant_digest),
  CONSTRAINT workflow_reconciliation_outbox_events_digest_ck CHECK (
    identity_digest_algorithm IN ('sha256', 'hmac-sha256')
    AND identity_digest_version = 1
    AND octet_length(identity_digest) = 32
    AND octet_length(tenant_digest) = 32
    AND (claim_owner_digest IS NULL OR octet_length(claim_owner_digest) = 32)
  ),
  CONSTRAINT workflow_reconciliation_outbox_events_type_ck CHECK (
    event_type ~ '^[a-z][a-z0-9.-]{0,127}$'
  ),
  CONSTRAINT workflow_reconciliation_outbox_events_payload_ck CHECK (
    payload_version = 1
    AND jsonb_typeof(safe_payload) = 'object'
    AND octet_length(safe_payload::text) <= 32768
  ),
  CONSTRAINT workflow_reconciliation_outbox_events_state_ck CHECK (delivery_state IN (
    'pending', 'claimed', 'delivered', 'reconciliation-required'
  )),
  CONSTRAINT workflow_reconciliation_outbox_events_delivery_ck CHECK (
    (delivery_state = 'pending' AND claim_owner_digest IS NULL AND lease_expires_at IS NULL AND delivered_at IS NULL AND safe_failure_class IS NULL)
    OR (delivery_state = 'claimed' AND claim_owner_digest IS NOT NULL AND lease_expires_at IS NOT NULL AND delivered_at IS NULL AND safe_failure_class IS NULL)
    OR (delivery_state = 'delivered' AND claim_owner_digest IS NULL AND lease_expires_at IS NULL AND delivered_at IS NOT NULL AND safe_failure_class IS NULL)
    OR (delivery_state = 'reconciliation-required' AND delivered_at IS NULL AND safe_failure_class ~ '^[a-z][a-z0-9-]{0,127}$')
  ),
  CONSTRAINT workflow_reconciliation_outbox_events_revision_ck CHECK (
    attempt >= 0 AND fencing_revision >= 0 AND revision >= 0
  ),
  CONSTRAINT workflow_reconciliation_outbox_events_time_ck CHECK (
    created_at <= updated_at
    AND created_at <= next_eligible_at
    AND (lease_expires_at IS NULL OR updated_at < lease_expires_at)
    AND (delivered_at IS NULL OR created_at <= delivered_at)
  ),
  CONSTRAINT workflow_reconciliation_outbox_events_retention_ck CHECK (retention_class IN (
    'reconciliation-standard', 'reconciliation-extended',
    'reconciliation-manual-repair', 'reconciliation-legal-hold',
    'reconciliation-corrupted', 'reconciliation-security-review'
  )),
  CONSTRAINT workflow_reconciliation_outbox_events_lifecycle_ck CHECK (
    deletion_state IN ('active', 'deletion-pending', 'deleted')
    AND legal_hold_state IN ('none', 'held')
    AND NOT (deletion_state = 'deleted' AND legal_hold_state = 'held')
  )
);

CREATE INDEX workflow_reconciliation_outbox_events_claim_idx
  ON workflow.workflow_reconciliation_outbox_events (next_eligible_at, event_id)
  WHERE delivery_state IN ('pending', 'reconciliation-required');

CREATE INDEX workflow_reconciliation_outbox_events_takeover_idx
  ON workflow.workflow_reconciliation_outbox_events (lease_expires_at, event_id)
  WHERE delivery_state = 'claimed';

CREATE INDEX workflow_reconciliation_outbox_events_request_idx
  ON workflow.workflow_reconciliation_outbox_events (reconciliation_id, created_at);

CREATE INDEX workflow_reconciliation_outbox_events_retention_idx
  ON workflow.workflow_reconciliation_outbox_events (retention_class, deletion_state, updated_at);

UPDATE workflow.workflow_schema_metadata
SET schema_contract_minor = 1,
    migration_head_identifier = 'V000002',
    updated_at = transaction_timestamp()
WHERE metadata_key = 'slice-a'
  AND schema_contract_major = 1
  AND schema_contract_minor = 0
  AND migration_head_identifier = 'V000001'
  AND migration_history_owner = 'flyway_schema_history';
