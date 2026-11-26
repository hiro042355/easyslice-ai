-- BLK-02 read-only preflight: schema, constraint and grant snapshot for the
-- staging media runtime IAM identity. This statement performs no writes.
--
-- Usage:
--   psql "host=127.0.0.1 port=9470 dbname=easyslice_staging user=<operator>" \
--     -A -t \
--     --set=iam_user=easyslice-staging-sa@nexcut-staging.iam \
--     -f db/staging/preflight/002_asset_import_authority.sql > schema-authority.json

SELECT json_build_object(
  'database', current_database(),
  'assetImportAuthority', json_build_object(
    'constraintPresent', EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_asset_import_authority'
        AND conrelid = 'workflow.asset_import_requests'::regclass
    ),
    'constraintDefinition', (
      SELECT pg_get_constraintdef(oid)
      FROM pg_constraint
      WHERE conname = 'ck_asset_import_authority'
        AND conrelid = 'workflow.asset_import_requests'::regclass
    ),
    'platformColumnType', (
      SELECT format_type(atttypid, atttypmod)
      FROM pg_attribute
      WHERE attrelid = 'workflow.asset_import_requests'::regclass
        AND attname = 'platform'
        AND NOT attisdropped
    ),
    'commandVersionColumnType', (
      SELECT format_type(atttypid, atttypmod)
      FROM pg_attribute
      WHERE attrelid = 'workflow.asset_import_requests'::regclass
        AND attname = 'command_version'
        AND NOT attisdropped
    )
  ),
  'grants', json_build_object(
    'iamUser', :'iam_user',
    'iamUserExists', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'iam_user'),
    'canSelectAssetImportRequests', has_table_privilege(:'iam_user', 'workflow.asset_import_requests', 'SELECT'),
    'canInsertAssetImportRequests', has_table_privilege(:'iam_user', 'workflow.asset_import_requests', 'INSERT'),
    'canUpdateAssetImportRequests', has_table_privilege(:'iam_user', 'workflow.asset_import_requests', 'UPDATE'),
    'canSelectJobs', has_table_privilege(:'iam_user', 'workflow.jobs', 'SELECT'),
    'canSelectMedia', has_table_privilege(:'iam_user', 'workflow.media', 'SELECT')
  )
);
