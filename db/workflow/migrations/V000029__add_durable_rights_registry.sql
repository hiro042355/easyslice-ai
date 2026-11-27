-- Y52 durable rights registry.
-- Existing commonVideo/videoSource rights decisions remain the domain vocabulary. This
-- migration makes the evidence durable, revisioned and owner-scoped; it does not turn a
-- public URL, provider name or a prior boolean into legal authority.

CREATE TABLE workflow.rights_evidence (
  id uuid PRIMARY KEY,
  rights_key text NOT NULL,
  owner_uid text NOT NULL,
  tenant_id text NOT NULL,
  source_id text NOT NULL,
  asset_id text,
  license_kind text NOT NULL,
  license_ref text NOT NULL,
  evidence_ref text NOT NULL,
  evidence_digest char(64) NOT NULL,
  permitted_usage jsonb NOT NULL,
  platform_permissions jsonb NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  effective_at timestamptz NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  revision bigint NOT NULL,
  supersedes_id uuid REFERENCES workflow.rights_evidence (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT rights_evidence_identity_uq UNIQUE (owner_uid, rights_key, revision),
  CONSTRAINT rights_evidence_license_kind_ck CHECK (license_kind IN (
    'OWNED', 'LICENSED', 'AI_GENERATED', 'OFFICIAL_API_LICENSE', 'ALLOWED_STORAGE'
  )),
  CONSTRAINT rights_evidence_status_ck CHECK (status IN (
    'ACTIVE', 'REVOKED', 'EXPIRED', 'SUPERSEDED'
  )),
  CONSTRAINT rights_evidence_digest_ck CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT rights_evidence_revision_ck CHECK (revision > 0),
  CONSTRAINT rights_evidence_effective_ck CHECK (expires_at IS NULL OR expires_at > effective_at),
  CONSTRAINT rights_evidence_revocation_ck CHECK (
    (status = 'REVOKED' AND revoked_at IS NOT NULL)
    OR (status <> 'REVOKED' AND revoked_at IS NULL)
  ),
  CONSTRAINT rights_evidence_usage_ck CHECK (
    jsonb_typeof(permitted_usage) = 'array' AND jsonb_array_length(permitted_usage) > 0
  ),
  CONSTRAINT rights_evidence_permissions_ck CHECK (
    jsonb_typeof(platform_permissions) = 'array' AND jsonb_array_length(platform_permissions) > 0
  )
);

CREATE INDEX rights_evidence_owner_key_revision_idx
  ON workflow.rights_evidence (owner_uid, rights_key, revision DESC);

CREATE INDEX rights_evidence_owner_asset_idx
  ON workflow.rights_evidence (owner_uid, asset_id, revision DESC);

CREATE TABLE workflow.rights_audit_events (
  event_id bigserial PRIMARY KEY,
  rights_id uuid NOT NULL REFERENCES workflow.rights_evidence (id) ON DELETE RESTRICT,
  owner_uid text NOT NULL,
  tenant_id text NOT NULL,
  action text NOT NULL,
  revision bigint NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT rights_audit_events_action_ck CHECK (action IN (
    'CREATED', 'REVISED', 'REVOKED', 'REVALIDATED'
  )),
  CONSTRAINT rights_audit_events_revision_ck CHECK (revision > 0)
);

CREATE INDEX rights_audit_events_rights_idx
  ON workflow.rights_audit_events (rights_id, event_id);

ALTER TABLE workflow.publication_intents
  ADD COLUMN rights_record_id uuid,
  ADD COLUMN rights_revision bigint,
  ADD COLUMN rights_snapshot jsonb;

ALTER TABLE workflow.publication_intents
  ADD CONSTRAINT publication_intents_rights_record_fk
    FOREIGN KEY (rights_record_id) REFERENCES workflow.rights_evidence (id) ON DELETE RESTRICT,
  ADD CONSTRAINT publication_intents_rights_snapshot_ck CHECK (
    (rights_record_id IS NULL AND rights_revision IS NULL AND rights_snapshot IS NULL)
    OR (rights_record_id IS NOT NULL AND rights_revision > 0 AND rights_snapshot IS NOT NULL)
  );

CREATE INDEX publication_intents_rights_record_idx
  ON workflow.publication_intents (rights_record_id);

UPDATE workflow.workflow_schema_metadata
SET migration_head_identifier = 'V000029',
    updated_at = transaction_timestamp()
WHERE metadata_key = 'slice-a'
  AND schema_contract_major = 1
  AND migration_head_identifier = 'V000028'
  AND migration_history_owner = 'flyway_schema_history';
