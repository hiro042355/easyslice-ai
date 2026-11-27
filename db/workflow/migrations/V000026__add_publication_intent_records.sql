-- Y49 durable publication inbox.
-- Reuses the existing publicationBoundary data contract; this migration only adds
-- persistence and an auditable state log. No provider dispatch is introduced.
-- Forward-only. Migration 001-025 are not modified.

CREATE TABLE workflow.publication_intents (
  id uuid PRIMARY KEY,
  owner_uid text NOT NULL,
  tenant_id text NOT NULL,
  state text NOT NULL,
  platform text NOT NULL,
  content_format text NOT NULL,
  operation_id text NOT NULL,
  idempotency_key text NOT NULL,
  asset_id text NOT NULL,
  asset_revision_id text NOT NULL,
  media_digest char(64) NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  metadata_digest char(64) NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtitle_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  thumbnail_ref text,
  channel_id text,
  rights_evidence_ref text,
  privacy_status text NOT NULL DEFAULT 'private',
  revision bigint NOT NULL DEFAULT 1,
  upload_session jsonb,
  remote_video_id text,
  remote_processing_status text,
  reconciliation_state text,
  last_error text,
  receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT publication_intents_state_ck CHECK (state IN (
    'DRAFT', 'VALIDATING', 'READY', 'AWAITING_CONFIRMATION', 'QUEUED',
    'UPLOADING', 'INTERRUPTED', 'RECONCILING', 'PUBLISHED_PRIVATE',
    'FAILED', 'CANCELLED'
  )),
  CONSTRAINT publication_intents_platform_ck CHECK (platform = 'youtube'),
  CONSTRAINT publication_intents_privacy_ck CHECK (privacy_status = 'private'),
  CONSTRAINT publication_intents_size_ck CHECK (size_bytes > 0),
  CONSTRAINT publication_intents_media_digest_ck CHECK (media_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT publication_intents_metadata_digest_ck CHECK (metadata_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT publication_intents_mime_ck CHECK (mime_type ~ '^video/[A-Za-z0-9.+-]+$'),
  CONSTRAINT publication_intents_identity_uq UNIQUE (owner_uid, idempotency_key)
);

CREATE INDEX publication_intents_owner_created_idx
  ON workflow.publication_intents (owner_uid, created_at DESC);

CREATE INDEX publication_intents_owner_state_idx
  ON workflow.publication_intents (owner_uid, state, updated_at DESC);

CREATE TABLE workflow.publication_events (
  event_id bigserial PRIMARY KEY,
  publication_id uuid NOT NULL REFERENCES workflow.publication_intents (id) ON DELETE CASCADE,
  owner_uid text NOT NULL,
  to_state text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT publication_events_to_state_ck CHECK (to_state IN (
    'DRAFT', 'VALIDATING', 'READY', 'AWAITING_CONFIRMATION', 'QUEUED',
    'UPLOADING', 'INTERRUPTED', 'RECONCILING', 'PUBLISHED_PRIVATE',
    'FAILED', 'CANCELLED'
  ))
);

CREATE INDEX publication_events_owner_publication_idx
  ON workflow.publication_events (owner_uid, publication_id, event_id);

UPDATE workflow.workflow_schema_metadata
SET migration_head_identifier = 'V000026',
    updated_at = transaction_timestamp()
WHERE metadata_key = 'slice-a'
  AND schema_contract_major = 1
  AND migration_head_identifier = 'V000025'
  AND migration_history_owner = 'flyway_schema_history';
