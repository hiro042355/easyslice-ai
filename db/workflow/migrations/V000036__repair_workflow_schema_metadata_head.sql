-- Publication Foundation V1 - schema metadata head repair
-- Compatibility: reader 1..1, writer 1..1 (metadata only; no catalog change)
-- Transactional: yes
-- Direction: forward-only
--
-- V000026..V000029 and V000035 advanced `migration_head_identifier` only when the
-- previous version was present (`V000025`, `V000034`). Those versions were never
-- allocated, so every head update since V000002 was a no-op and the singleton row
-- still claimed `V000002` after the chain had been applied.
--
-- The column states which migration the durable workflow schema corresponds to, so
-- it must name the highest applied SQL version. This migration repairs an existing
-- database without editing any earlier file (Flyway checksums stay valid) and is a
-- no-op on a database that is already at or beyond this head.
--
-- Deliberately not done here:
--   * the never-allocated version numbers (V000010..V000025, V000030..V000034) are
--     not back-filled; a gap is not a missing migration and inventing files for them
--     would invent history;
--   * `schema_contract_major`/`schema_contract_minor` are untouched: the published
--     schema contract did not change, only the identifier of the applied chain.

UPDATE workflow.workflow_schema_metadata
SET migration_head_identifier = 'V000036',
    updated_at = transaction_timestamp()
WHERE metadata_key = 'slice-a'
  AND schema_contract_major = 1
  AND migration_history_owner = 'flyway_schema_history'
  AND migration_head_identifier < 'V000036';
