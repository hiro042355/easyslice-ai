-- Production Workflow API durable CSRF authority V1
-- Forward-only and transactional. Raw CSRF tokens and secrets are never persisted.

CREATE TABLE workflow.production_workflow_api_csrf_tokens (
  token_id bytea PRIMARY KEY,
  session_id text NOT NULL,
  digest_algorithm text NOT NULL,
  digest_version text NOT NULL,
  digest bytea NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  lifecycle_state text NOT NULL,
  revoked_at timestamptz,
  revision bigint NOT NULL DEFAULT 0,
  CONSTRAINT ck_production_workflow_api_csrf_token_id CHECK (octet_length(token_id) = 16),
  CONSTRAINT ck_production_workflow_api_csrf_session_id CHECK (length(session_id) > 0),
  CONSTRAINT ck_production_workflow_api_csrf_digest CHECK (
    digest_algorithm = 'sha256'
    AND digest_version = 'csrf-digest-v1'
    AND octet_length(digest) = 32
  ),
  CONSTRAINT ck_production_workflow_api_csrf_time CHECK (
    issued_at < expires_at
    AND expires_at <= issued_at + interval '30 minutes'
    AND (revoked_at IS NULL OR revoked_at >= issued_at)
  ),
  CONSTRAINT ck_production_workflow_api_csrf_lifecycle CHECK (
    (lifecycle_state = 'active' AND revoked_at IS NULL)
    OR (lifecycle_state = 'revoked' AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT ck_production_workflow_api_csrf_revision CHECK (revision >= 0)
);

CREATE INDEX ix_production_workflow_api_csrf_tokens_active_session
  ON workflow.production_workflow_api_csrf_tokens (session_id, issued_at, token_id)
  WHERE lifecycle_state = 'active';
