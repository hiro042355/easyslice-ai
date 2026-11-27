# Database and Persistence Audit

**Audit Timestamp:** `2026-11-07T23:31:09Z` (Updated: `2026-11-08T00:35:00Z`)
**Evaluator:** Jules (Software Engineer)
**Overall Status:** `NOT_VERIFIED` for Production Database Application / `PASS` for Static SQL Review & Contract Alignment

---

## 1. Migration V000009 Rigorous Three-Tier Distinction

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

To prevent ungrounded claims of production readiness, this audit explicitly distinguishes three operational levels:

### Level 1: Static SQL & Schema Review (Status: PASS)
- **Constraint Expansion:** The previous check constraint defined in `V000008` enforced `(command_version = '1.0' AND platform = 'youtube')`. The new constraint expands this to `IN ('youtube', 'tiktok')`.
- **Backward Compatibility:** All existing rows where `platform = 'youtube'` satisfy the new predicate identically. No existing rows are invalidated or modified.
- **Locking Characteristics:** `ALTER TABLE ... DROP CONSTRAINT` takes an `ACCESS EXCLUSIVE` lock. Re-adding the constraint without `NOT VALID` triggers a table scan to validate existing rows. Because `workflow.asset_import_requests` is small and only contains valid `'youtube'` entries, the lock duration in PostgreSQL will be under a few milliseconds.
- **Contract Parity:** Perfectly aligns with the TypeScript union `CanonicalAssetImportSource` in `lib/assetImport/types.ts` (`export type CanonicalAssetImportPlatform = "youtube" | "tiktok"`).

### Level 2: Local Disposable Database Migration Test (Status: NOT_APPLICABLE / NO LOCAL PG CONTAINER RUNNING)
- The sandbox environment does not run an active local PostgreSQL daemon or Docker container.
- Verification in unit tests (`tests/urlAcquisition/productionAssetImportCommand.test.ts` and `tests/postgresqlTestEnvironment/`) tests schema contracts, regex invariants, and query syntax offline.
- No live PostgreSQL migration execution was attempted or simulated on a disposable container.

### Level 3: Production Database Application (Status: NOT_VERIFIED)
- In strict adherence to security rules, migration `V000009` has **NOT** been applied to the live Google Cloud SQL instance (`nexcut-prod-postgresql`).
- Applying this migration requires scheduled maintenance window authorization and invocation through Flyway by the authorized service account `database_migration@...`.
- **Verdict for Gate `DATABASE_MIGRATION_READY`:** Evaluated as `NOT_VERIFIED` for production release, though static SQL analysis is verified `PASS`.

---

## 2. Media Ownership & Transactional Consistency

**Files:** `app/api/media/admit/route.ts` & `lib/server/durableMediaOwnership/repository.ts`

1. **Transactional Boundaries:**
   - Media registration happens inside an explicit `BEGIN ... COMMIT` block.
   - If an error occurs during repository creation, `ROLLBACK` is executed immediately, followed by compensation cleanup deleting the uploaded GCS object (`object.delete({ ignoreNotFound: true })`).
2. **Referential Invariants:**
   - `workflow.media.job_id` references `workflow.jobs.id`.
   - Media insertion uses `INSERT INTO workflow.media (id, job_id, storage_key, kind) SELECT $1, j.id, $2, $3 FROM workflow.jobs j WHERE j.id = $4 AND j.owner_uid = $5`. If the job does not belong to the authenticated `ownerUid`, zero rows are inserted, triggering transaction failure.
3. **Idempotent Duplicate Resolution:**
   - Re-requesting finalize on an already registered `{ jobId, mediaId }` with matching storage key safely returns HTTP 200 without creating duplicate records or failing.
