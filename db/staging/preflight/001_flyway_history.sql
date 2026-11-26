-- BLK-02 read-only preflight: Flyway history snapshot.
-- Usage (through the Cloud SQL Auth Proxy, as a read-only staging operator):
--   psql "host=127.0.0.1 port=9470 dbname=easyslice_staging user=<operator>" \
--     -A -t -f db/staging/preflight/001_flyway_history.sql > flyway-history.json
-- This statement performs no writes.

SELECT json_build_object(
  'database', current_database(),
  'flyway', COALESCE(
    json_agg(
      json_build_object(
        'installed_rank', installed_rank,
        'version', version,
        'description', description,
        'type', type,
        'success', success,
        'checksum', checksum
      )
      ORDER BY installed_rank
    ),
    '[]'::json
  )
)
FROM flyway_schema_history;
