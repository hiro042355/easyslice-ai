# Phase 2.31: WP-03 SQL Parameter and Deletion Scope Final Design Correction Report

**Execution Mode:** STRICT READ-ONLY DESIGN CORRECTION
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Isolation)

---

## 1. SQL Execution Model: PostgreSQL Driver Parameterization Exclusively

In strict adherence to design requirements, **the Node.js PostgreSQL driver parameterization model (`$1`, `$2`, `$3`, etc.) is the exclusive, authoritative operational execution model**. The `psql` DO-block illustrative example is formally removed from operational rollback designs to eliminate variable expansion ambiguities and CLI quotation pitfalls.

### 1.1 Strict Application-Side Parameter Validation
Before executing any SQL statement or opening a database connection/transaction, the runner validates all parameters in memory:

```typescript
const RUN_ID_REGEX = /^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$/;
const SEQUENCE_ID_REGEX = /^(?!0000)[0-9]{4}$/;

function validateRollbackParameters(
  runId: string,
  approvedOwnerUid: string,
): Readonly<{ keyPrefix: string; sourcePrefix: string; urlPrefix: string }> {
  if (!RUN_ID_REGEX.test(runId)) {
    throw new Error(`Invalid RUN_ID format: "${runId}". Must match ${RUN_ID_REGEX}`);
  }
  if (!approvedOwnerUid || approvedOwnerUid.trim().length === 0) {
    throw new Error("Approved Staging QA UID is required and cannot be empty.");
  }
  // Construct prefixes strictly outside SQL
  const keyPrefix = `test-run.${runId}.`;
  const sourcePrefix = `synthetic.${runId}.`;
  const urlPrefix = `https://www.tiktok.com/@staging_test/video/${runId}.`;
  return Object.freeze({ keyPrefix, sourcePrefix, urlPrefix });
}
```

### 1.2 Concrete Parameterized Query Examples with Explicit Transaction Handling
Parameters are passed out-of-band via the PostgreSQL binary/text protocol as array elements. No RUN_ID, UID, or prefix is interpolated directly into query strings.

```typescript
import type { PoolClient } from "pg";

export async function executeConservativeRollback(
  client: PoolClient,
  runId: string,
  approvedOwnerUid: string,
): Promise<void> {
  const { keyPrefix, sourcePrefix, urlPrefix } = validateRollbackParameters(runId, approvedOwnerUid);

  await client.query("BEGIN;");
  try {
    // 1. Transaction-scoped safety timeouts
    await client.query("SET LOCAL lock_timeout = '5s';");
    await client.query("SET LOCAL statement_timeout = '30s';");

    // 2. Precheck audit: Inspect every TikTok row
    const auditSql = `
      SELECT
        count(*) FILTER (WHERE platform = 'tiktok') AS total_tiktok,
        count(*) FILTER (
          WHERE platform = 'tiktok'
            AND NOT (
              owner_uid = $1
              AND starts_with(idempotency_key, $2)
              AND starts_with(canonical_source_id, $3)
              AND starts_with(normalized_url, $4)
              AND job_id IS NULL
              AND media_id IS NULL
            )
        ) AS ineligible_tiktok,
        count(*) FILTER (
          WHERE platform = 'tiktok'
            AND starts_with(idempotency_key, $2)
            AND (job_id IS NOT NULL OR media_id IS NOT NULL)
        ) AS active_fk_references
      FROM workflow.asset_import_requests;
    `;
    const auditRes = await client.query(auditSql, [approvedOwnerUid, keyPrefix, sourcePrefix, urlPrefix]);
    const { total_tiktok, ineligible_tiktok, active_fk_references } = auditRes.rows[0];

    if (Number(ineligible_tiktok) > 0) {
      throw new Error(`Rollback aborted: Found ${ineligible_tiktok} ineligible or alien TikTok rows.`);
    }
    if (Number(active_fk_references) > 0) {
      throw new Error(`Rollback aborted: Found ${active_fk_references} target rows with active job_id/media_id foreign keys.`);
    }

    // 3. Deletion: Only eligible synthetic target-run records
    const deleteSql = `
      DELETE FROM workflow.asset_import_requests
      WHERE platform = 'tiktok'
        AND owner_uid = $1
        AND starts_with(idempotency_key, $2)
        AND starts_with(canonical_source_id, $3)
        AND starts_with(normalized_url, $4)
        AND job_id IS NULL
        AND media_id IS NULL;
    `;
    await client.query(deleteSql, [approvedOwnerUid, keyPrefix, sourcePrefix, urlPrefix]);

    // 4. Postcheck audit: Require zero remaining TikTok records
    const postRes = await client.query("SELECT count(*) AS count FROM workflow.asset_import_requests WHERE platform = 'tiktok';");
    if (Number(postRes.rows[0].count) !== 0) {
      throw new Error(`Rollback aborted: ${postRes.rows[0].count} TikTok records remain after deletion.`);
    }

    // 5. Constraint restoration: Drop V000009 constraint and re-add V000008 YouTube-only constraint
    await client.query("ALTER TABLE workflow.asset_import_requests DROP CONSTRAINT ck_asset_import_authority;");
    await client.query("ALTER TABLE workflow.asset_import_requests ADD CONSTRAINT ck_asset_import_authority CHECK (command_version = '1.0' AND platform = 'youtube');");

    // 6. Explicit COMMIT only after all operations succeed
    await client.query("COMMIT;");
  } catch (error) {
    // Explicit ROLLBACK on any error
    await client.query("ROLLBACK;").catch(() => {});
    throw error;
  }
}
```

---

## 2. Owner Isolation & Staging QA UID Authority

1. **Exact `owner_uid` Equality Condition:**
   The `DELETE` query and the precheck audit query enforce strict equality:
   `owner_uid = $1`
   where `$1` is the authorized Staging QA Firebase UID.
2. **Precheck Ownership Verification:**
   The precheck asserts that 100% of rows matching the target `RUN_ID` belong to `approvedOwnerUid`. If any row has a mismatched, null, or empty `owner_uid`, the precheck raises an error and halts execution before any `DELETE`.
3. **Pending Product Owner Decision PO-04:**
   - The Staging QA Firebase user has **not** been created, and its UID is **not approved**.
   - Decision PO-04 remains in `REQUIRES_PO_APPROVAL` state.
   - Example strings (e.g. `staging-qa-runner-uid`) are strictly placeholders and must never be treated as approved.
   - **Operational Block:** Until Decision PO-04 is formally approved by the Product Owner and the staging user is provisioned in Firebase, **WP-03 staging execution remains completely blocked**.

---

## 3. Canonical Synthetic Record Eligibility Predicate

To prevent any data loss or unintended deletions, we define **one single canonical predicate** for a deletable synthetic record. Both the precheck audit and the `DELETE` query use this exact predicate:

### The Canonical Predicate
```sql
platform = 'tiktok'
AND owner_uid = $1
AND starts_with(idempotency_key, $2)
AND starts_with(canonical_source_id, $3)
AND starts_with(normalized_url, $4)
AND job_id IS NULL
AND media_id IS NULL
```
Where:
- `$1` = `approvedOwnerUid`
- `$2` = `'test-run.' || runId || '.'`
- `$3` = `'synthetic.' || runId || '.'`
- `$4` = `'https://www.tiktok.com/@staging_test/video/' || runId || '.'`

### Safety Boundaries
1. **Precheck Abort Rule:** If there exists **any** row in `workflow.asset_import_requests` where `platform = 'tiktok'` that does NOT satisfy this canonical predicate, execution immediately aborts before deleting anything.
2. **No Deletion of Dependent Tables:** The tables `workflow.jobs` and `workflow.media` are **never touched or deleted**. Furthermore, any record with `job_id IS NOT NULL` or `media_id IS NOT NULL` fails the predicate (`job_id IS NULL AND media_id IS NULL`), causing execution to abort without deleting.

---

## 4. Full Transaction Sequence & Failure Handling

```text
[CLIENT CONNECTS]
       │
       ▼
1.  BEGIN;
       │
2.  SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '30s';
       │
3.  PRECHECK AUDIT:
    Query table for all rows with platform = 'tiktok'.
    Assert total rows == eligible rows.
    Assert active FK references == 0.
    [IF ANY CHECK FAILS] ──► Issue explicit ROLLBACK; ──► Terminate with Error.
       │
4.  DELETE:
    Delete eligible target-run synthetic records using canonical predicate.
       │
5.  POSTCHECK AUDIT:
    Query count of platform = 'tiktok'.
    Assert remaining count == 0.
    [IF COUNT != 0] ────────► Issue explicit ROLLBACK; ──► Terminate with Error.
       │
6.  DDL RESTORATION:
    ALTER TABLE workflow.asset_import_requests DROP CONSTRAINT ck_asset_import_authority;
    ALTER TABLE workflow.asset_import_requests ADD CONSTRAINT ck_asset_import_authority
      CHECK (command_version = '1.0' AND platform = 'youtube');
       │
7.  COMMIT;
       │
       ▼
[TRANSACTION COMPLETE & SAFE]
```

### Clarification on PostgreSQL Transaction Failure Semantics
PostgreSQL does **not** automatically complete a rollback on the client connection when an SQL statement fails. When an error occurs (such as check violation or timeout), PostgreSQL transitions the transaction block into an aborted state (`ERROR: current transaction is aborted, commands ignored until end of transaction block`). The client runner must catch the error in a `try...catch` block and **explicitly dispatch `ROLLBACK;`** (or close the client connection). Only upon explicit `ROLLBACK;` are all locks released, table mutations undone, and the connection returned safely to the pool.

---

## 5. Direct V000008 / V000009 Migration Source Evidence

An authoritative inspection of the physical migration SQL files in `db/workflow/migrations/` establishes:

### 5.1 Physical File: `db/workflow/migrations/V000009__expand_asset_import_platform.sql`
- **Exact Content:**
  ```sql
  -- V000009__expand_asset_import_platform.sql
  -- Additive migration: expand asset_import_requests platform check constraint to include 'tiktok'

  ALTER TABLE workflow.asset_import_requests
    DROP CONSTRAINT ck_asset_import_authority;

  ALTER TABLE workflow.asset_import_requests
    ADD CONSTRAINT ck_asset_import_authority
    CHECK (command_version = '1.0' AND platform IN ('youtube', 'tiktok'));
  ```
- **Constraint Name:** `ck_asset_import_authority`
- **Existing Definition in V000009:** `CHECK (command_version = '1.0' AND platform IN ('youtube', 'tiktok'))`
- **Does Migration Drop and Recreate:** **YES**. It drops `ck_asset_import_authority` and adds a new constraint with the same name.

### 5.2 Physical File: `db/workflow/migrations/V000008__add_asset_import_idempotency.sql`
- **Exact Line 21:**
  ```sql
  CONSTRAINT ck_asset_import_authority CHECK (command_version = '1.0' AND platform = 'youtube'),
  ```
- **Exact Original V000008 Definition:** `CHECK (command_version = '1.0' AND platform = 'youtube')`.

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
A  docs/implementation/tiktok-production-readiness/phase-2.30-wp03-design-consistency/implementation-report.md
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
```

### 6.2 Explanation of Phase 2.30 File Status Output
- **Direct Cause:** In Phase 2.30, the files `docs/implementation/tiktok-production-readiness/phase-2.30-wp03-design-consistency/implementation-readiness-report.md` and `evidence-manifest.json` were created on the filesystem **after** the initial `git status --short` command was executed during the tool run.
- **Current State:** Both Phase 2.30 files are present on disk. When checked by `git status`, they appear as staged (`A`) because the index was preserved.
- **Phase 2.31 Files:** In strict accordance with Section 7 instructions, the new Phase 2.31 files are created on disk as untracked files and are **NOT staged**.
- **Preservation of Staged Changes:** All 51 staged files (44 documentation files + 7 code/test files from WP-01/WP-02) are 100% intact. Zero files have been unstaged, reset, or mutated.

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
