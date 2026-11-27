# Deliverable 05: File-Level Freebuff Implementation Roadmap

This roadmap gives file-by-file instructions for Freebuff or any subsequent autonomous engineer to complete the remaining tasks.

---

## Package 1: CI Migration Test Alignment (WP-03 CI Stabilization)
- **Objective:** Fix the failing assertion in the reconciliation migration test so the CI workflow runs 100% green on GitHub Actions runners.
- **Existing Implementation:**
  `tests/postgresqlTestEnvironment/reconciliationMigration.test.ts` asserts only 3 migrations (`000001` through `000003`).
- **Missing Implementation:**
  Assertion update to include all 9 migrations currently in `db/workflow/migrations/`.
- **Exact Affected Files:**
  `tests/postgresqlTestEnvironment/reconciliationMigration.test.ts` (lines 89–94, 127).
- **Dependencies:** PO Approval PO-01.
- **Required Tests:**
  Execute via GitHub Actions workflow `.github/workflows/test-postgresql-wp03.yml`.
- **Expected Outcome:** Test passes without assertion mismatch.
- **Failure Conditions:** If any migration between 4 and 9 has an actual schema error when run sequentially from scratch.
- **Acceptance Criteria:** CI runner reports 0 failures across all 13 workflow steps.

---

## Package 2: Staging Database Migration V000009 Application
- **Objective:** Apply migration V000009 to the staging PostgreSQL database.
- **Existing Implementation:**
  Migration file exists at `db/workflow/migrations/V000009__expand_asset_import_platform.sql`.
- **Missing Implementation:**
  Execution against staging Cloud SQL instance `easyslice_staging`.
- **Exact Affected Files:** None in git repo (database operational state change).
- **Dependencies:** PO Approval PO-02, Staging Cloud SQL proxy access.
- **Required Tests:**
  `tests/workflowMigration/stagingMigrationScriptIntegrity.test.ts`.
- **Expected Outcome:** `ck_asset_import_authority` check constraint allows `'youtube'` and `'tiktok'`.
- **Failure Conditions:** Lock timeout or active blocking transaction holding locks on `asset_import_requests`.
- **Acceptance Criteria:**
  ```sql
  SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid = 'workflow.asset_import_requests'::regclass
    AND conname = 'ck_asset_import_authority';
  ```
  Returns: `CHECK ((platform)::text = ANY ((ARRAY['youtube'::character varying, 'tiktok'::character varying])::text[]))`.

---

## Package 3: Staging Cloud Storage & WIF Configuration
- **Objective:** Create the staging bucket with lifecycle policies and configure IAM for staging app service account.
- **Existing Implementation:**
  Runtime bucket authority resolver in `lib/server/productionMediaRuntime/gcsAdapter.ts` already expects `easyslice-staging-media-artifacts`.
- **Missing Implementation:**
  GCP provisioning of `gs://easyslice-staging-media-artifacts`.
- **Exact Affected Files:** Cloud infrastructure configuration / Terraform / GCP console.
- **Dependencies:** PO Approval PO-03, PO-04.
- **Required Tests:**
  `tests/productionMediaRuntime/gcsEnvironmentAuthority.test.ts`.
- **Expected Outcome:** Bucket created in `asia-northeast1`, 3-day age deletion lifecycle rule active, CORS configured for `https://staging.nexcut.app`.
- **Failure Conditions:** Public access not blocked, or bucket created in incorrect region.
- **Acceptance Criteria:** `gsutil cors get gs://easyslice-staging-media-artifacts` returns valid CORS headers.

---

## Package 4: Staging End-to-End Verification Runbook
- **Objective:** Run live smoke test of TikTok URL guidance and MP4 video clipping pipeline on staging.
- **Existing Implementation:**
  - Classification: `lib/urlAcquisition/classifyTikTokUrl.ts`
  - Durable Admission: `lib/client/durableMediaAdmission.ts`
  - Optimization: `lib/clipPlatform/platformAwareOptimization.ts`
- **Missing Implementation:**
  Execution of automated verification script against live staging preview URL.
- **Exact Affected Files:**
  `scripts/staging/verifyTikTokStagingFlow.ts` (to be created by Freebuff if automated, or manual via curl/Postman).
- **Dependencies:** Packages 1, 2, 3 complete, PO Approval PO-05.
- **Required Tests:**
  Submit synthetic 10MB test MP4, verify signed URL acquisition, upload chunks, trigger clipping, verify vertical output cut.
- **Expected Outcome:** Status 200, valid MP4 video produced with 9:16 aspect ratio.
- **Failure Conditions:** Upload rejected, database error, or FFmpeg crash.
- **Acceptance Criteria:** Complete video artifact playable and stored in staging bucket.
