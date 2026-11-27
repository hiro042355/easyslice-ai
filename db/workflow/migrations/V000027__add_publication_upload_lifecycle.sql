-- Y50 durable publication upload lifecycle.
-- Additive only: publication_intents/events are unchanged except for their
-- existing nullable projection columns. This store models resumable-upload
-- progress and receipts for a deterministic, non-network transport. It does not
-- grant provider authority and cannot dispatch a real YouTube request.

CREATE TABLE workflow.publication_upload_sessions (
  id uuid PRIMARY KEY,
  publication_id uuid NOT NULL,
  owner_uid text NOT NULL,
  attempt_id text NOT NULL,
  state text NOT NULL,
  transport_kind text NOT NULL DEFAULT 'FAKE_DETERMINISTIC',
  session_ref text NOT NULL,
  session_binding char(64) NOT NULL,
  total_bytes bigint NOT NULL,
  chunk_bytes integer NOT NULL,
  total_chunks integer NOT NULL,
  confirmed_chunks integer NOT NULL DEFAULT 0,
  confirmed_offset bigint NOT NULL DEFAULT 0,
  retry_count integer NOT NULL DEFAULT 0,
  last_error_code text,
  remote_video_id text,
  reconciliation_state text,
  receipt jsonb,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT publication_upload_sessions_publication_fk
    FOREIGN KEY (publication_id) REFERENCES workflow.publication_intents (id) ON DELETE CASCADE,
  CONSTRAINT publication_upload_sessions_publication_uq UNIQUE (publication_id),
  CONSTRAINT publication_upload_sessions_attempt_uq UNIQUE (attempt_id),
  CONSTRAINT publication_upload_sessions_state_ck CHECK (state IN (
    'CREATED', 'INITIALIZING', 'UPLOADING', 'RESUME_PENDING',
    'COMPLETED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'COMMIT_UNKNOWN'
  )),
  CONSTRAINT publication_upload_sessions_transport_ck CHECK (transport_kind = 'FAKE_DETERMINISTIC'),
  CONSTRAINT publication_upload_sessions_bytes_ck CHECK (total_bytes > 0),
  CONSTRAINT publication_upload_sessions_chunk_ck CHECK (chunk_bytes >= 262144 AND chunk_bytes % 262144 = 0),
  CONSTRAINT publication_upload_sessions_chunks_ck CHECK (
    total_chunks > 0 AND confirmed_chunks >= 0 AND confirmed_chunks <= total_chunks
  ),
  CONSTRAINT publication_upload_sessions_offset_ck CHECK (
    confirmed_offset >= 0 AND confirmed_offset <= total_bytes
  ),
  CONSTRAINT publication_upload_sessions_binding_ck CHECK (session_binding ~ '^[a-f0-9]{64}$'),
  CONSTRAINT publication_upload_sessions_revision_ck CHECK (revision > 0),
  CONSTRAINT publication_upload_sessions_retry_ck CHECK (retry_count >= 0)
);

CREATE INDEX publication_upload_sessions_owner_idx
  ON workflow.publication_upload_sessions (owner_uid, updated_at DESC);

CREATE INDEX publication_upload_sessions_state_idx
  ON workflow.publication_upload_sessions (state, updated_at DESC);

CREATE TABLE workflow.publication_upload_chunks (
  session_id uuid NOT NULL REFERENCES workflow.publication_upload_sessions (id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  byte_offset bigint NOT NULL,
  byte_length integer NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  confirmed_at timestamptz,
  PRIMARY KEY (session_id, chunk_index),
  CONSTRAINT publication_upload_chunks_index_ck CHECK (chunk_index >= 0),
  CONSTRAINT publication_upload_chunks_offset_ck CHECK (byte_offset >= 0),
  CONSTRAINT publication_upload_chunks_length_ck CHECK (byte_length > 0),
  CONSTRAINT publication_upload_chunks_status_ck CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED')),
  CONSTRAINT publication_upload_chunks_attempts_ck CHECK (attempts >= 0)
);

CREATE INDEX publication_upload_chunks_status_idx
  ON workflow.publication_upload_chunks (session_id, status, chunk_index);

UPDATE workflow.workflow_schema_metadata
SET migration_head_identifier = 'V000027',
    updated_at = transaction_timestamp()
WHERE metadata_key = 'slice-a'
  AND schema_contract_major = 1
  AND migration_head_identifier = 'V000026'
  AND migration_history_owner = 'flyway_schema_history';
