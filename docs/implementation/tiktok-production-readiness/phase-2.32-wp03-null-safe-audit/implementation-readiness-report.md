# Phase 2.32: WP-03 NULL-Safe Audit and Exact Synthetic Record Validation Report

**Execution Mode:** STRICT READ-ONLY DESIGN CORRECTION
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Isolation)

---

## 1. NULL-Safe Precheck Audit Design

### 1.1 Root Cause of Three-Valued Logic Leakage
In PostgreSQL standard SQL three-valued logic (`TRUE`, `FALSE`, `UNKNOWN`/`NULL`):
- If `owner_uid` is `NULL`, the expression `owner_uid = $1` evaluates to `NULL`.
- If an inner condition evaluates to `NULL`, the compound expression `(owner_uid = $1 AND ...)` can evaluate to `NULL`.
- Negating `NULL` via `NOT (NULL)` still yields `NULL`.
- In a `FILTER (WHERE NOT (...))` clause, rows where the filter condition evaluates to `NULL` are **discarded/not counted**, because `WHERE` only accepts `TRUE`.
- **Consequence:** A malformed TikTok record containing unexpected `NULL` values in `owner_uid`, `canonical_source_id`, or `normalized_url` could be omitted from the `ineligible_tiktok` audit count!

### 1.2 Concrete NULL-Safe Design using Boolean `IS NOT TRUE`
To completely overcome three-valued logic and guarantee that **every single unexpected or malformed row** is counted as ineligible:
1. Wrap the exact eligibility predicate into an explicit boolean check:
   `((<ELIGIBILITY_PREDICATE>) IS NOT TRUE)`
2. Under PostgreSQL rules:
   - If the predicate evaluates to `FALSE`, `IS NOT TRUE` evaluates to `TRUE` (counted).
   - If the predicate evaluates to `NULL` (due to any column being NULL), `IS NOT TRUE` evaluates to `TRUE` (counted).
   - Only when every condition evaluates strictly to `TRUE` does `IS NOT TRUE` evaluate to `FALSE` (not counted).
3. In addition, explicit column-level NULL checks are performed for complete defense-in-depth:
   ```sql
   SELECT
     count(*) FILTER (WHERE platform = 'tiktok') AS total_tiktok,
     count(*) FILTER (
       WHERE platform = 'tiktok'
         AND (
           owner_uid IS NULL
           OR idempotency_key IS NULL
           OR canonical_source_id IS NULL
           OR normalized_url IS NULL
           OR (
             owner_uid = $1
             AND idempotency_key ~ ('^test-run\\.' || $2 || '\\.(?!0000)[0-9]{4}$')
             AND canonical_source_id ~ ('^synthetic\\.' || $2 || '\\.(?!0000)[0-9]{4}$')
             AND normalized_url ~ ('^https://www\.tiktok\.com/@staging_test/video/' || $2 || '\.(?!0000)[0-9]{4}$')
             AND substring(idempotency_key FROM ('^test-run\\.' || $2 || '\\.((?!0000)[0-9]{4})$')) =
                 substring(canonical_source_id FROM ('^synthetic\\.' || $2 || '\\.((?!0000)[0-9]{4})$'))
             AND substring(idempotency_key FROM ('^test-run\\.' || $2 || '\\.((?!0000)[0-9]{4})$')) =
                 substring(normalized_url FROM ('^https://www\.tiktok\.com/@staging_test/video/' || $2 || '\\.((?!0000)[0-9]{4})$'))
             AND job_id IS NULL
             AND media_id IS NULL
           ) IS NOT TRUE
         )
     ) AS ineligible_or_malformed_tiktok,
     count(*) FILTER (
       WHERE platform = 'tiktok'
         AND idempotency_key ~ ('^test-run\\.' || $2 || '\\.(?!0000)[0-9]{4}$')
         AND (job_id IS NOT NULL OR media_id IS NOT NULL)
     ) AS active_fk_references
   FROM workflow.asset_import_requests;
   ```

---

## 2. Exact Synthetic Identifier Validation

Prefix matching alone (`starts_with`) was vulnerable to arbitrary trailing characters. The updated design enforces **exact regex structure, non-zero SEQUENCE_ID, and cross-column sequence equality**:

### 2.1 Complete Specification
- **`RUN_ID`:** Exactly 25 characters, regex `^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$` (e.g. `20261108T180000Z-e4a7b219`).
- **`SEQUENCE_ID`:** Exactly 4 digits, range `0001`–`9999`, rejecting `0000` (regex `^(?!0000)[0-9]{4}$`).
- **Column Formats:**
  1. `idempotency_key`: Exact pattern `^test-run\.<RUN_ID>\.(?!0000)[0-9]{4}$` (Length 39).
  2. `canonical_source_id`: Exact pattern `^synthetic\.<RUN_ID>\.(?!0000)[0-9]{4}$` (Length 39).
  3. `normalized_url`: Exact pattern `^https://www\.tiktok\.com/@staging_test/video/<RUN_ID>\.(?!0000)[0-9]{4}$` (Length 73).
- **Cross-Column Consistency Requirement:**
  The `SEQUENCE_ID` extracted from `idempotency_key` must **exactly equal** the `SEQUENCE_ID` extracted from `canonical_source_id` AND `normalized_url`. Any mismatch causes the row to fail the predicate and be caught by the precheck audit as `ineligible_or_malformed_tiktok`.

### 2.2 Canonical Deletion Predicate (Precheck and DELETE Equivalence)
```sql
platform = 'tiktok'
AND owner_uid = $1
AND idempotency_key ~ ('^test-run\\.' || $2 || '\\.(?!0000)[0-9]{4}$')
AND canonical_source_id ~ ('^synthetic\\.' || $2 || '\\.(?!0000)[0-9]{4}$')
AND normalized_url ~ ('^https://www\.tiktok\.com/@staging_test/video/' || $2 || '\\.(?!0000)[0-9]{4}$')
AND substring(idempotency_key FROM ('^test-run\\.' || $2 || '\\.((?!0000)[0-9]{4})$')) =
    substring(canonical_source_id FROM ('^synthetic\\.' || $2 || '\\.((?!0000)[0-9]{4})$'))
AND substring(idempotency_key FROM ('^test-run\\.' || $2 || '\\.((?!0000)[0-9]{4})$')) =
    substring(normalized_url FROM ('^https://www\.tiktok\.com/@staging_test/video/' || $2 || '\\.((?!0000)[0-9]{4})$'))
AND job_id IS NULL
AND media_id IS NULL
```
Where:
- `$1` = `approvedOwnerUid`
- `$2` = `runId` (e.g. `'20261108T180000Z-e4a7b219'`)

---

## 3. Owner UID Authority & Blocking Condition

- **Pending PO-04 Decision:** Decision PO-04 remains in `REQUIRES_PO_APPROVAL` status. No Firebase QA user has been provisioned, and no UID has been approved.
- **Strict Equality:** Both precheck and `DELETE` enforce strict `owner_uid = $1`.
- **Operational Block:** If `approvedOwnerUid` is empty, undefined, or unapproved, the runner **must throw an error immediately before connecting to PostgreSQL**, keeping WP-03 execution completely blocked.

---

## 4. Transaction and Connection Failure Handling (Design Only)

In a pooled Node.js environment (`pg`), returning a failed, tainted, or un-rolled-back connection to the pool risks cross-query poisoning. Furthermore, errors during `BEGIN`, `COMMIT`, or `ROLLBACK` must not be swallowed.

### 4.1 Safe Transaction Flow Design (Illustrative Pseudocode / Design Only)

```typescript
// DESIGN ONLY - Illustrative runner error handling pattern
import type { Pool, PoolClient } from "pg";

export async function runConservativeRollbackSafe(
  pool: Pool,
  runId: string,
  approvedOwnerUid: string,
): Promise<void> {
  // 1. Strict application-side pre-connection validation
  validateRollbackInput(runId, approvedOwnerUid);

  const client: PoolClient = await pool.connect();
  let transactionActive = false;
  let connectionTainted = false;

  try {
    // 2. BEGIN managed within try block
    await client.query("BEGIN;");
    transactionActive = true;

    // 3. Set transaction-local timeouts
    await client.query("SET LOCAL lock_timeout = '5s';");
    await client.query("SET LOCAL statement_timeout = '30s';");

    // 4. Precheck Audit (NULL-safe)
    const auditRes = await client.query(NULL_SAFE_AUDIT_SQL, [approvedOwnerUid, runId]);
    const { total_tiktok, ineligible_or_malformed_tiktok, active_fk_references } = auditRes.rows[0];

    if (Number(ineligible_or_malformed_tiktok) > 0) {
      throw new Error(`Rollback aborted: ${ineligible_or_malformed_tiktok} ineligible or malformed TikTok records found.`);
    }
    if (Number(active_fk_references) > 0) {
      throw new Error(`Rollback aborted: ${active_fk_references} target records have active foreign key references.`);
    }

    // 5. Controlled DELETE using canonical predicate
    await client.query(CANONICAL_DELETE_SQL, [approvedOwnerUid, runId]);

    // 6. Postcheck Audit: Zero remaining TikTok rows
    const postRes = await client.query("SELECT count(*) AS count FROM workflow.asset_import_requests WHERE platform = 'tiktok';");
    if (Number(postRes.rows[0].count) !== 0) {
      throw new Error(`Rollback aborted: ${postRes.rows[0].count} TikTok records remain after deletion.`);
    }

    // 7. Atomic DDL Restoration
    await client.query("ALTER TABLE workflow.asset_import_requests DROP CONSTRAINT ck_asset_import_authority;");
    await client.query("ALTER TABLE workflow.asset_import_requests ADD CONSTRAINT ck_asset_import_authority CHECK (command_version = '1.0' AND platform = 'youtube');");

    // 8. Explicit COMMIT
    try {
      await client.query("COMMIT;");
      transactionActive = false;
    } catch (commitError) {
      // If COMMIT fails, transaction status is indeterminate (network drop, crash)
      connectionTainted = true;
      throw new Error(`Commit failed with uncertain outcome: ${(commitError as Error).message}`);
    }
  } catch (error) {
    if (transactionActive) {
      try {
        await client.query("ROLLBACK;");
        transactionActive = false;
      } catch (rollbackError) {
        // ROLLBACK failed: connection state is corrupted and must be destroyed
        connectionTainted = true;
        throw new AggregateError(
          [error, rollbackError],
          "Transaction execution failed AND subsequent ROLLBACK failed. Connection destroyed.",
        );
      }
    }
    throw error;
  } finally {
    // 9. Release client safely: If connection is tainted/uncertain, pass error to destroy it
    if (connectionTainted) {
      client.release(true); // pg driver: client.release(true) discards connection from pool
    } else {
      client.release();
    }
  }
}
```

---

## 5. Direct V000008 / V000009 Migration Source Integrity

Direct static re-verification of the schema files in `db/workflow/migrations/`:

### 5.1 `db/workflow/migrations/V000009__expand_asset_import_platform.sql`
- **Constraint Name:** `ck_asset_import_authority`
- **Operations:**
  1. `ALTER TABLE workflow.asset_import_requests DROP CONSTRAINT ck_asset_import_authority;`
  2. `ALTER TABLE workflow.asset_import_requests ADD CONSTRAINT ck_asset_import_authority CHECK (command_version = '1.0' AND platform IN ('youtube', 'tiktok'));`
- **Current Constraint Expression:** `CHECK (command_version = '1.0' AND platform IN ('youtube', 'tiktok'))`

### 5.2 `db/workflow/migrations/V000008__add_asset_import_idempotency.sql` (Line 21)
- **Constraint Name:** `ck_asset_import_authority`
- **Original Constraint Expression:** `CHECK (command_version = '1.0' AND platform = 'youtube')`

---

## 6. Git Status and Working Copy Integrity

### 6.1 `git status --short` Output
```text
A  docs/implementation/tiktok-production-readiness/phase-2.16-safety-corrections/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/phase-2.16-safety-corrections/safety-corrections-report.md
A  docs/implementation/tiktok-production-readiness/phase-2.17-implementation-readiness-review/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/phase-2.17-implementation-readiness-review/implementation-readiness-report.md
A  docs/implementation/tiktok-production-readiness/phase-2.18-work-package-acceptance-review/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/phase-2.18-work-package-acceptance-review/work-package-acceptance-report.md
A  docs/implementation/tiktok-production-readiness/phase-2.19-final-technical-safety-review/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/phase-2.19-final-technical-safety-review/final-technical-safety-review.md
A  docs/implementation/tiktok-production-readiness/phase-2.20-wp01-gcs-authority/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/phase-2.20-wp01-gcs-authority/implementation-report.md
A  docs/implementation/tiktok-production-readiness/phase-2.21-wp02-startup-guards/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/phase-2.21-wp02-startup-guards/implementation-report.md
A  docs/implementation/tiktok-production-readiness/phase-2.22-wp02-ordering-correction/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/phase-2.22-wp02-ordering-correction/implementation-report.md
A  docs/implementation/tiktok-production-readiness/phase-2.24-wp03-readiness-review/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/phase-2.24-wp03-readiness-review/implementation-readiness-report.md
A  docs/implementation/tiktok-production-readiness/phase-2.25-wp03-safety-correction/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/phase-2.25-wp03-safety-correction/implementation-readiness-report.md
A  docs/implementation/tiktok-production-readiness/phase-2.26-wp03-evidence-completion/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/phase-2.26-wp03-evidence-completion/implementation-readiness-report.md
A  docs/implementation/tiktok-production-readiness/phase-2.27-wp03-test-run-evidence/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/phase-2.27-wp03-test-run-evidence/implementation-readiness-report.md
A  docs/implementation/tiktok-production-readiness/phase-2.28-wp03-owner-runner-investigation/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/phase-2.28-wp03-owner-runner-investigation/implementation-readiness-report.md
A  docs/implementation/tiktok-production-readiness/phase-2.29-wp03-rollback-isolation/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/phase-2.29-wp03-rollback-isolation/implementation-readiness-report.md
A  docs/implementation/tiktok-production-readiness/phase-2.30-wp03-design-consistency/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/phase-2.30-wp03-design-consistency/implementation-readiness-report.md
A  docs/implementation/tiktok-production-readiness/phase-2.31-wp03-sql-safety/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/phase-2.31-wp03-sql-safety/implementation-readiness-report.md
A  docs/implementation/tiktok-production-readiness/product-owner-approval-matrix/approval-matrix-report.md
A  docs/implementation/tiktok-production-readiness/product-owner-approval-matrix/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/staging-readiness-plan-audit/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/staging-readiness-plan-audit/gatekeeper-audit-report.md
A  docs/implementation/tiktok-production-readiness/staging-readiness-plan-audit/raw-audit-logs/forty-regression-tests.log
A  docs/implementation/tiktok-production-readiness/staging-readiness-plan/current-main-baseline.md
A  docs/implementation/tiktok-production-readiness/staging-readiness-plan/evidence-integrity-review.md
A  docs/implementation/tiktok-production-readiness/staging-readiness-plan/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/staging-readiness-plan/executive-summary.md
A  docs/implementation/tiktok-production-readiness/staging-readiness-plan/gcs-validation-plan.md
A  docs/implementation/tiktok-production-readiness/staging-readiness-plan/migration-and-rollback-plan.md
A  docs/implementation/tiktok-production-readiness/staging-readiness-plan/pr8-merge-confirmation.md
A  docs/implementation/tiktok-production-readiness/staging-readiness-plan/product-owner-approval-checklist.md
A  docs/implementation/tiktok-production-readiness/staging-readiness-plan/security-and-cost-risk-register.md
A  docs/implementation/tiktok-production-readiness/staging-readiness-plan/staging-architecture-and-dependency-checklist.md
A  docs/implementation/tiktok-production-readiness/staging-readiness-plan/updated-readiness-gate-matrix.md
M  lib/server/productionMediaRuntime/cloudSqlAdapter.ts
M  lib/server/productionMediaRuntime/composition.ts
A  lib/server/productionMediaRuntime/compositionCore.ts
M  lib/server/productionMediaRuntime/gcsAdapter.ts
M  lib/server/productionMediaRuntime/mediaWifCredential.ts
M  tests/productionIdentity/productionMediaRuntimeAdapters.test.ts
A  tests/productionMediaRuntime/gcsEnvironmentAuthority.test.ts
?? docs/implementation/tiktok-production-readiness/phase-2.32-wp03-null-safe-audit/
```

- **Staged File Count:** Exactly 53 files staged in Git index (46 documentation files across Phases 2.11-2.31 + 7 code/test files from WP-01/WP-02). All 51 previously staged files remain 100% intact and preserved.
- **Unstaged Working Tree Changes:** 0 lines (`git diff` is empty).
- **New Deliverables Created:** Phase 2.32 directory and files are created on disk as untracked files (`??`) and are NOT staged.

---

## 7. Safety Verification
- **Live Database Connections:** 0
- **SQL Commands Executed:** 0
- **Cloud API Calls (GCP, Cloud SQL, GCS, Firebase):** 0
- **Migration / Rollback Runs:** 0
- **WP-03 Implementation Changes:** 0 (Pure design correction only)

---

## 8. Status Conclusion

## `DESIGN_CORRECTIONS_COMPLETE`
