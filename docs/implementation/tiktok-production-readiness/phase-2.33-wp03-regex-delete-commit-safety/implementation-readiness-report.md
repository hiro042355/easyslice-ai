# Phase 2.33: WP-03 PostgreSQL Regex, DELETE Equivalence & Commit-Uncertainty Correction Report

**Execution Mode:** STRICT READ-ONLY DESIGN CORRECTION
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Isolation)

---

## 1. PostgreSQL Regex Escaping Findings & Corrections

### 1.1 Escaping Analysis under `standard_conforming_strings = on`
In PostgreSQL (versions 9.1+ default to `standard_conforming_strings = on`), string literals enclosed in single quotes treat backslashes `\` as regular characters, not escape characters.
- In Phase 2.32, the JS/TS string literal written as `'^test-run\\.'` in Node.js sent `'^test-run\.'` over the wire.
- In PostgreSQL's POSIX regex engine (`~`), `\.` matches an escaped dot, i.e., a literal period `.`.
- However, when written directly in pure SQL files or within SQL string literals, confusion often arises if double backslashes are used where only a single backslash is needed in standard SQL string literals, or when dots are left unescaped (matching any character).

### 1.2 Multi-Layer String and Regex Escaping Specification
To ensure that literal dots are matched **strictly as literal dots** and slashes as literal slashes across the application, driver, and database:

| Pattern Field | TypeScript String Literal (as written in code) | Value Sent via Driver Protocol | Regex Pattern Received by PostgreSQL Engine | Expected Match Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `idempotency_key` | `"^test-run\\." + runId + "\\.(?!0000)[0-9]{4}$"` | `^test-run\.<RUN_ID>\.(?!0000)[0-9]{4}$` | `^test-run\.<RUN_ID>\.(?!0000)[0-9]{4}$` | Matches literal `test-run.`, exact `RUN_ID`, literal `.`, and exact 4 digits (0001–9999). |
| `canonical_source_id` | `"^synthetic\\." + runId + "\\.(?!0000)[0-9]{4}$"` | `^synthetic\.<RUN_ID>\.(?!0000)[0-9]{4}$` | `^synthetic\.<RUN_ID>\.(?!0000)[0-9]{4}$` | Matches literal `synthetic.`, exact `RUN_ID`, literal `.`, and exact 4 digits (0001–9999). |
| `normalized_url` | `"^https://www\\.tiktok\\.com/@staging_test/video/" + runId + "\\.(?!0000)[0-9]{4}$"` | `^https://www\.tiktok\.com/@staging_test/video/<RUN_ID>\.(?!0000)[0-9]{4}$` | `^https://www\.tiktok\.com/@staging_test/video/<RUN_ID>\.(?!0000)[0-9]{4}$` | Matches exact TikTok URL prefix with literal dots, exact `RUN_ID`, literal `.`, and exact 4 digits. |
| `substring(...)` Extraction | `"^test-run\\." + runId + "\\.((?!0000)[0-9]{4})$"` | `^test-run\.<RUN_ID>\.((?!0000)[0-9]{4})$` | `^test-run\.<RUN_ID>\.((?!0000)[0-9]{4})$` | Captures the exact 4-digit sequence ID for cross-column equality verification. |

### 1.3 Concrete Invalid Examples That Must Be Rejected
Under this regex specification:
1. `test-runX20261108T180000Z-e4a7b219.0001` -> **REJECTED** (literal dot required after `test-run`).
2. `test-run.20261108T180000Z-e4a7b219X0001` -> **REJECTED** (literal dot required before sequence).
3. `test-run.20261108T180000Z-e4a7b219.0000` -> **REJECTED** (`0000` disallowed by negative lookahead `(?!0000)`).
4. `test-run.20261108T180000Z-e4a7b219.0001_extra` -> **REJECTED** (trailing characters disallowed by `$`).
5. `test-run.20261108T180000Z-e4a7b219.1` -> **REJECTED** (must be exactly 4 digits).
6. `https://wwwXtiktokXcom/@staging_test/video/...` -> **REJECTED** (dots in domain must be literal `.`).

---

## 2. Exact Identifier Length and Format Audit

### 2.1 Format and Length Breakdown
Recalculating exact character lengths from literal formats:
1. **`RUN_ID`:**
   - Format: `^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$` (e.g., `20261108T180000Z-e4a7b219`).
   - Length: `8 + 1 + 6 + 1 + 1 + 8 = 25` characters.
2. **`SEQUENCE_ID`:**
   - Format: `^(?!0000)[0-9]{4}$` (range `0001` through `9999`).
   - Length: Exactly 4 characters.
3. **`idempotency_key`:**
   - Format: `test-run.<RUN_ID>.<SEQ>`
   - Length: `9 (prefix "test-run.") + 25 (RUN_ID) + 1 (dot) + 4 (SEQ) = 39` characters.
   - Matches `ck_asset_import_key` (`^[A-Za-z0-9._~-]{1,128}$`).
4. **`canonical_source_id`:**
   - Format: `synthetic.<RUN_ID>.<SEQ>`
   - Length: `10 (prefix "synthetic.") + 25 (RUN_ID) + 1 (dot) + 4 (SEQ) = 40` characters.
     *(Correction Note: In Phase 2.32, this was erroneously cited as 39 characters. The prefix `synthetic.` is 10 characters, making the exact total 40 characters).*
5. **`normalized_url`:**
   - Format: `https://www.tiktok.com/@staging_test/video/<RUN_ID>.<SEQ>`
   - Length: `43 (prefix "https://www.tiktok.com/@staging_test/video/") + 25 (RUN_ID) + 1 (dot) + 4 (SEQ) = 73` characters.

### 2.2 Cross-Column Triplet Integrity
A record is eligible if and only if all three identifiers (`idempotency_key`, `canonical_source_id`, `normalized_url`):
- Contain the **exact same `RUN_ID`**.
- Contain the **exact same `SEQUENCE_ID`**.
- Contain **no extra prefixes or suffixes**.
- Are strictly **non-NULL**.

---

## 3. Full Canonical Precheck and DELETE SQL

To eliminate parameter ambiguity and maintain 100% equivalence, the runner pre-constructs exact regex patterns in application memory and binds them via positional parameters `$1` through `$5`:
- `$1` = `approvedOwnerUid`
- `$2` = `idempotencyRegex` (`^test-run\.<RUN_ID>\.(?!0000)[0-9]{4}$`)
- `$3` = `canonicalSourceRegex` (`^synthetic\.<RUN_ID>\.(?!0000)[0-9]{4}$`)
- `$4` = `normalizedUrlRegex` (`^https://www\.tiktok\.com/@staging_test/video/<RUN_ID>\.(?!0000)[0-9]{4}$`)
- `$5` = `sequenceCaptureRegex` (`^test-run\.<RUN_ID>\.((?!0000)[0-9]{4})$`)
- `$6` = `canonicalSeqCaptureRegex` (`^synthetic\.<RUN_ID>\.((?!0000)[0-9]{4})$`)
- `$7` = `urlSeqCaptureRegex` (`^https://www\.tiktok\.com/@staging_test/video/<RUN_ID>\.((?!0000)[0-9]{4})$`)

### 3.1 Complete Proposed Precheck Audit SQL
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
          AND idempotency_key ~ $2
          AND canonical_source_id ~ $3
          AND normalized_url ~ $4
          AND substring(idempotency_key FROM $5) = substring(canonical_source_id FROM $6)
          AND substring(idempotency_key FROM $5) = substring(normalized_url FROM $7)
          AND job_id IS NULL
          AND media_id IS NULL
        ) IS NOT TRUE
      )
  ) AS ineligible_or_malformed_tiktok,
  count(*) FILTER (
    WHERE platform = 'tiktok'
      AND idempotency_key ~ $2
      AND (job_id IS NOT NULL OR media_id IS NOT NULL)
  ) AS active_fk_references
FROM workflow.asset_import_requests;
```

### 3.2 Complete Proposed Canonical DELETE SQL
```sql
DELETE FROM workflow.asset_import_requests
WHERE platform = 'tiktok'
  AND owner_uid = $1
  AND idempotency_key ~ $2
  AND canonical_source_id ~ $3
  AND normalized_url ~ $4
  AND substring(idempotency_key FROM $5) = substring(canonical_source_id FROM $6)
  AND substring(idempotency_key FROM $5) = substring(normalized_url FROM $7)
  AND job_id IS NULL
  AND media_id IS NULL;
```

### 3.3 Explicit Predicate Comparison
| Condition | Precheck Audit Predicate | DELETE SQL Predicate | Equivalence Verified |
| :--- | :--- | :--- | :--- |
| Platform | `platform = 'tiktok'` | `platform = 'tiktok'` | **Identical** |
| Owner UID | `owner_uid = $1` | `owner_uid = $1` | **Identical** |
| `idempotency_key` | `idempotency_key ~ $2` | `idempotency_key ~ $2` | **Identical** |
| `canonical_source_id` | `canonical_source_id ~ $3` | `canonical_source_id ~ $3` | **Identical** |
| `normalized_url` | `normalized_url ~ $4` | `normalized_url ~ $4` | **Identical** |
| Sequence Consistency | `sub(key)=$6 AND sub(key)=$7` | `sub(key)=$6 AND sub(key)=$7` | **Identical** |
| Downstream FKs | `job_id IS NULL AND media_id IS NULL` | `job_id IS NULL AND media_id IS NULL` | **Identical** |
| NULL Safety Handling | Checked via `IS NULL` + `IS NOT TRUE` | Evaluates to `FALSE` on NULLs (no deletion) | **100% Safe** |

---

## 4. COMMIT-Uncertainty Handling in Node.js pg Runner (Design Only)

In distributed relational database interactions, errors occur at distinct operational phases. The error handling design must strictly distinguish between these phases:

### 4.1 Distinct Error Failure Modes
1. **Known Transaction Failure Before COMMIT:**
   - A query (precheck, DELETE, postcheck, or DDL) fails or encounters a timeout/constraint violation.
   - The transaction enters an aborted state.
   - An explicit `ROLLBACK;` must be attempted to release locks and cleanly end the transaction.
2. **ROLLBACK Failure:**
   - While attempting to roll back a known failed transaction, the database connection drops or times out.
   - The transaction status is dirty, locks may be held, and connection state cannot be trusted.
   - The connection must be **destroyed immediately** (`client.release(true)`).
3. **COMMIT Outcome Unknown (Commit-Uncertainty):**
   - The runner issues `COMMIT;`, but the network connection drops or a timeout occurs before PostgreSQL's acknowledgment is received.
   - **Crucial Rule:** The runner **must NOT attempt ROLLBACK** after a failed `COMMIT;` (PostgreSQL may have already committed the transaction to disk before the network failed, or aborted it; issuing `ROLLBACK` on an already committed transaction or broken socket is undefined).
   - **Mandatory Action:**
     1. Mark the connection as tainted and **destroy it** (`client.release(true)`).
     2. **Do NOT automatically retry the rollback operation.**
     3. Halt execution and raise a high-severity alert requiring **manual operator database-state reconciliation** before any further automated or manual action is taken.

### 4.2 Illustrative Runner Failure Handling Flow (Design Only)
```typescript
// DESIGN ONLY - Illustrative runner error handling pattern
import type { Pool, PoolClient } from "pg";

export async function runConservativeRollbackWithCommitSafety(
  pool: Pool,
  runId: string,
  approvedOwnerUid: string,
): Promise<void> {
  const params = buildValidatedParameters(runId, approvedOwnerUid);

  const client: PoolClient = await pool.connect();
  let transactionActive = false;
  let connectionTainted = false;

  try {
    // 1. BEGIN inside managed try block
    try {
      await client.query("BEGIN;");
      transactionActive = true;
    } catch (beginError) {
      connectionTainted = true;
      throw new Error(`Failed to initiate transaction: ${(beginError as Error).message}`);
    }

    await client.query("SET LOCAL lock_timeout = '5s';");
    await client.query("SET LOCAL statement_timeout = '30s';");

    // 2. Precheck audit
    const auditRes = await client.query(PRECHECK_SQL, params);
    if (Number(auditRes.rows[0].ineligible_or_malformed_tiktok) > 0) {
      throw new Error(`Precheck failed: ${auditRes.rows[0].ineligible_or_malformed_tiktok} ineligible rows.`);
    }

    // 3. Controlled DELETE
    await client.query(CANONICAL_DELETE_SQL, params);

    // 4. Postcheck audit
    const postRes = await client.query("SELECT count(*) AS count FROM workflow.asset_import_requests WHERE platform = 'tiktok';");
    if (Number(postRes.rows[0].count) !== 0) {
      throw new Error(`Postcheck failed: ${postRes.rows[0].count} TikTok records remain.`);
    }

    // 5. Constraint restoration
    await client.query("ALTER TABLE workflow.asset_import_requests DROP CONSTRAINT ck_asset_import_authority;");
    await client.query("ALTER TABLE workflow.asset_import_requests ADD CONSTRAINT ck_asset_import_authority CHECK (command_version = '1.0' AND platform = 'youtube');");

    // 6. Explicit COMMIT with Commit-Uncertainty Catch
    try {
      await client.query("COMMIT;");
      transactionActive = false; // Successfully confirmed commit
    } catch (commitError) {
      // COMMIT outcome unknown: socket error or server crash
      connectionTainted = true;
      transactionActive = false; // Do not attempt ROLLBACK
      throw new Error(`COMMIT outcome uncertain. Connection destroyed. Manual reconciliation required: ${(commitError as Error).message}`);
    }
  } catch (error) {
    if (transactionActive) {
      try {
        await client.query("ROLLBACK;");
        transactionActive = false;
      } catch (rollbackError) {
        connectionTainted = true;
        throw new AggregateError([error, rollbackError], "Transaction failed AND explicit ROLLBACK failed. Connection destroyed.");
      }
    }
    throw error;
  } finally {
    if (connectionTainted) {
      client.release(true); // Destroy connection from pool
    } else {
      client.release();
    }
  }
}
```

---

## 5. Conservative Rollback Semantics

- **Why another RUN_ID or non-synthetic TikTok row causes abort:**
  The purpose of rolling back `V000009` is to restore the database schema constraint `ck_asset_import_authority` to `platform = 'youtube'`. If any row with `platform = 'tiktok'` remains in `workflow.asset_import_requests` (whether from another test run or a real user), applying `ALTER TABLE ... ADD CONSTRAINT` will fail with PostgreSQL error `23514` (`check_violation`).
- **Data Protection:** Rollback must never unilaterally delete records from another test run or real users. If foreign records exist, the rollback **must abort**, leaving the table in the `V000009` state (`platform IN ('youtube', 'tiktok')`) so no user data is lost.
- **Zero Rows in Other Tables Touched:** The rollback procedure never issues `DELETE` against `workflow.jobs` or `workflow.media`.

---

## 6. PO Approval Status and Execution Boundary

- **PO-01 (Staging Cloud SQL Migration V000009):** `REQUIRES_PO_APPROVAL` (Unapproved).
- **PO-02 (Staging GCS Bucket Validation):** `REQUIRES_PO_APPROVAL` (Unapproved).
- **PO-03 (WIF Identity Provider Binding):** `REQUIRES_PO_APPROVAL` (Unapproved).
- **PO-04 (Staging Test User Authority):** `REQUIRES_PO_APPROVAL` (Unapproved).
- **PO-05 (TikTok Test Video Asset):** `REQUIRES_PO_APPROVAL` (Unapproved).
- **Execution Boundary Statement:**
  WP-03 (and the broader Staging Validation) remains **completely non-executable**. No Firebase accounts will be created, no Cloud SQL instances accessed, and no migrations or rollback scripts run until all five PO approvals and environment credentials have been formally granted.

---

## 7. Git Preservation Evidence

### 7.1 `git status --short` Output
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
A  docs/implementation/tiktok-production-readiness/phase-2.32-wp03-null-safe-audit/evidence-manifest.json
A  docs/implementation/tiktok-production-readiness/phase-2.32-wp03-null-safe-audit/implementation-readiness-report.md
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
?? docs/implementation/tiktok-production-readiness/phase-2.33-wp03-regex-delete-commit-safety/
```

- **Staged File Count:** Exactly 55 files staged in Git index (48 documentation files across Phases 2.11-2.32 + 7 code/test files from WP-01/WP-02).
- **Untracked File Count:** Only Phase 2.33 files exist as untracked (`??`).
- **Working Tree Cleanliness:** `git diff` produces 0 lines.

---

## 8. Safety Verification
- **Live Database Connections:** 0
- **SQL Commands Executed:** 0
- **Cloud API Calls (GCP, Cloud SQL, GCS, Firebase):** 0
- **Migration / Rollback Runs:** 0
- **WP-03 Implementation Changes:** 0 (Pure design correction only)

---

## 9. Status Conclusion

## `DESIGN_CORRECTIONS_COMPLETE`
