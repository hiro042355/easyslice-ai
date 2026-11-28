-- Adapter call budget, dispatch lease and reconciliation evidence.
--
-- Three additive tables. Nothing existing is altered, no earlier file is edited and
-- no row is deleted, so Flyway checksums for V000001..V000036 stay valid.
--
--   * publication_adapter_rate_limits - fixed-window counters per (tenant, scope).
--     The window start comes from the database clock, so every Core instance sharing
--     this database consumes the same bucket. This is what makes the budget
--     distributed-safe; process memory alone would not be.
--   * publication_adapter_leases - per-tenant in-flight publication slots with an
--     expiry, so a crashed Core instance cannot hold a slot forever.
--   * publication_reconciliation_attempts - evidence log for OUTCOME_UNKNOWN
--     reconciliation. It records what the adapter answered and what Core concluded;
--     it is not a work queue and it never triggers a resend.
--
-- Numeric gap note: this chain applies V000001-V000009, V000026-V000029, V000035,
-- V000036 and this migration. The versions in between belong to unrelated slices, so
-- the head identifier is advanced only when the previous head is at or below
-- V000037; a database that is already at V000037 is untouched.

CREATE TABLE IF NOT EXISTS workflow.publication_adapter_rate_limits (
  tenant_id text NOT NULL,
  scope text NOT NULL,
  window_start timestamptz NOT NULL,
  consumed integer NOT NULL,
  PRIMARY KEY (tenant_id, scope, window_start),
  CONSTRAINT publication_adapter_rate_limits_scope_ck CHECK (scope IN ('PUBLISH', 'STATUS')),
  CONSTRAINT publication_adapter_rate_limits_consumed_ck CHECK (consumed >= 0)
);

CREATE TABLE IF NOT EXISTS workflow.publication_adapter_leases (
  tenant_id text NOT NULL,
  lease_id text NOT NULL,
  acquired_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, lease_id),
  CONSTRAINT publication_adapter_leases_id_ck CHECK (char_length(lease_id) BETWEEN 1 AND 256),
  CONSTRAINT publication_adapter_leases_window_ck CHECK (expires_at > acquired_at)
);

CREATE INDEX IF NOT EXISTS publication_adapter_leases_expiry_idx
  ON workflow.publication_adapter_leases (tenant_id, expires_at);

CREATE TABLE IF NOT EXISTS workflow.publication_reconciliation_attempts (
  publication_id uuid NOT NULL REFERENCES workflow.publication_intents (id) ON DELETE CASCADE,
  owner_uid text NOT NULL,
  attempt integer NOT NULL,
  adapter_state text NOT NULL,
  result text NOT NULL,
  error_category text,
  checked_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (publication_id, attempt),
  CONSTRAINT publication_reconciliation_attempts_attempt_ck CHECK (attempt > 0)
);

CREATE INDEX IF NOT EXISTS publication_reconciliation_attempts_checked_idx
  ON workflow.publication_reconciliation_attempts (publication_id, checked_at DESC);

UPDATE workflow.workflow_schema_metadata
SET migration_head_identifier = 'V000037',
    updated_at = transaction_timestamp()
WHERE metadata_key = 'slice-a'
  AND schema_contract_major = 1
  AND migration_history_owner = 'flyway_schema_history'
  AND migration_head_identifier < 'V000037';
