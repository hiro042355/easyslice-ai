CREATE TABLE workflow.asset_import_requests (
  owner_uid text NOT NULL,
  idempotency_key text NOT NULL,
  command_version text NOT NULL,
  request_fingerprint bytea NOT NULL,
  platform text NOT NULL,
  canonical_source_id text NOT NULL,
  normalized_url text NOT NULL,
  state text NOT NULL,
  job_id uuid,
  media_id uuid,
  duration_seconds double precision,
  failure_code text,
  retryable boolean,
  revision bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (owner_uid, idempotency_key),
  CONSTRAINT ck_asset_import_owner CHECK (length(owner_uid) > 0),
  CONSTRAINT ck_asset_import_key CHECK (idempotency_key ~ '^[A-Za-z0-9._~-]{1,128}$'),
  CONSTRAINT ck_asset_import_authority CHECK (command_version = '1.0' AND platform = 'youtube'),
  CONSTRAINT ck_asset_import_fingerprint CHECK (octet_length(request_fingerprint) = 32),
  CONSTRAINT ck_asset_import_state CHECK (state IN ('acquiring','succeeded','failed_retryable','failed_final','reconciliation_required')),
  CONSTRAINT ck_asset_import_lifecycle CHECK (
    (state IN ('acquiring','reconciliation_required') AND job_id IS NULL AND media_id IS NULL AND duration_seconds IS NULL AND failure_code IS NULL AND retryable IS NULL)
    OR (state = 'succeeded' AND job_id IS NOT NULL AND media_id IS NOT NULL AND duration_seconds > 0 AND failure_code IS NULL AND retryable IS NULL)
    OR (state = 'failed_retryable' AND job_id IS NULL AND media_id IS NULL AND duration_seconds IS NULL AND failure_code = 'acquisition_retryable' AND retryable IS TRUE)
    OR (state = 'failed_final' AND job_id IS NULL AND media_id IS NULL AND duration_seconds IS NULL AND failure_code IN ('acquisition_final','timeout') AND retryable IS FALSE)
  ),
  CONSTRAINT ck_asset_import_revision CHECK (revision >= 0)
);

ALTER TABLE workflow.jobs ADD CONSTRAINT uq_jobs_id_owner UNIQUE (id, owner_uid);
ALTER TABLE workflow.media ADD CONSTRAINT uq_media_id_job UNIQUE (id, job_id);
ALTER TABLE workflow.asset_import_requests ADD CONSTRAINT fk_asset_import_job_owner
  FOREIGN KEY (job_id, owner_uid) REFERENCES workflow.jobs(id, owner_uid) ON DELETE RESTRICT;
ALTER TABLE workflow.asset_import_requests ADD CONSTRAINT fk_asset_import_media_job
  FOREIGN KEY (media_id, job_id) REFERENCES workflow.media(id, job_id) ON DELETE RESTRICT;

CREATE INDEX ix_asset_import_state_updated ON workflow.asset_import_requests (state, updated_at);
