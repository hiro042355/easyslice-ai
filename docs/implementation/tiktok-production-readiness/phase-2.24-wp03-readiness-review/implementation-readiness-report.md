# Phase 2.24: WP-03 Migration & Rollback Implementation Readiness Review

**Repository:** `/app`
**Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Task Type:** STRICT READ-ONLY INVESTIGATION AND DESIGN REVIEW
**Work Package:** WP-03 (Migration and Rollback Safety)
**Author:** Jules (Software Engineer)

---

## 1. Executive Summary

This review establishes the technical requirements, schema relationships, foreign-key dependency order, and isolation safeguards necessary to safely implement Work Package **WP-03 (Staging Migration and Rollback SQL Scripts)**.

### Final Readiness Verdict: `READY_WITH_LIMITATIONS`

Key Findings:
1. **Additive Schema Modification:** Migration `V000009` broadens `ck_asset_import_authority` on `workflow.asset_import_requests` from `platform = 'youtube'` to `platform IN ('youtube', 'tiktok')`. Existing YouTube data and operational workflows remain 100% compliant.
2. **Foreign-Key Architecture Realities:** `workflow.asset_import_requests` maintains strict foreign-key dependencies:
   - `fk_asset_import_job_owner`: `FOREIGN KEY (job_id, owner_uid) REFERENCES workflow.jobs(id, owner_uid) ON DELETE RESTRICT`
   - `fk_asset_import_media_job`: `FOREIGN KEY (media_id, job_id) REFERENCES workflow.media(id, job_id) ON DELETE RESTRICT`
   - *Crucial Finding:* `workflow.asset_import_requests` is the **child** table referencing `jobs` and `media`. Therefore, deleting from `asset_import_requests` first never triggers `ON DELETE RESTRICT` on `jobs` or `media`.
3. **Rollback Safety & Isolation Requirement:** A blanket deletion (`DELETE FROM workflow.asset_import_requests WHERE platform = 'tiktok'`) is **strictly prohibited**. Rollback must isolate and delete **only synthetic staging test records** identified by a deterministic test prefix. If any non-synthetic or ambiguous TikTok record exists, rollback must fail closed without altering the constraint.
4. **Environment & Authority Pre-Checks:** Execution of DDL must assert `current_database() = 'easyslice_staging'`, enforce `SET LOCAL lock_timeout = '5s'`, and fail closed if the environment is unknown or points to production.

---

## 2. Existing Schema Reality

### Table Definition: `workflow.asset_import_requests` (Introduced in `V000008`)
- **Primary Key:** `(owner_uid, idempotency_key)`
- **Columns:**
  - `owner_uid text NOT NULL`
  - `idempotency_key text NOT NULL`
  - `command_version text NOT NULL`
  - `request_fingerprint bytea NOT NULL` (length 32)
  - `platform text NOT NULL`
  - `canonical_source_id text NOT NULL`
  - `normalized_url text NOT NULL`
  - `state text NOT NULL` (`'acquiring' | 'succeeded' | 'failed_retryable' | 'failed_final' | 'reconciliation_required'`)
  - `job_id uuid`
  - `media_id uuid`
  - `duration_seconds double precision`
  - `failure_code text`
  - `retryable boolean`
  - `revision bigint NOT NULL DEFAULT 0`
  - `created_at timestamptz NOT NULL DEFAULT transaction_timestamp()`
  - `updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()`

### Constraints & Indexes
- `CONSTRAINT ck_asset_import_authority`: `CHECK (command_version = '1.0' AND platform = 'youtube')`
- `CONSTRAINT fk_asset_import_job_owner`: `FOREIGN KEY (job_id, owner_uid) REFERENCES workflow.jobs(id, owner_uid) ON DELETE RESTRICT`
- `CONSTRAINT fk_asset_import_media_job`: `FOREIGN KEY (media_id, job_id) REFERENCES workflow.media(id, job_id) ON DELETE RESTRICT`
- `INDEX ix_asset_import_state_updated ON workflow.asset_import_requests (state, updated_at)`

---

## 3. Migration Safety Analysis (V000009)

### Exact Proposed Schema Change
```sql
ALTER TABLE workflow.asset_import_requests
  DROP CONSTRAINT ck_asset_import_authority;

ALTER TABLE workflow.asset_import_requests
  ADD CONSTRAINT ck_asset_import_authority
  CHECK (command_version = '1.0' AND platform IN ('youtube', 'tiktok'));
```

### Safety & Concurrency Evaluation
- **Classification:** Additive DDL.
- **Data Effects:** Zero column modifications, zero data transformations. Existing `'youtube'` rows remain valid.
- **Lock Behavior:** `ALTER TABLE ... ADD CONSTRAINT` acquires an `ACCESS EXCLUSIVE` lock while scanning existing rows. In tables with active ingestion workers, concurrent read/write queries queue behind this lock.
- **Downtime Safeguard:** The migration wrapper must execute:
  `SET LOCAL lock_timeout = '5s';`
  If the lock cannot be acquired within 5 seconds, the transaction immediately aborts, preventing connection pool starvation.

---

## 4. Rollback Safety Analysis & Synthetic Record Isolation

### The Destructive Risk
Restoring `CHECK (command_version = '1.0' AND platform = 'youtube')` requires that **zero** rows with `platform != 'youtube'` exist in `workflow.asset_import_requests`.
If a rollback script executes an unconstrained `DELETE ... WHERE platform = 'tiktok'`, it could:
1. Delete valid user data if real TikTok workflows were created.
2. Delete data belonging to other developers or staging tests.

### Synthetic Isolation Standard
To ensure 100% safe, non-destructive rollback:
1. **Deterministic Test Owner Prefix:** Every test record generated during staging smoke testing must use an isolated owner UID pattern:
   `owner_uid LIKE 'staging_test_tiktok_%'`
2. **Explicit Verification Before DDL:** The rollback script must assert that:
   - All rows with `platform = 'tiktok'` match `owner_uid LIKE 'staging_test_tiktok_%'`.
   - If any row with `platform = 'tiktok'` has an unapproved owner UID, **the rollback script aborts immediately with an exception**.
3. **Safe Deletion Sequence:**
   - Step 1: Delete test records from `workflow.asset_import_requests` matching the synthetic prefix.
   - Step 2: Delete associated test rows from `workflow.media` and `workflow.jobs` matching the synthetic prefix.
   - Step 3: Assert zero rows with `platform = 'tiktok'` exist.
   - Step 4: Re-apply the original check constraint `platform = 'youtube'`.

---

## 5. Proposed Safe Staging Migration & Rollback Scripts

### Apply Script Design (`apply_v000009_staging.sql`)
```sql
BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1. Pre-execution database identity assertion
DO $$
BEGIN
  IF current_database() != 'easyslice_staging' THEN
    RAISE EXCEPTION 'Target database is not easyslice_staging (current: %)', current_database();
  END IF;
END $$;

-- 2. Apply additive constraint update
ALTER TABLE workflow.asset_import_requests
  DROP CONSTRAINT ck_asset_import_authority;

ALTER TABLE workflow.asset_import_requests
  ADD CONSTRAINT ck_asset_import_authority
  CHECK (command_version = '1.0' AND platform IN ('youtube', 'tiktok'));

COMMIT;
```

### Rollback Script Design (`rollback_v000009_staging.sql`)
```sql
BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1. Pre-execution database identity assertion
DO $$
BEGIN
  IF current_database() != 'easyslice_staging' THEN
    RAISE EXCEPTION 'Target database is not easyslice_staging (current: %)', current_database();
  END IF;
END $$;

-- 2. Fail-closed assertion: verify NO non-synthetic TikTok rows exist
DO $$
DECLARE
  unisolated_count integer;
BEGIN
  SELECT count(*) INTO unisolated_count
  FROM workflow.asset_import_requests
  WHERE platform = 'tiktok' AND owner_uid NOT LIKE 'staging_test_tiktok_%';

  IF unisolated_count > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % non-synthetic TikTok records detected', unisolated_count;
  END IF;
END $$;

-- 3. Delete only isolated synthetic staging test records
DELETE FROM workflow.asset_import_requests
WHERE platform = 'tiktok' AND owner_uid LIKE 'staging_test_tiktok_%';

-- 4. Clean up associated test media and job rows
DELETE FROM workflow.media
WHERE owner_uid LIKE 'staging_test_tiktok_%';

DELETE FROM workflow.jobs
WHERE owner_uid LIKE 'staging_test_tiktok_%';

-- 5. Assert zero TikTok rows remain before altering constraint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM workflow.asset_import_requests WHERE platform = 'tiktok') THEN
    RAISE EXCEPTION 'Rollback failed: unexpected platform=tiktok rows remain';
  END IF;
END $$;

-- 6. Restore original YouTube-only constraint
ALTER TABLE workflow.asset_import_requests
  DROP CONSTRAINT ck_asset_import_authority;

ALTER TABLE workflow.asset_import_requests
  ADD CONSTRAINT ck_asset_import_authority
  CHECK (command_version = '1.0' AND platform = 'youtube');

COMMIT;
```

---

## 6. Offline Test Design Specification

When WP-03 implementation begins, the test suite `tests/workflowMigration/stagingMigrationScriptIntegrity.test.ts` must assert:
1. **Static SQL Syntax & AST:** Validates that both SQL files parse cleanly.
2. **Lock Timeout Assertion:** Asserts presence of `SET LOCAL lock_timeout = '5s'` in both scripts.
3. **Database Guard Assertion:** Asserts presence of `current_database() != 'easyslice_staging'` check in both scripts.
4. **Synthetic Isolation Logic:** Asserts presence of `owner_uid NOT LIKE 'staging_test_tiktok_%'` fail-closed abort check.
5. **No Blanket Truncation:** Asserts absence of `TRUNCATE` or unrestricted `DELETE FROM workflow.asset_import_requests`.
6. **FK Order Compliance:** Asserts that child records are removed before parent records.

---

## 7. Limitations & Product Owner Decisions

1. **Staging Database Authority Decision:** Staging Cloud SQL instance connection name and database user remain unapproved. Staging execution cannot proceed until Product Owner signs Decision PO-01.
2. **Backup Prerequisite:** A full logical backup (`pg_dump`) of the staging database must be verified prior to applying DDL.

---

### Final Readiness Verdict

## `READY_WITH_LIMITATIONS`

WP-03 is technically ready for local-only script authoring and unit test verification. Live database execution remains strictly blocked pending Product Owner approval and staging infrastructure provisioning.
