# Phase 2.29: WP-03 Rollback Isolation Semantics & SQL Parameter Safety Report

**Execution Mode:** STRICT READ-ONLY DESIGN REVIEW
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Isolation)

---

## 1. RUN_ID & SEQUENCE_ID Validation and SQL Parameter Safety

### 1.1 Strict Format Definitions
To completely eliminate SQL wildcard ambiguities, escaping bugs, and injection vectors, `RUN_ID` and `SEQUENCE_ID` are defined with strict character sets and fixed lengths:
- **`RUN_ID` Specification:**
  - Allowed Characters: `[0-9a-f]` (hexadecimal digits) and `T`, `Z` (ISO-8601 timestamp markers).
  - Format: `YYYYMMDDTHHMMSSZ_<hex8>` (e.g. `20261108T180000Z_e4a7b219`).
  - Total Length: Exactly 24 characters.
  - Prohibition: Disallow `%`, `_`, `'`, `"`, `;`, `\`, `-`, whitespace, and SQL punctuation. Note: While `_` is used as a delimiter in strings, in SQL `LIKE` it acts as a single-character wildcard. Therefore, **`LIKE` must never be used** for pattern matching.
- **`SEQUENCE_ID` Specification:**
  - Allowed Characters: `[0-9]` (numeric digits only).
  - Format: `0001` through `9999` (4 zero-padded digits).
- **Embedded `idempotency_key` Format:**
  - `test-run.<RUN_ID>.<SEQUENCE_ID>` (e.g. `test-run.20261108T180000Z_e4a7b219.0001`).
  - Delimiter: Periods (`.`) or hyphens (`-`) which are not SQL wildcards and comply strictly with `ck_asset_import_key` regex `^[A-Za-z0-9._~-]{1,128}$`.
  - Total Length: `9 + 24 + 1 + 4 = 38` characters (well below the 128 character max).

### 1.2 Avoiding `LIKE` Wildcards via Exact Prefix Matching
In PostgreSQL, `LIKE 'prefix_%'` treats `_` as matching any single character. To guarantee 100% deterministic matching:
1. **Never use `LIKE` or `ILIKE`**.
2. **Use `starts_with(idempotency_key, $1)`** (PostgreSQL 11+) or `substring(idempotency_key FROM 1 FOR length($1)) = $1`.
3. Prefix parameter `$1` is passed as `test-run.<RUN_ID>.` (e.g. `test-run.20261108T180000Z_e4a7b219.`).
4. This ensures that every matched row strictly and unambiguously belongs to the target `RUN_ID`.

### 1.3 Safe Parameter Passing
- **Zero String Concatenation:** Raw SQL queries must NEVER concatenate inputs (e.g., `... WHERE idempotency_key = 'test-run.' || v_run_id` without strict validation).
- **Parameterized Queries:** All runner calls must pass inputs as bound parameters (`$1`, `$2`) through `pg` or `psql -v v_run_prefix='...'`.
- **Pre-Execution Sanitization:** The runner/script must assert that `RUN_ID` matches regex `^[0-9]{8}T[0-9]{6}Z_[a-f0-9]{8}$` before opening any transaction or dispatching SQL.

---

## 2. Rollback Semantics: Comparison of Approaches A vs B

When rolling back migration `V000009` (reverting `ck_asset_import_authority` from `IN ('youtube', 'tiktok')` back to `= 'youtube'`), any row with `platform = 'tiktok'` violates the restored constraint.

| Criterion | Option A: Conservative Rollback | Option B: Run-Scoped Cleanup |
| :--- | :--- | :--- |
| **Strategy** | Target Run cleanup + Full Table Audit + Atomic DDL Reversion | Run-Scoped deletion only; DDL reversion executed only if global TikTok count = 0 |
| **Scope of Deletion** | Exactly target `RUN_ID` synthetic rows | Exactly target `RUN_ID` synthetic rows |
| **Behavior if Other TikTok Rows Exist** | **Aborts transaction immediately** before deleting or altering table. Leaves DB state untouched. | Deletes target `RUN_ID` rows successfully, but **skips DDL reversion** with a warning if other TikTok rows exist. |
| **Data Protection Guarantee** | **Absolute fail-closed:** Guarantees zero loss of concurrent/manual test data, but blocks schema rollback. | Permits incremental cleanup of dead test runs, but leaves `V000009` constraint active. |
| **Constraint Restoration** | Guaranteed atomic restoration of `ck_asset_import_authority CHECK (platform = 'youtube')`. | Not guaranteed; table may remain in `V000009` state if concurrent test runs exist. |
| **Recommendation** | **RECOMMENDED (Option A)** | Not recommended for Staging Gate |

### Justification for Option A (Conservative Rollback)
For staging readiness validation (GATE-08), the goal of rollback testing is to prove that **migration V000009 can be completely and cleanly rolled back to the V000008 schema baseline**. If other TikTok rows exist (whether from an uncleaned previous run or an unexpected tenant), altering the constraint will fail anyway. Option A enforces that tests are run in a controlled, isolated maintenance window, aborting fail-closed if unexpected records exist.

---

## 3. Synthetic Record Eligibility & Deletion Safety Predicates

A record in `workflow.asset_import_requests` is strictly eligible for rollback deletion if and only if **ALL** of the following conditions evaluate to TRUE:

1. **Authenticated Staging Test User:**
   `owner_uid` equals the authorized staging test user UID (to be provisioned only after PO-04 approval).
2. **Exact RUN_ID in `idempotency_key`:**
   `starts_with(idempotency_key, 'test-run.' || :TARGET_RUN_ID || '.') = TRUE`.
3. **Exact RUN_ID in `canonical_source_id`:**
   `starts_with(canonical_source_id, 'synthetic.' || :TARGET_RUN_ID || '.') = TRUE`.
4. **Exact RUN_ID in `normalized_url`:**
   `starts_with(normalized_url, 'https://www.tiktok.com/@staging_test/video/' || :TARGET_RUN_ID || '.') = TRUE`.
5. **Platform Authority:**
   `platform = 'tiktok'`.
6. **No Downstream Foreign Key References:**
   `job_id IS NULL AND media_id IS NULL`.
   (If `job_id` or `media_id` is populated, the record cannot be deleted without evaluating downstream cascade rules; rollback must abort).

### Abort Conditions (Pre-Execution Audit)
If any row in `workflow.asset_import_requests` meets any of the following, the entire rollback transaction is aborted via `RAISE EXCEPTION`:
- `platform = 'tiktok'` but `starts_with(idempotency_key, 'test-run.' || :TARGET_RUN_ID || '.') = FALSE` (Belongs to another run or human tester).
- Any of `owner_uid`, `idempotency_key`, `canonical_source_id`, or `normalized_url` is `NULL` or malformed.
- Target run rows have `job_id IS NOT NULL` or `media_id IS NOT NULL`.

---

## 4. External Migration Operator Safety Protocol

Since the repository contains no automated live migration runner, execution on Staging Cloud SQL is performed by an authorized infrastructure operator. The operator must complete the following mandatory pre-flight checks:

1. **Environment Verification:**
   - Confirm target is strictly `easyslice-staging` (GCP Project Number / ID).
   - Reject any connection if target contains `prod` or `production`.
2. **Target Instance & Database Authority Tuple:**
   - Cloud SQL Instance: Must match the Product Owner-approved staging instance (currently unapproved/pending PO-01).
   - Database: `easyslice_staging`.
   - IAM DB User: Approved staging migration identity.
   - Connection Endpoint: Verified via `gcloud sql instances describe <STAGING_INSTANCE>`.
3. **Migration Script Integrity Check:**
   - Compute SHA-256 hash of `db/workflow/migrations/V000009__expand_asset_import_platform.sql`:
     `sha256sum db/workflow/migrations/V000009__expand_asset_import_platform.sql`
   - Must match the repository version exactly before executing.
4. **Pre-Migration Backup Prerequisite:**
   - Verify completion of an on-demand Cloud SQL snapshot or logical dump (`pg_dump -n workflow`) immediately prior to execution.
5. **Session Safety Configuration:**
   - Set `SET lock_timeout = '5s';` to prevent hanging lock contention on `workflow.asset_import_requests`.
   - Set `SET statement_timeout = '30s';`.

---

## 5. SQL Atomicity & Transaction Flow (Design Only)

The complete rollback workflow must execute inside a single transactional block (`BEGIN ... COMMIT`) to ensure absolute all-or-nothing atomicity:

```text
[BEGIN TRANSACTION]
  │
  ├── 1. SET lock_timeout = '5s'; SET statement_timeout = '30s';
  │
  ├── 2. PRE-CHECK AUDIT:
  │      Query global count of platform = 'tiktok'.
  │      Query count of platform = 'tiktok' NOT matching target RUN_ID.
  │      Query count of target RUN_ID with job_id IS NOT NULL.
  │      -> IF any unexpected rows found: RAISE EXCEPTION -> [ROLLBACK & ABORT]
  │
  ├── 3. CONTROLLED DELETION:
  │      DELETE FROM workflow.asset_import_requests
  │      WHERE platform = 'tiktok'
  │        AND starts_with(idempotency_key, 'test-run.' || :TARGET_RUN_ID || '.')
  │        AND starts_with(canonical_source_id, 'synthetic.' || :TARGET_RUN_ID || '.')
  │        AND starts_with(normalized_url, 'https://www.tiktok.com/@staging_test/video/' || :TARGET_RUN_ID || '.')
  │        AND job_id IS NULL AND media_id IS NULL;
  │
  ├── 4. POST-CHECK AUDIT:
  │      Query count of platform = 'tiktok'.
  │      -> IF count != 0: RAISE EXCEPTION -> [ROLLBACK & ABORT]
  │
  ├── 5. ATOMIC DDL REVERSION:
  │      ALTER TABLE workflow.asset_import_requests
  │        DROP CONSTRAINT ck_asset_import_authority;
  │      ALTER TABLE workflow.asset_import_requests
  │        ADD CONSTRAINT ck_asset_import_authority
  │        CHECK (command_version = '1.0' AND platform = 'youtube');
  │
[COMMIT TRANSACTION]
```

**Atomicity Guarantee:** If any query fails, lock acquisition times out, or `RAISE EXCEPTION` triggers at step 2, 4, or 5, PostgreSQL automatically rolls back the entire transaction. Zero records remain deleted, and the table schema remains unchanged.

---

## 6. Git Status and Working Copy Integrity
- **Branch:** `jules-3110607620436353703-ca56d790`
- **HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
- **Staged Files:** 32 files (preserved exactly).
- **Unstaged Working Tree Changes:** None (`git diff` is empty).
- **New Deliverables Created:**
  - `docs/implementation/tiktok-production-readiness/phase-2.29-wp03-rollback-isolation/implementation-readiness-report.md`
  - `docs/implementation/tiktok-production-readiness/phase-2.29-wp03-rollback-isolation/evidence-manifest.json`

---

## 7. Safety Verification
- **External Connections:** 0 (No GCP, Cloud SQL, GCS, or Firebase calls).
- **Database Executions:** 0 (No SQL or migrations executed).
- **Staging Authority:** Staging Cloud SQL connection parameters remain strictly UNAPPROVED pending Product Owner Decision PO-01.
