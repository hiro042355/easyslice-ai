-- Y51 separates a deterministic simulation receipt from a real remote publication.
-- This is additive and preserves the Y50 state machine: `PUBLISHED_PRIVATE` remains the
-- durable terminal state, while verification_state records whether anything was actually
-- observed at YouTube. The default is deliberately unknown, never verified.
--
-- Backfill only rows whose existing receipt explicitly says NOT_VERIFIED and whose
-- provider evidence is the Y50 fake marker. No historical row is upgraded to VERIFIED.

ALTER TABLE workflow.publication_intents
  ADD COLUMN verification_state text NOT NULL DEFAULT 'REMOTE_STATE_UNKNOWN',
  ADD COLUMN transport_kind text NOT NULL DEFAULT 'NONE';

ALTER TABLE workflow.publication_intents
  ADD CONSTRAINT publication_intents_verification_state_ck CHECK (
    verification_state IN (
      'SIMULATION_COMPLETED',
      'UPLOAD_ACCEPTED',
      'REMOTE_PUBLICATION_VERIFIED',
      'REMOTE_PUBLICATION_FAILED',
      'REMOTE_STATE_UNKNOWN'
    )
  ),
  ADD CONSTRAINT publication_intents_transport_kind_ck CHECK (
    transport_kind IN ('NONE', 'FAKE_DETERMINISTIC', 'REAL_YOUTUBE')
  ),
  ADD CONSTRAINT publication_intents_simulation_ck CHECK (
    verification_state <> 'SIMULATION_COMPLETED'
    OR (transport_kind = 'FAKE_DETERMINISTIC'
        AND receipt IS NOT NULL
        AND receipt->>'verification' = 'NOT_VERIFIED')
  ),
  ADD CONSTRAINT publication_intents_remote_verified_ck CHECK (
    verification_state <> 'REMOTE_PUBLICATION_VERIFIED'
    OR (transport_kind = 'REAL_YOUTUBE'
        AND receipt IS NOT NULL
        AND receipt->>'verification' = 'VERIFIED')
  );

UPDATE workflow.publication_intents
SET verification_state = 'SIMULATION_COMPLETED',
    transport_kind = 'FAKE_DETERMINISTIC',
    updated_at = transaction_timestamp()
WHERE state = 'PUBLISHED_PRIVATE'
  AND receipt IS NOT NULL
  AND receipt->>'verification' = 'NOT_VERIFIED'
  AND receipt->>'providerEvidenceRef' LIKE 'FAKE_DETERMINISTIC:%';

UPDATE workflow.workflow_schema_metadata
SET migration_head_identifier = 'V000028',
    updated_at = transaction_timestamp()
WHERE metadata_key = 'slice-a'
  AND schema_contract_major = 1
  AND migration_head_identifier = 'V000027'
  AND migration_history_owner = 'flyway_schema_history';
