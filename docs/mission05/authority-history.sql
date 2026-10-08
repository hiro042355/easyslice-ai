-- PREPARED ONLY. Execute only if discovery/authority confirms THIS exact history relation.
-- workflow is repository configuration evidence, not authoritative Production evidence.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
SELECT count(*) AS total_history_rows FROM workflow.flyway_schema_history;
SELECT installed_rank,version,description,type,script,checksum,success
FROM workflow.flyway_schema_history ORDER BY installed_rank LIMIT 1001;
ROLLBACK;
-- If relation differs/missing, shape differs, rows exceed 1000, failed/future/out-of-order
-- history exists or identity/history authority is not independently confirmed: STOP.
-- Never repair, baseline, clean or modify history to make this report pass.
