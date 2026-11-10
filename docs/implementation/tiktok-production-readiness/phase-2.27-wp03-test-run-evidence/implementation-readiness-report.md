# Phase 2.27: WP-03 Test-Run Isolation & Implementation Evidence Report

**Repository:** `/app`
**Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Task Type:** STRICT READ-ONLY INVESTIGATION AND EVIDENCE COMPLETION
**Work Package:** WP-03 (Migration and Rollback Safety)
**Author:** Jules (Software Engineer)

---

## 1. Test-Run Isolation Design & Feasibility on Existing Schema

### A. Schema Investigation: Does `test_run_id` Column Exist?
Inspection of `db/workflow/migrations/V000008__add_asset_import_idempotency.sql` proves that **no `test_run_id` column exists** in `workflow.asset_import_requests`.
The table schema consists strictly of:
`owner_uid`, `idempotency_key`, `command_version`, `request_fingerprint`, `platform`, `canonical_source_id`, `normalized_url`, `state`, `job_id`, `media_id`, `duration_seconds`, `failure_code`, `retryable`, `revision`, `created_at`, `updated_at`.

### B. Feasibility Evaluation: Can Test-Run Isolation be Safely Realized Without Schema Modification?
**YES.** Adding an unapproved column to `workflow.asset_import_requests` would alter production schema compatibility and invalidate migration `V000008`.
Instead, test-run isolation can be deterministically embedded within the primary key columns:
1. `owner_uid` check constraint (`ck_asset_import_owner`): `CHECK (length(owner_uid) > 0)` — accepts any non-empty string.
2. `idempotency_key` check constraint (`ck_asset_import_key`): `CHECK (idempotency_key ~ '^[A-Za-z0-9._~-]{1,128}$')` — accepts alphanumerics, dots, underscores, tildes, and hyphens up to 128 chars.

### C. The Authoritative Test-Run Identifier Pattern
For a given staging test run identified by UUID `RUN_ID` (e.g. `20261108T180000Z-9b7e`):
- `owner_uid` = `'staging_test_tiktok_' || RUN_ID`
- `idempotency_key` = `'synthetic_test_' || RUN_ID || '_' || SEQUENCE_ID`
- `canonical_source_id` = `'synthetic_' || RUN_ID || '_' || VIDEO_ID`
- `normalized_url` = `'https://www.tiktok.com/@staging_test_tiktok_' || RUN_ID || '/video/' || VIDEO_ID`

### D. Parameterized Rollback SQL Guard Pattern
When executing rollback for a specific `TARGET_RUN_ID`:
```sql
-- Assert that any TikTok row created during TARGET_RUN_ID conforms 100% to all 4 compound criteria
DO $$
DECLARE
  v_run_id text := :TARGET_RUN_ID; -- Supplied parameter
  unauthorized_count integer;
BEGIN
  SELECT count(*) INTO unauthorized_count
  FROM workflow.asset_import_requests
  WHERE platform = 'tiktok'
    AND (
      owner_uid = 'staging_test_tiktok_' || v_run_id
      OR starts_with(idempotency_key, 'synthetic_test_' || v_run_id || '_')
      OR starts_with(canonical_source_id, 'synthetic_' || v_run_id || '_')
    )
    AND NOT (
      owner_uid = 'staging_test_tiktok_' || v_run_id
      AND starts_with(idempotency_key, 'synthetic_test_' || v_run_id || '_')
      AND starts_with(canonical_source_id, 'synthetic_' || v_run_id || '_')
      AND starts_with(normalized_url, 'https://www.tiktok.com/@staging_test_tiktok_' || v_run_id || '/')
    );

  IF unauthorized_count > 0 THEN
    RAISE EXCEPTION 'Rollback Aborted: Ambiguous or partially-matched synthetic records detected for test run %', v_run_id;
  END IF;
END $$;

-- Delete ONLY the exact records for TARGET_RUN_ID
DELETE FROM workflow.asset_import_requests
WHERE platform = 'tiktok'
  AND owner_uid = 'staging_test_tiktok_' || :TARGET_RUN_ID
  AND starts_with(idempotency_key, 'synthetic_test_' || :TARGET_RUN_ID || '_')
  AND starts_with(canonical_source_id, 'synthetic_' || :TARGET_RUN_ID || '_')
  AND starts_with(normalized_url, 'https://www.tiktok.com/@staging_test_tiktok_' || :TARGET_RUN_ID || '/');
```
**Safety Invariant:** Rows from other test runs (`RUN_ID != TARGET_RUN_ID`), real user rows, and YouTube rows are completely excluded from deletion.

---

## 2. Actual Runner & Pre-Connection Verification Code

The actual runtime connection code resides in `lib/server/productionMediaRuntime/`:
- `lib/server/productionMediaRuntime/compositionCore.ts` (lines 48–79):
  `validateMediaRuntimeConfiguration` synchronously validates:
  1. `APP_ENVIRONMENT` exists and is `"production"` or `"staging"`.
  2. `readProductionMediaWifConfiguration` validates GCP project ID and WIF provider before OIDC retrieval.
  3. `resolveAuthorizedBucketName` validates GCS bucket authority.
  4. `validateMediaCloudSqlAuthority` validates instance connection name, database, and IAM user.
- `lib/server/productionMediaRuntime/cloudSqlAdapter.ts` (lines 24–60):
  `validateMediaCloudSqlAuthority` enforces that Staging connections fail closed unless explicitly approved.
- **Pre-Connection Guarantee:** All validations execute synchronously in memory before:
  - Any TCP / socket connection.
  - Any Cloud SQL Auth Proxy invocation.
  - Any `createConnectorAuthority` or `Pool` instantiation.

---

## 3. Full Schema & Repository Dependency Evidence

Searches conducted across the entire repository:
1. **Foreign Key References to `workflow.asset_import_requests`:**
   - Command: `git grep "REFERENCES workflow.asset_import_requests" db/`
   - Scope: All Flyway migration scripts `V000001` through `V000009`.
   - Result: **0 matches**. No foreign keys in the repository schema point to `workflow.asset_import_requests`.
2. **Application DML / SQL Access:**
   - Command: `git grep "workflow.asset_import_requests" lib/ app/ tests/`
   - Scope: Full TypeScript codebase.
   - Result: Exactly 1 module in the entire repository accesses this table:
     `lib/server/assetImport/idempotencyRepository.ts` (lines 39, 44, 56).
3. **Database Triggers:**
   - Command: `git grep "CREATE TRIGGER" db/`
   - Scope: All Flyway migrations.
   - Result: **0 triggers** exist on `workflow.asset_import_requests`.
4. **Indexes & Unique Constraints:**
   - `PRIMARY KEY (owner_uid, idempotency_key)`
   - `CREATE INDEX ix_asset_import_state_updated ON workflow.asset_import_requests (state, updated_at)`
5. **Existing Mechanism for Test-Run ID:**
   - No explicit column exists. The compound primary key `(owner_uid, idempotency_key)` is the authoritative mechanism to embed `RUN_ID`.

---

## 4. Behavioral Offline Test Status

- **Status in Repository:** The test file `tests/workflowMigration/stagingMigrationScriptIntegrity.test.ts` **DOES NOT YET EXIST** in the codebase.
- In accordance with strict restrictions ("Do not implement migration scripts in this phase", "No test code modifications"), this test suite has **NOT** been authored or executed.
- Previous reports outlined the design specification for this suite; no claim is made that these tests have already run or passed.
- All 15 behavioral scenarios (including test-run isolation, non-synthetic abort, YouTube immutability, parent table immutability, and transactional atomicity) are designed and ready for local implementation once WP-03 is formally authorized.

---

## 5. Unconfirmed Items & Remaining Risks

1. **Staging Authority Unapproved:** Authoritative Staging Cloud SQL instance connection name and database user remain unassigned. The runner fails closed as designed.
2. **Physical Cloud SQL Catalog Status:** While all schema migrations in the repository index have been audited, the physical staging database instance has not been queried because external cloud connections are strictly prohibited.
3. **Rollback Prerequisite:** Rollback can only restore `platform = 'youtube'` if all TikTok rows in the database belong to authorized test runs and are safely cleared. If real TikTok workflows exist on the database, constraint restoration cannot proceed.

---

## 6. Git Integrity Evidence

- **Branch:** `jules-3110607620436353703-ca56d790`
- **HEAD:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
- **Working Tree Status (`git diff --stat`):** 0 unstaged modifications.
- **Staged Status (`git status --short`):**
  - 30 pre-existing staged files from earlier phases remain completely intact.
  - WP-01 and WP-02 code changes and test additions remain staged in the index.
  - Phase 2.27 review files are isolated under `docs/implementation/tiktok-production-readiness/phase-2.27-wp03-test-run-evidence/`.

---

### Final Readiness Verdict

## `READY_WITH_LIMITATIONS`

The test-run isolation architecture, pre-connection runner verification, and schema dependency proof for WP-03 are completely resolved and documented without modifying existing application code or connecting to external databases.
