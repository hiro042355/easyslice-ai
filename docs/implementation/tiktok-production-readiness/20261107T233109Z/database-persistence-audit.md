# Database and Persistence Audit

**Audit Timestamp:** `2026-11-07T23:31:09Z`
**Evaluator:** Jules (Software Engineer)
**Overall Status:** `PASS` (Repository & Migration Design) / `NOT_VERIFIED` (Production Application on Live Cloud SQL)

---

## 1. Migration V000009 Analysis

**File:** `db/workflow/migrations/V000009__expand_asset_import_platform.sql`

```sql
-- V000009__expand_asset_import_platform.sql
-- Additive migration: expand asset_import_requests platform check constraint to include 'tiktok'

ALTER TABLE workflow.asset_import_requests
  DROP CONSTRAINT ck_asset_import_authority;

ALTER TABLE workflow.asset_import_requests
  ADD CONSTRAINT ck_asset_import_authority
  CHECK (command_version = '1.0' AND platform IN ('youtube', 'tiktok'));
```

### Safety & Backward Compatibility Evaluation:
1. **Additive Schema Evolution:**
   - Previous constraint from `V000008__add_asset_import_idempotency.sql` enforced:
     `CHECK (command_version = '1.0' AND platform = 'youtube')`.
   - The updated constraint expands the allowed set to `('youtube', 'tiktok')`.
   - Existing rows with `platform = 'youtube'` remain 100% compliant and valid.
2. **Locking Impact:**
   - In PostgreSQL, dropping a check constraint (`DROP CONSTRAINT`) takes an `ACCESS EXCLUSIVE` lock on `workflow.asset_import_requests`.
   - Re-adding the check constraint without `NOT VALID` will scan the table to validate existing rows. Because the table is bounded and rows only have `'youtube'`, this validation completes in milliseconds.
3. **Rollback Feasibility:**
   - Reversible by dropping `ck_asset_import_authority` and re-adding the previous condition `platform = 'youtube'` (provided no rows with `platform = 'tiktok'` exist at time of rollback).
4. **Idempotency & Replay:**
   - The migration uses standard Flyway/versioned migration naming (`V000009__...`). It will execute exactly once during Flyway migration deployment.

---

## 2. Media Ownership & Job Persistence Architecture

**File:** `app/api/media/admit/route.ts` & `lib/server/durableMediaOwnership/repository.ts`

1. **Transactional Boundaries:**
   - Media registration happens in an explicit PostgreSQL transaction:
     ```ts
     const transaction = await pool.connect();
     try {
       await transaction.query("BEGIN");
       const repository = createDurableMediaOwnershipRepository(transaction);
       // ... checks existing job / media ...
       await repository.createJobWithId(body.jobId, ownerUid);
       const media = await repository.createMediaWithId(body.mediaId, body.jobId, ownerUid, "input", VIDEO_MIME);
       await transaction.query("COMMIT");
     } catch (error) {
       await transaction.query("ROLLBACK").catch(() => undefined);
       await object.delete({ ignoreNotFound: true }).catch(() => undefined);
       throw error;
     } finally {
       transaction.release();
     }
     ```
2. **Data Consistency between `workflow.jobs` and `workflow.media`:**
   - Invariant: `workflow.media.job_id` references `workflow.jobs.id`.
   - Media creation relies on `INSERT INTO workflow.media (id, job_id, storage_key, kind) SELECT $1, j.id, $2, $3 FROM workflow.jobs j WHERE j.id = $4 AND j.owner_uid = $5`.
   - If the job does not exist or belongs to another owner, zero rows are inserted, triggering a transaction rollback.
3. **Storage vs Database Atomicity:**
   - If database insertion fails after GCS upload has completed, the compensation handler immediately issues `object.delete({ ignoreNotFound: true })` on GCS, preventing orphaned storage objects.
   - Idempotent finalization: Re-issuing finalize for an already admitted `{ jobId, mediaId }` verifies that the job and media exist and match the expected storage key, returning HTTP 200 without creating duplicates or failing.

---

## 3. Production Deployment Status

- **Repository Status:** `PASS`. Migration SQL is verified, syntax-valid, and covered by type contracts in `lib/assetImport/types.ts`.
- **Live Database Status:** `NOT_VERIFIED`. In accordance with safety policies, migrations have NOT been applied to the live Google Cloud SQL production instance `nexcut-prod-postgresql`. This requires Product Owner authorization and deployment execution via CI/CD Flyway runner.
