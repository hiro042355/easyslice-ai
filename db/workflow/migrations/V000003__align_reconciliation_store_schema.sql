-- Reconciliation Store Schema Alignment Foundation V1
-- Forward-only, transactional, legacy-compatible, no metadata backfill

ALTER TABLE workflow.workflow_reconciliation_requests
  ADD COLUMN identity_digest_domain text,
  ADD COLUMN tenant_digest_domain text,
  ADD COLUMN tenant_digest_algorithm text,
  ADD COLUMN tenant_digest_version integer,
  ADD COLUMN workflow_digest_domain text,
  ADD COLUMN workflow_digest_algorithm text,
  ADD COLUMN workflow_digest_version integer,
  ADD COLUMN provider_request_digest_domain text,
  ADD COLUMN provider_request_digest_algorithm text,
  ADD COLUMN provider_request_digest_version integer,
  ADD COLUMN provider_request_digest bytea,
  ADD COLUMN provider_job_digest_domain text,
  ADD COLUMN provider_job_digest_algorithm text,
  ADD COLUMN provider_job_digest_version integer,
  ADD COLUMN provider_job_digest bytea,
  ADD COLUMN claim_owner_digest_domain text,
  ADD COLUMN claim_owner_digest_algorithm text,
  ADD COLUMN claim_owner_digest_version integer,
  ADD COLUMN semantic_fingerprint_domain text,
  ADD COLUMN semantic_fingerprint_algorithm text,
  ADD COLUMN semantic_fingerprint_algorithm_version integer,
  ADD COLUMN semantic_fingerprint_digest bytea,
  ADD CONSTRAINT workflow_reconciliation_requests_alignment_identity_ck CHECK (COALESCE((
    (identity_digest_domain IS NULL OR (
      identity_digest_domain = 'reconciliation-request'
      AND identity_digest_algorithm = 'hmac-sha256'
      AND identity_digest_version > 0
      AND octet_length(identity_digest) = 32
    ))
    AND ((tenant_digest_domain IS NULL AND tenant_digest_algorithm IS NULL AND tenant_digest_version IS NULL) OR (
      tenant_digest_domain = 'tenant' AND tenant_digest_algorithm = 'hmac-sha256'
      AND tenant_digest_version > 0 AND octet_length(tenant_digest) = 32
    ))
    AND ((workflow_digest_domain IS NULL AND workflow_digest_algorithm IS NULL AND workflow_digest_version IS NULL) OR (
      workflow_digest_domain = 'workflow' AND workflow_digest_algorithm = 'hmac-sha256'
      AND workflow_digest_version > 0 AND octet_length(workflow_digest) = 32
    ))
    AND ((provider_request_digest_domain IS NULL AND provider_request_digest_algorithm IS NULL AND provider_request_digest_version IS NULL AND provider_request_digest IS NULL) OR (
      provider_request_digest_domain = 'provider-request' AND provider_request_digest_algorithm = 'hmac-sha256'
      AND provider_request_digest_version > 0 AND octet_length(provider_request_digest) = 32
    ))
    AND ((provider_job_digest_domain IS NULL AND provider_job_digest_algorithm IS NULL AND provider_job_digest_version IS NULL AND provider_job_digest IS NULL) OR (
      provider_job_digest_domain = 'provider-job' AND provider_job_digest_algorithm = 'hmac-sha256'
      AND provider_job_digest_version > 0 AND octet_length(provider_job_digest) = 32
    ))
    AND ((claim_owner_digest_domain IS NULL AND claim_owner_digest_algorithm IS NULL AND claim_owner_digest_version IS NULL AND claim_owner_digest IS NULL) OR (
      claim_owner_digest_domain = 'claim-owner' AND claim_owner_digest_algorithm = 'hmac-sha256'
      AND claim_owner_digest_version > 0 AND octet_length(claim_owner_digest) = 32
    ))
  ), false)),
  ADD CONSTRAINT workflow_reconciliation_requests_fingerprint_ck CHECK (COALESCE((
    (semantic_fingerprint_domain IS NULL AND semantic_fingerprint_algorithm IS NULL
      AND semantic_fingerprint_algorithm_version IS NULL AND semantic_fingerprint_digest IS NULL)
    OR (semantic_fingerprint_domain = 'reconciliation-request-semantic'
      AND semantic_fingerprint_algorithm = 'hmac-sha256'
      AND semantic_fingerprint_algorithm_version > 0
      AND octet_length(semantic_fingerprint_digest) = 32)
  ), false));

ALTER TABLE workflow.workflow_reconciliation_observations
  ADD COLUMN identity_digest_domain text,
  ADD COLUMN tenant_digest_domain text,
  ADD COLUMN tenant_digest_algorithm text,
  ADD COLUMN tenant_digest_version integer,
  ADD COLUMN semantic_fingerprint_domain text,
  ADD COLUMN semantic_fingerprint_algorithm text,
  ADD COLUMN semantic_fingerprint_algorithm_version integer,
  ADD COLUMN semantic_fingerprint_digest bytea,
  ADD CONSTRAINT workflow_reconciliation_observations_alignment_identity_ck CHECK (COALESCE((
    (identity_digest_domain IS NULL OR (
      identity_digest_domain = 'observation' AND identity_digest_algorithm = 'hmac-sha256'
      AND identity_digest_version > 0 AND octet_length(identity_digest) = 32
    ))
    AND ((tenant_digest_domain IS NULL AND tenant_digest_algorithm IS NULL AND tenant_digest_version IS NULL) OR (
      tenant_digest_domain = 'tenant' AND tenant_digest_algorithm = 'hmac-sha256'
      AND tenant_digest_version > 0 AND octet_length(tenant_digest) = 32
    ))
  ), false)),
  ADD CONSTRAINT workflow_reconciliation_observations_fingerprint_ck CHECK (COALESCE((
    (semantic_fingerprint_domain IS NULL AND semantic_fingerprint_algorithm IS NULL
      AND semantic_fingerprint_algorithm_version IS NULL AND semantic_fingerprint_digest IS NULL)
    OR (semantic_fingerprint_domain = 'observation-semantic'
      AND semantic_fingerprint_algorithm = 'hmac-sha256'
      AND semantic_fingerprint_algorithm_version > 0
      AND octet_length(semantic_fingerprint_digest) = 32)
  ), false));

ALTER TABLE workflow.workflow_reconciliation_resolutions
  ADD COLUMN identity_digest_domain text,
  ADD COLUMN tenant_digest_domain text,
  ADD COLUMN tenant_digest_algorithm text,
  ADD COLUMN tenant_digest_version integer,
  ADD COLUMN semantic_fingerprint_domain text,
  ADD COLUMN semantic_fingerprint_algorithm text,
  ADD COLUMN semantic_fingerprint_algorithm_version integer,
  ADD COLUMN semantic_fingerprint_digest bytea,
  ADD CONSTRAINT workflow_reconciliation_resolutions_alignment_identity_ck CHECK (COALESCE((
    (identity_digest_domain IS NULL OR (
      identity_digest_domain = 'resolution' AND identity_digest_algorithm = 'hmac-sha256'
      AND identity_digest_version > 0 AND octet_length(identity_digest) = 32
    ))
    AND ((tenant_digest_domain IS NULL AND tenant_digest_algorithm IS NULL AND tenant_digest_version IS NULL) OR (
      tenant_digest_domain = 'tenant' AND tenant_digest_algorithm = 'hmac-sha256'
      AND tenant_digest_version > 0 AND octet_length(tenant_digest) = 32
    ))
  ), false)),
  ADD CONSTRAINT workflow_reconciliation_resolutions_fingerprint_ck CHECK (COALESCE((
    (semantic_fingerprint_domain IS NULL AND semantic_fingerprint_algorithm IS NULL
      AND semantic_fingerprint_algorithm_version IS NULL AND semantic_fingerprint_digest IS NULL)
    OR (semantic_fingerprint_domain = 'resolution-semantic'
      AND semantic_fingerprint_algorithm = 'hmac-sha256'
      AND semantic_fingerprint_algorithm_version > 0
      AND octet_length(semantic_fingerprint_digest) = 32)
  ), false));

ALTER TABLE workflow.workflow_reconciliation_manual_repairs
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN identity_digest_domain text,
  ADD COLUMN tenant_digest_domain text,
  ADD COLUMN tenant_digest_algorithm text,
  ADD COLUMN tenant_digest_version integer,
  ADD COLUMN requester_subject_digest_domain text,
  ADD COLUMN requester_subject_digest_algorithm text,
  ADD COLUMN requester_subject_digest_version integer,
  ADD COLUMN approver_subject_digest_domain text,
  ADD COLUMN approver_subject_digest_algorithm text,
  ADD COLUMN approver_subject_digest_version integer,
  ADD COLUMN authorization_decision_reference_digest_domain text,
  ADD COLUMN authorization_decision_reference_digest_algorithm text,
  ADD COLUMN authorization_decision_reference_digest_version integer,
  ADD COLUMN approval_decision_reference_digest_domain text,
  ADD COLUMN approval_decision_reference_digest_algorithm text,
  ADD COLUMN approval_decision_reference_digest_version integer,
  ADD COLUMN claim_owner_digest_domain text,
  ADD COLUMN claim_owner_digest_algorithm text,
  ADD COLUMN claim_owner_digest_version integer,
  ADD COLUMN claim_owner_digest bytea,
  ADD COLUMN fencing_revision bigint,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN writer_epoch bigint,
  ADD COLUMN semantic_fingerprint_domain text,
  ADD COLUMN semantic_fingerprint_algorithm text,
  ADD COLUMN semantic_fingerprint_algorithm_version integer,
  ADD COLUMN semantic_fingerprint_digest bytea,
  ADD CONSTRAINT workflow_reconciliation_manual_repairs_alignment_identity_ck CHECK (COALESCE((
    (identity_digest_domain IS NULL OR (
      identity_digest_domain = 'manual-repair' AND identity_digest_algorithm = 'hmac-sha256'
      AND identity_digest_version > 0 AND octet_length(identity_digest) = 32
    ))
    AND ((tenant_digest_domain IS NULL AND tenant_digest_algorithm IS NULL AND tenant_digest_version IS NULL) OR (
      tenant_digest_domain = 'tenant' AND tenant_digest_algorithm = 'hmac-sha256'
      AND tenant_digest_version > 0 AND octet_length(tenant_digest) = 32
    ))
    AND ((requester_subject_digest_domain IS NULL AND requester_subject_digest_algorithm IS NULL AND requester_subject_digest_version IS NULL) OR (
      requester_subject_digest_domain = 'operator-subject' AND requester_subject_digest_algorithm = 'hmac-sha256'
      AND requester_subject_digest_version > 0 AND octet_length(requester_subject_digest) = 32
    ))
    AND ((approver_subject_digest_domain IS NULL AND approver_subject_digest_algorithm IS NULL AND approver_subject_digest_version IS NULL AND approver_subject_digest IS NULL) OR (
      approver_subject_digest_domain = 'operator-subject' AND approver_subject_digest_algorithm = 'hmac-sha256'
      AND approver_subject_digest_version > 0 AND octet_length(approver_subject_digest) = 32
    ))
    AND ((authorization_decision_reference_digest_domain IS NULL AND authorization_decision_reference_digest_algorithm IS NULL AND authorization_decision_reference_digest_version IS NULL) OR (
      authorization_decision_reference_digest_domain = 'authorization-decision'
      AND authorization_decision_reference_digest_algorithm = 'hmac-sha256'
      AND authorization_decision_reference_digest_version > 0
      AND octet_length(authorization_decision_reference_digest) = 32
    ))
    AND ((approval_decision_reference_digest_domain IS NULL AND approval_decision_reference_digest_algorithm IS NULL AND approval_decision_reference_digest_version IS NULL AND approval_decision_reference_digest IS NULL) OR (
      approval_decision_reference_digest_domain = 'approval-decision'
      AND approval_decision_reference_digest_algorithm = 'hmac-sha256'
      AND approval_decision_reference_digest_version > 0
      AND octet_length(approval_decision_reference_digest) = 32
    ))
    AND ((claim_owner_digest_domain IS NULL AND claim_owner_digest_algorithm IS NULL AND claim_owner_digest_version IS NULL AND claim_owner_digest IS NULL AND lease_expires_at IS NULL) OR (
      claim_owner_digest_domain = 'claim-owner' AND claim_owner_digest_algorithm = 'hmac-sha256'
      AND claim_owner_digest_version > 0 AND octet_length(claim_owner_digest) = 32
      AND lease_expires_at IS NOT NULL
    ))
  ), false)),
  ADD CONSTRAINT workflow_reconciliation_manual_repairs_fingerprint_ck CHECK (COALESCE((
    (semantic_fingerprint_domain IS NULL AND semantic_fingerprint_algorithm IS NULL
      AND semantic_fingerprint_algorithm_version IS NULL AND semantic_fingerprint_digest IS NULL)
    OR (semantic_fingerprint_domain = 'manual-repair-semantic'
      AND semantic_fingerprint_algorithm = 'hmac-sha256'
      AND semantic_fingerprint_algorithm_version > 0
      AND octet_length(semantic_fingerprint_digest) = 32)
  ), false)),
  ADD CONSTRAINT workflow_reconciliation_manual_repairs_writer_fence_ck CHECK (
    revision >= 0 AND (writer_epoch IS NULL OR writer_epoch >= 0)
      AND (fencing_revision IS NULL OR fencing_revision >= 0)
  );

DO $migration_precondition$
BEGIN
  IF EXISTS (
    SELECT 1 FROM workflow.workflow_reconciliation_manual_repairs
    WHERE state NOT IN (
      'requested', 'authorized', 'rejected', 'executing', 'reconciled',
      'deferred', 'terminal-safe-failure'
    ) OR cancelled_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'manual-repair-constraint-precondition-failed';
  END IF;
END
$migration_precondition$;

ALTER TABLE workflow.workflow_reconciliation_manual_repairs
  DROP CONSTRAINT workflow_reconciliation_manual_repairs_state_ck,
  ADD CONSTRAINT workflow_reconciliation_manual_repairs_state_ck CHECK (state IN (
    'requested', 'authorized', 'rejected', 'executing', 'reconciled',
    'deferred', 'terminal-safe-failure', 'cancelled'
  )),
  DROP CONSTRAINT workflow_reconciliation_manual_repairs_state_time_ck,
  ADD CONSTRAINT workflow_reconciliation_manual_repairs_state_time_ck CHECK (
    (state = 'requested' AND approved_at IS NULL AND started_at IS NULL AND completed_at IS NULL AND cancelled_at IS NULL)
    OR (state IN ('authorized', 'rejected') AND approved_at IS NOT NULL AND started_at IS NULL AND completed_at IS NULL AND cancelled_at IS NULL)
    OR (state = 'executing' AND approved_at IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NULL AND cancelled_at IS NULL)
    OR (state IN ('reconciled', 'deferred', 'terminal-safe-failure') AND approved_at IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NOT NULL AND cancelled_at IS NULL)
    OR (state = 'cancelled' AND completed_at IS NULL AND cancelled_at IS NOT NULL
      AND requested_at <= cancelled_at
      AND (started_at IS NULL OR approved_at IS NOT NULL AND approved_at <= started_at)
      AND (approved_at IS NULL OR approved_at <= cancelled_at)
      AND (started_at IS NULL OR started_at <= cancelled_at))
  );

ALTER TABLE workflow.workflow_reconciliation_outbox_events
  ADD COLUMN identity_digest_domain text,
  ADD COLUMN tenant_digest_domain text,
  ADD COLUMN tenant_digest_algorithm text,
  ADD COLUMN tenant_digest_version integer,
  ADD COLUMN claim_owner_digest_domain text,
  ADD COLUMN claim_owner_digest_algorithm text,
  ADD COLUMN claim_owner_digest_version integer,
  ADD COLUMN semantic_fingerprint_domain text,
  ADD COLUMN semantic_fingerprint_algorithm text,
  ADD COLUMN semantic_fingerprint_algorithm_version integer,
  ADD COLUMN semantic_fingerprint_digest bytea,
  ADD CONSTRAINT workflow_reconciliation_outbox_events_alignment_identity_ck CHECK (COALESCE((
    (identity_digest_domain IS NULL OR (
      identity_digest_domain = 'reconciliation-outbox' AND identity_digest_algorithm = 'hmac-sha256'
      AND identity_digest_version > 0 AND octet_length(identity_digest) = 32
    ))
    AND ((tenant_digest_domain IS NULL AND tenant_digest_algorithm IS NULL AND tenant_digest_version IS NULL) OR (
      tenant_digest_domain = 'tenant' AND tenant_digest_algorithm = 'hmac-sha256'
      AND tenant_digest_version > 0 AND octet_length(tenant_digest) = 32
    ))
    AND ((claim_owner_digest_domain IS NULL AND claim_owner_digest_algorithm IS NULL AND claim_owner_digest_version IS NULL AND claim_owner_digest IS NULL) OR (
      claim_owner_digest_domain = 'claim-owner' AND claim_owner_digest_algorithm = 'hmac-sha256'
      AND claim_owner_digest_version > 0 AND octet_length(claim_owner_digest) = 32
    ))
  ), false)),
  ADD CONSTRAINT workflow_reconciliation_outbox_events_fingerprint_ck CHECK (COALESCE((
    (semantic_fingerprint_domain IS NULL AND semantic_fingerprint_algorithm IS NULL
      AND semantic_fingerprint_algorithm_version IS NULL AND semantic_fingerprint_digest IS NULL)
    OR (semantic_fingerprint_domain = 'reconciliation-outbox-semantic'
      AND semantic_fingerprint_algorithm = 'hmac-sha256'
      AND semantic_fingerprint_algorithm_version > 0
      AND octet_length(semantic_fingerprint_digest) = 32)
  ), false));
