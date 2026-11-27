-- TikTok publication admission.
--
-- Widens the durable publication inbox so a TikTok intent can be persisted next to
-- the existing YouTube rows without rewriting them. Nothing is dropped or deleted:
-- the three destination constraints are recreated with a strict superset so every
-- stored YouTube row still satisfies them, and a new pairing constraint makes the
-- (platform, transport) combination explicit.
--
-- Numeric gap note: this chain applies V000001-V000009 followed by V000026-V000029
-- and this migration. The versions in between belong to unrelated slices that are
-- not part of this branch; the V000026/V000027/V000028 head updates are therefore
-- no-ops here and this migration only advances the head when its real predecessor is
-- present. Forward-only: re-running Flyway validate/migrate changes nothing.

ALTER TABLE workflow.publication_intents
  DROP CONSTRAINT publication_intents_platform_ck;

ALTER TABLE workflow.publication_intents
  ADD CONSTRAINT publication_intents_platform_ck CHECK (platform IN ('youtube', 'tiktok'));

ALTER TABLE workflow.publication_intents
  DROP CONSTRAINT publication_intents_transport_kind_ck;

ALTER TABLE workflow.publication_intents
  ADD CONSTRAINT publication_intents_transport_kind_ck CHECK (
    transport_kind IN ('NONE', 'FAKE_DETERMINISTIC', 'REAL_YOUTUBE', 'REAL_TIKTOK')
  );

ALTER TABLE workflow.publication_intents
  DROP CONSTRAINT publication_intents_remote_verified_ck;

-- A verified remote publication must name the transport of its own destination, so a
-- YouTube row can never claim a TikTok transport (and the reverse).
ALTER TABLE workflow.publication_intents
  ADD CONSTRAINT publication_intents_remote_verified_ck CHECK (
    verification_state <> 'REMOTE_PUBLICATION_VERIFIED'
    OR (transport_kind = CASE platform
          WHEN 'youtube' THEN 'REAL_YOUTUBE'
          WHEN 'tiktok' THEN 'REAL_TIKTOK'
        END
        AND receipt IS NOT NULL
        AND receipt->>'verification' = 'VERIFIED')
  ),
  ADD CONSTRAINT publication_intents_platform_transport_ck CHECK (
    (platform = 'youtube' AND transport_kind IN ('NONE', 'FAKE_DETERMINISTIC', 'REAL_YOUTUBE'))
    OR (platform = 'tiktok' AND transport_kind IN ('NONE', 'REAL_TIKTOK'))
  );

UPDATE workflow.workflow_schema_metadata
SET migration_head_identifier = 'V000035',
    updated_at = transaction_timestamp()
WHERE metadata_key = 'slice-a'
  AND schema_contract_major = 1
  AND migration_head_identifier = 'V000034'
  AND migration_history_owner = 'flyway_schema_history';
