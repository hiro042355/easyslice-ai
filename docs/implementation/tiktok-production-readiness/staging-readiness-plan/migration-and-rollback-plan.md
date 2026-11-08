# Database Migration and Rollback Plan: V000009

**Target Migration:** `db/workflow/migrations/V000009__expand_asset_import_platform.sql`
**Target Table:** `workflow.asset_import_requests`
**Constraint Modified:** `ck_asset_import_authority`
**Execution Environment:** Staging Cloud SQL PostgreSQL Instance
**Safety Classification:** Additive / Zero Downtime (DDL lock duration < 100ms)

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
This change is purely additive. Existing rows with `platform = 'youtube'` remain 100% compliant.

---

## 2. Pre-Flight Checklist

Before executing the migration on staging:
1. **PO Sign-Off:** Confirm written approval from Product Owner.
2. **Environment Verification:** Verify database connection string points to `easyslice_staging` and **not** production:
   ```sql
   SELECT current_database(), current_user, inet_server_addr();
   ```
3. **Existing Constraints & State Check:**
   ```sql
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'workflow.asset_import_requests'::regclass;
   ```
   Ensure `ck_asset_import_authority` is present with `platform = 'youtube'`.
4. **Active Connection Count:** Ensure staging background workers are idle or paused to prevent lock wait timeouts.

---

## 3. Migration Execution Procedure

Execute within a single transactional block via `psql` or Flyway:

```sql
BEGIN;

-- 1. Acquire table lock in SHARE ROW EXCLUSIVE mode
LOCK TABLE workflow.asset_import_requests IN SHARE ROW EXCLUSIVE MODE;

-- 2. Drop legacy constraint
ALTER TABLE workflow.asset_import_requests
  DROP CONSTRAINT ck_asset_import_authority;

-- 3. Add expanded constraint
ALTER TABLE workflow.asset_import_requests
  ADD CONSTRAINT ck_asset_import_authority
  CHECK (command_version = '1.0' AND platform IN ('youtube', 'tiktok'));

-- 4. Record migration in Flyway schema history if managed by Flyway
-- (Or automated via flyway migrate)

COMMIT;
```

---

## 4. Post-Migration Verification

Run validation queries to confirm expected behavior:

### A. Verify Constraint Definition
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'ck_asset_import_authority';
```
Expected output:
`CHECK ((command_version = '1.0'::text) AND (platform = ANY (ARRAY['youtube'::text, 'tiktok'::text])))`

### B. Positive Test: Insert TikTok Record
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
ROLLBACK; -- Clean up
```
Expected: Insert succeeds (committed or rolled back cleanly).

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

## 5. Rollback Strategy

If anomalies occur during validation or if the migration must be undone:

### Rollback SQL Script (`U000009__revert_expand_asset_import_platform.sql`)

```sql
BEGIN;

-- 1. Check if any rows with platform = 'tiktok' exist
-- If rows exist, archive or delete test rows first
DELETE FROM workflow.asset_import_requests WHERE platform = 'tiktok';

-- 2. Drop expanded constraint
ALTER TABLE workflow.asset_import_requests
  DROP CONSTRAINT ck_asset_import_authority;

-- 3. Re-add original constraint
ALTER TABLE workflow.asset_import_requests
  ADD CONSTRAINT ck_asset_import_authority
  CHECK (command_version = '1.0' AND platform = 'youtube');

COMMIT;
```

### Rollback Verification
Confirm that inserting a `'tiktok'` record is once again blocked by constraint violation.
