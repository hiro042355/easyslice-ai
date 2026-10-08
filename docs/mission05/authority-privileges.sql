-- PREPARED ONLY. Read-only privilege evidence under the independently approved migrator.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
SELECT current_user=session_user AS direct_login,
 has_database_privilege(current_user,current_database(),'CONNECT') AS database_connect,
 has_database_privilege(current_user,current_database(),'CREATE') AS candidate_schema_create;
SELECT n.nspname,
 has_schema_privilege(current_user,n.oid,'USAGE') AS schema_usage,
 has_schema_privilege(current_user,n.oid,'CREATE') AS schema_create,
 pg_has_role(current_user,n.nspowner,'USAGE') AS owner_privileges_available
FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('workflow','tiktok_oauth');
SELECT c.relname,has_table_privilege(current_user,c.oid,'SELECT') AS history_readable,
 pg_has_role(current_user,c.relowner,'USAGE') AS history_owner_privileges_available
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='workflow' AND c.relname='flyway_schema_history';
SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_catalog.pg_roles WHERE rolname=current_user;
ROLLBACK;
-- These observations alone are not an authorization grant. Exact identity/target,
-- authoritative history, collision resolution and operator approval remain required.
-- Candidate explicitly creates tiktok_oauth: database CREATE is required if absent.
