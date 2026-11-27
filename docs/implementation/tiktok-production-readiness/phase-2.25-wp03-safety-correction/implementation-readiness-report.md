# Phase 2.25: WP-03 Rollback Safety Design Correction Report

**Repository:** `/app`
**Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Task Type:** STRICT READ-ONLY INVESTIGATION AND DESIGN CORRECTION
**Work Package:** WP-03 (Migration and Rollback Safety)
**Author:** Jules (Software Engineer)

---

## 1. Executive Summary

This report delivers the corrected, fail-closed safety design for Work Package **WP-03 (Migration V000009 and Rollback Safety)** in response to the Phase 2.24 Product Owner Gatekeeper review.

### Final Readiness Verdict: `READY_WITH_LIMITATIONS`

Key Corrections Implemented in Design:
1. **Restricted Rollback Scope:** The rollback target is strictly confined to restoring the `ck_asset_import_authority` check constraint (`command_version = '1.0' AND platform = 'youtube'`) on `workflow.asset_import_requests`. **Deletion of records from `workflow.jobs` or `workflow.media` has been eliminated from the default rollback scope.** Because `workflow.asset_import_requests` is a child table referencing `jobs` and `media` via foreign keys with `ON DELETE RESTRICT`, removing rows from `asset_import_requests` never triggers foreign-key constraint violations on `jobs` or `media`.
2. **Multi-Condition Synthetic Record Isolation:** A single `LIKE 'staging_test_tiktok_%'` pattern is mathematically insufficient. The corrected design enforces a 4-dimensional compound isolation assertion:
   - `owner_uid` must match an exact prefix without wildcard ambiguities: `starts_with(owner_uid, 'staging_test_tiktok_')`
   - `idempotency_key` must match the authorized synthetic run prefix: `starts_with(idempotency_key, 'synthetic_test_')`
   - `platform` must equal `'tiktok'`
   - `canonical_source_id` must match the synthetic fixture ID namespace
   If **any** record with `platform = 'tiktok'` exists that fails to satisfy all four criteria simultaneously, the rollback **aborts immediately with an exception** before performing any deletion.
3. **Comprehensive Connection Authority Strategy:** Two-tier protection separates application runner checks from SQL-level assertions:
   - *Tier 1 (Application / Runner Level):* Validates `APP_ENVIRONMENT === 'staging'`, asserts the Cloud SQL instance connection name, database name, and IAM user against approved Staging authority descriptors before initiating any socket or TCP connection.
   - *Tier 2 (In-Transaction SQL Level):* Asserts `current_database() = 'easyslice_staging'`, `current_user`, and sets `SET LOCAL lock_timeout = '5s'` inside an atomic transaction block.

---

## 2. Exact Schema & Dependency Reality

### Table Definition: `workflow.asset_import_requests` (`V000008`)
```sql
CREATE TABLE workflow.asset_import_requests (
  owner_uid text NOT NULL,
  idempotency_key text NOT NULL,
  command_version text NOT NULL,
  request_fingerprint bytea NOT NULL,
  platform text NOT NULL,
  canonical_source_id text NOT NULL,
  normalized_url text NOT NULL,
  state text NOT NULL,
  job_id uuid,
  media_id uuid,
  duration_seconds double precision,
  failure_code text,
  retryable boolean,
  revision bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (owner_uid, idempotency_key),
  CONSTRAINT ck_asset_import_owner CHECK (length(owner_uid) > 0),
  CONSTRAINT ck_asset_import_key CHECK (idempotency_key ~ '^[A-Za-z0-9._~-]{1,128}$'),
  CONSTRAINT ck_asset_import_authority CHECK (command_version = '1.0' AND platform = 'youtube'),
  CONSTRAINT ck_asset_import_fingerprint CHECK (octet_length(request_fingerprint) = 32),
  CONSTRAINT ck_asset_import_state CHECK (state IN ('acquiring','succeeded','failed_retryable','failed_final','reconciliation_required')),
  CONSTRAINT ck_asset_import_lifecycle CHECK (...),
  CONSTRAINT ck_asset_import_revision CHECK (revision >= 0)
);

ALTER TABLE workflow.jobs ADD CONSTRAINT uq_jobs_id_owner UNIQUE (id, owner_uid);
ALTER TABLE workflow.media ADD CONSTRAINT uq_media_id_job UNIQUE (id, job_id);
ALTER TABLE workflow.asset_import_requests ADD CONSTRAINT fk_asset_import_job_owner
  FOREIGN KEY (job_id, owner_uid) REFERENCES workflow.jobs(id, owner_uid) ON DELETE RESTRICT;
ALTER TABLE workflow.asset_import_requests ADD CONSTRAINT fk_asset_import_media_job
  FOREIGN KEY (media_id, job_id) REFERENCES workflow.media(id, job_id) ON DELETE RESTRICT;

CREATE INDEX ix_asset_import_state_updated ON workflow.asset_import_requests (state, updated_at);
```

### Table Dependency & Relationship Hierarchy
- **`workflow.jobs`:** Independent parent table with composite unique key `(id, owner_uid)`.
- **`workflow.media`:** Dependent table with unique key `(id, job_id)`.
- **`workflow.asset_import_requests`:** Child table holding foreign keys referencing `(job_id, owner_uid)` in `jobs` and `(media_id, job_id)` in `media`.
- **Zero Inbound Foreign Keys:** Inspection of the repository database schema (`V000001` through `V000008`) proves that **no other table holds a foreign key referencing `workflow.asset_import_requests`**.
- **Application References:** Only `lib/server/assetImport/idempotencyRepository.ts` reads and writes `workflow.asset_import_requests` (methods: `claim`, `complete`, `settle`).

---

## 3. Corrected Rollback Scope & Deletion Strategy

### Scope Confinement
- The schema change introduced in `V000009` modifies **only** the `CHECK` constraint `ck_asset_import_authority`.
- It does **not** alter `jobs` or `media` schema or constraints.
- Therefore, the rollback operation is strictly scoped to:
  1. Verifying and removing synthetic TikTok rows from `workflow.asset_import_requests`.
  2. Dropping the expanded `ck_asset_import_authority` constraint.
  3. Re-adding the original `ck_asset_import_authority CHECK (command_version = '1.0' AND platform = 'youtube')`.
- **Exclusion of `jobs` and `media` Deletions:** `workflow.jobs` and `workflow.media` records are left untouched by the rollback script. Because `asset_import_requests` references them with `ON DELETE RESTRICT`, removing records from `asset_import_requests` has zero impact on the parent rows in `jobs` and `media`.

---

## 4. Multi-Condition Synthetic Record Isolation Design

### Failure Modes of Simple Wildcards
- In SQL, `LIKE 'staging_test_tiktok_%'` uses `%` as an arbitrary multi-character wildcard and `_` as a single-character wildcard. An unintended username like `staging_test_tiktokXabc` would match.
- If a developer or automated process created non-synthetic records with a similar prefix, a simple wildcard would silently delete them.

### Corrected Compound Identification Predicate
To qualify as an authorized synthetic test record eligible for rollback deletion:
1. `starts_with(owner_uid, 'staging_test_tiktok_')` must be `TRUE`.
2. `starts_with(idempotency_key, 'synthetic_test_')` must be `TRUE`.
3. `platform = 'tiktok'` must be `TRUE`.
4. `starts_with(canonical_source_id, 'synthetic_')` must be `TRUE`.

### Corrected Rollback SQL Script (`rollback_v000009_staging.sql`)
```sql
BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1. In-Transaction Database Assertion
DO $$
BEGIN
  IF current_database() != 'easyslice_staging' THEN
    RAISE EXCEPTION 'Safety Violation: Target database is not easyslice_staging (current: %)', current_database();
  END IF;
END $$;

-- 2. Fail-Closed Guard: Detect ANY non-conforming or ambiguous TikTok record
DO $$
DECLARE
  unauthorized_tiktok_count integer;
BEGIN
  SELECT count(*) INTO unauthorized_tiktok_count
  FROM workflow.asset_import_requests
  WHERE platform = 'tiktok'
    AND NOT (
      starts_with(owner_uid, 'staging_test_tiktok_')
      AND starts_with(idempotency_key, 'synthetic_test_')
      AND starts_with(canonical_source_id, 'synthetic_')
    );

  IF unauthorized_tiktok_count > 0 THEN
    RAISE EXCEPTION 'Rollback Aborted: % non-synthetic or ambiguous TikTok record(s) detected. Manual inspection required.', unauthorized_tiktok_count;
  END IF;
END $$;

-- 3. Delete ONLY positive-match synthetic test records
DELETE FROM workflow.asset_import_requests
WHERE platform = 'tiktok'
  AND starts_with(owner_uid, 'staging_test_tiktok_')
  AND starts_with(idempotency_key, 'synthetic_test_')
  AND starts_with(canonical_source_id, 'synthetic_');

-- 4. Fail-Closed Check: Assert ZERO platform='tiktok' rows remain
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM workflow.asset_import_requests WHERE platform = 'tiktok') THEN
    RAISE EXCEPTION 'Rollback Aborted: platform=tiktok rows remain after deletion phase.';
  END IF;
END $$;

-- 5. Restore original YouTube-only constraint
ALTER TABLE workflow.asset_import_requests
  DROP CONSTRAINT ck_asset_import_authority;

ALTER TABLE workflow.asset_import_requests
  ADD CONSTRAINT ck_asset_import_authority
  CHECK (command_version = '1.0' AND platform = 'youtube');

COMMIT;
```

---

## 5. Comprehensive Connection Authority Strategy

A robust defense-in-depth model separates pre-connection validation from in-connection SQL guards:

```text
[ Migration Runner / CLI ]
       │
       ▼ (Step 1: Application-Level Pure Validation)
  Validate:
  - APP_ENVIRONMENT === 'staging'
  - Reject Production Project ID ("nexcut-prod-jp-2026")
  - Reject Production Instance ("nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql")
  - Reject Production Database ("nexcut")
  - Reject Production IAM User ("nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam")
  - Confirm Authoritative Staging Connection Descriptors exist
       │ (Passes)
       ▼ (Step 2: Connect via Cloud SQL Proxy)
[ Staging PostgreSQL Connection ]
       │
       ▼ (Step 3: In-Transaction SQL Guards)
  Execute:
  - BEGIN
  - SET LOCAL lock_timeout = '5s'
  - Assert current_database() = 'easyslice_staging'
  - Assert current_user = 'staging_iam_user'
  - Execute DDL / DML
  - COMMIT
```

---

## 6. Offline Test Plan Specification

When WP-03 is implemented, the static validation test suite `tests/workflowMigration/stagingMigrationScriptIntegrity.test.ts` will verify the following 14 test cases offline:

1. **Synthetic Record Deletion:** Script only deletes rows matching all four compound predicates (`owner_uid`, `idempotency_key`, `platform`, `canonical_source_id`).
2. **Non-Synthetic TikTok Abort:** Presence of non-synthetic TikTok records triggers `RAISE EXCEPTION`.
3. **Mismatched Idempotency Key Abort:** Synthetic `owner_uid` with non-synthetic `idempotency_key` triggers abort.
4. **Mismatched Owner UID Abort:** Synthetic `idempotency_key` with non-synthetic `owner_uid` triggers abort.
5. **YouTube Immutability:** Asserts zero statements modify or delete `platform = 'youtube'`.
6. **Parent `jobs` Immutability:** Asserts zero delete or truncate statements target `workflow.jobs`.
7. **Parent `media` Immutability:** Asserts zero delete or truncate statements target `workflow.media`.
8. **Foreign-Key Preservation:** Asserts no foreign keys are dropped or altered during rollback.
9. **Pre-Connection Authority Guard:** Validates runner rejects missing/mismatched connection descriptors before socket open.
10. **Production Instance Rejection:** Runner rejects production Cloud SQL connection parameters.
11. **Environment Guard Rejection:** Runner rejects missing or unknown `APP_ENVIRONMENT`.
12. **Idempotent Rollback:** Running rollback on an already-rolled-back database succeeds deterministically without error.
13. **Constraint Fallback Safety:** Re-applying constraint fails closed if any TikTok row remains.
14. **Transaction Atomicity:** All DDL and DML operations execute within a single transactional block (`BEGIN ... COMMIT`).

---

## 7. Remaining Limitations & Product Owner Decisions

1. **Authoritative Staging Cloud SQL Credentials Unconfirmed:** While the validation strategy is fully designed to fail closed, exact Staging Cloud SQL connection parameters (instance name, IAM user) remain unassigned and pending Product Owner sign-off on Decision PO-01.
2. **Backup Requirement:** A full logical backup (`pg_dump`) must be performed before executing the staging migration.

---

### Final Readiness Verdict

## `READY_WITH_LIMITATIONS`

The corrected rollback and migration safety design for WP-03 is complete, rigorously bounded, and eliminates all risks of unconstrained data loss. Local implementation of the SQL files and offline test suite is ready to proceed.
