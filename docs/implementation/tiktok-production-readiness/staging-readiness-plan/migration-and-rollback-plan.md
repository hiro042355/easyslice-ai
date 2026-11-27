# Database Migration and Rollback Plan: V000009

**Target Migration:** `db/workflow/migrations/V000009__expand_asset_import_platform.sql`
**Target Table:** `workflow.asset_import_requests`
**Constraint Modified:** `ck_asset_import_authority`
**Execution Environment:** Staging Cloud SQL PostgreSQL Instance
**Safety Classification:** Additive DDL (Requires Table-Level Exclusive Lock)

---

## 1. Migration Overview

### Background
Currently, `workflow.asset_import_requests` in migration `V000008` enforces:
```sql
CONSTRAINT ck_asset_import_authority CHECK (command_version = '1.0' AND platform = 'youtube')
```
Migration `V000009` replaces this constraint with:
```sql
ALTER TABLE workflow.asset_import_requests
  DROP CONSTRAINT ck_asset_import_authority;

ALTER TABLE workflow.asset_import_requests
  ADD CONSTRAINT ck_asset_import_authority
  CHECK (command_version = '1.0' AND platform IN ('youtube', 'tiktok'));
```
This change expands valid platform values to include `'tiktok'`. Existing rows with `platform = 'youtube'` remain compliant.

---

## 2. Lock Behavior & Downtime Analysis

### Concurrency and Lock Modes
- Adding a `CHECK` constraint without `NOT VALID` requires PostgreSQL to scan the table under an `ACCESS EXCLUSIVE` lock on `workflow.asset_import_requests`.
- While the scan over existing YouTube rows evaluates quickly in small or empty tables, on active databases any concurrent transactions reading or writing to `workflow.asset_import_requests` will be queued behind this lock.
- *Removal of Unsupported Claims:* Zero downtime or sub-50ms execution times are **not guaranteed** and depend entirely on staging concurrency, table size, and lock queue length.
- *Pre-Execution Requirement:* Active background workers must be stopped or confirmed idle before applying DDL to avoid connection pool starvation and statement lock timeouts.

---

## 3. Pre-Flight Checklist & Backup Requirements

Before executing the migration on staging:
1. **Mandatory Backup Verification:**
   - Execute a full manual Cloud SQL backup or `pg_dump` of schema `workflow` on `easyslice_staging`.
   - Record the backup ID and restore drill verification timestamp.
2. **Environment Assertion:**
   - Run assertion query to guarantee target is staging and not production:
     ```sql
     SELECT current_database(), current_user, inet_server_addr();
     ```
   - Must strictly match `easyslice_staging`.
3. **Existing Constraints & State Check:**
   ```sql
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'workflow.asset_import_requests'::regclass;
   ```
   Ensure `ck_asset_import_authority` is present with `platform = 'youtube'`.
4. **Active Connection Count:** Confirm no pending long-running transactions are active.

---

## 4. Migration Execution Procedure

Execute within a single transactional block via `psql` or Flyway:

```sql
BEGIN;

-- 1. Set lock timeout to avoid waiting indefinitely
SET LOCAL lock_timeout = '5s';

-- 2. Drop legacy constraint
ALTER TABLE workflow.asset_import_requests
  DROP CONSTRAINT ck_asset_import_authority;

-- 3. Add expanded constraint
ALTER TABLE workflow.asset_import_requests
  ADD CONSTRAINT ck_asset_import_authority
  CHECK (command_version = '1.0' AND platform IN ('youtube', 'tiktok'));

COMMIT;
```

---

## 5. Post-Migration Verification

### A. Verify Constraint Definition
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'ck_asset_import_authority';
```
Expected output:
`CHECK ((command_version = '1.0'::text) AND (platform = ANY (ARRAY['youtube'::text, 'tiktok'::text])))`

### B. Positive Test: Insert Synthetic TikTok Record
```sql
BEGIN;
INSERT INTO workflow.asset_import_requests (
  owner_uid, idempotency_key, command_version, request_fingerprint,
  platform, canonical_source_id, normalized_url, state
) VALUES (
  'usr_test_tiktok', 'test_key_001', '1.0',
  decode('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex'),
  'tiktok', '7123456789012345678', 'https://www.tiktok.com/@user/video/7123456789012345678',
  'acquiring'
);
ROLLBACK; -- Clean up test record immediately
```
Expected: Insert succeeds within transaction.

### C. Negative Test: Insert Unsupported Platform
```sql
INSERT INTO workflow.asset_import_requests (
  owner_uid, idempotency_key, command_version, request_fingerprint,
  platform, canonical_source_id, normalized_url, state
) VALUES (
  'usr_test_bilibili', 'test_key_002', '1.0',
  decode('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex'),
  'bilibili', 'BV1xx411c7mD', 'https://www.bilibili.com/video/BV1xx411c7mD',
  'acquiring'
);
```
Expected: Database rejects with check constraint violation `ck_asset_import_authority`.

---

## 6. Rollback Strategy & Foreign-Key Pre-Check

### Destructive Risk & Foreign Key Dependencies
- Re-applying `platform = 'youtube'` will immediately fail if any row in `workflow.asset_import_requests` contains `platform = 'tiktok'`.
- Rows in `workflow.asset_import_requests` may be referenced by foreign keys:
  - `fk_asset_import_job_owner` (`job_id, owner_uid -> workflow.jobs`)
  - `fk_asset_import_media_job` (`media_id, job_id -> workflow.media`)
- Simply running `DELETE FROM workflow.asset_import_requests WHERE platform = 'tiktok'` can fail or leave orphaned child rows if foreign keys are restricted.

### Safe Rollback Procedure (`U000009__revert_expand_asset_import_platform.sql`)

```sql
BEGIN;

SET LOCAL lock_timeout = '5s';

-- 1. Explicitly identify and isolate synthetic test rows
-- Purge test child records in correct foreign-key dependency order
DELETE FROM workflow.media
WHERE id IN (SELECT media_id FROM workflow.asset_import_requests WHERE platform = 'tiktok' AND media_id IS NOT NULL);

DELETE FROM workflow.jobs
WHERE id IN (SELECT job_id FROM workflow.asset_import_requests WHERE platform = 'tiktok' AND job_id IS NOT NULL);

-- 2. Delete test TikTok import requests
DELETE FROM workflow.asset_import_requests WHERE platform = 'tiktok';

-- 3. Verify zero TikTok rows remain
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM workflow.asset_import_requests WHERE platform = 'tiktok') THEN
    RAISE EXCEPTION 'Cannot rollback: rows with platform = tiktok still exist';
  END IF;
END $$;

-- 4. Re-apply original constraint
ALTER TABLE workflow.asset_import_requests
  DROP CONSTRAINT ck_asset_import_authority;

ALTER TABLE workflow.asset_import_requests
  ADD CONSTRAINT ck_asset_import_authority
  CHECK (command_version = '1.0' AND platform = 'youtube');

COMMIT;
```
