-- PREPARED ONLY. No Production connection/SQL execution is authorized by Mission 05.
-- Use only after independent approval fixes target and migrator identity.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
SELECT n.nspname AS schema_name,c.relname AS relation_name,c.relkind
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE c.relname='flyway_schema_history' ORDER BY n.nspname LIMIT 100;
SELECT table_schema,column_name,data_type,is_nullable
FROM information_schema.columns WHERE table_name='flyway_schema_history'
ORDER BY table_schema,ordinal_position LIMIT 100;
SELECT EXISTS(SELECT FROM pg_catalog.pg_namespace WHERE nspname='workflow') AS workflow_present,
 EXISTS(SELECT FROM pg_catalog.pg_namespace WHERE nspname='tiktok_oauth') AS candidate_schema_already_present;
ROLLBACK;
