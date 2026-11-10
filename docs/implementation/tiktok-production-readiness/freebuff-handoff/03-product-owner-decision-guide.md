# Deliverable 03: Product Owner Decision Resolution Guide

This guide is prepared for the Product Owner (PO) and Freebuff to provide technical clarity on decisions PO-01 through PO-05.

---

## Decision PO-01: CI Migration Test Assertion Alignment (`reconciliationMigration.test.ts`)

### Technical Issue
The test `tests/postgresqlTestEnvironment/reconciliationMigration.test.ts` was written during early development (when only migrations 1 through 3 existed). It asserts:
```typescript
assert.deepEqual(history.rows, [
  { version: "000001", success: true },
  { version: "000002", success: true },
  { version: "000003", success: true },
]);
assert.equal(history.rows.length, 3);
```
However, the repository currently contains 9 migrations (`V000001` through `V000009`). Running the complete migration directory applies all 9 migrations, causing the test assertion to fail in CI check `PostgreSQL 18.4 & V000009 Migration Test`.

### Available Options
1. **Option A (Update Test Expectations to 9):** Update `history.rows` in `tests/postgresqlTestEnvironment/reconciliationMigration.test.ts` to assert that all 9 migrations (`000001` through `000009`) are applied and `history.rows.length === 9`.
2. **Option B (Configure Flyway Target = 3 in Test):** Modify `testBootstrap` or the Flyway execution parameters within the test to set `-target=3`, keeping the test pinned only to early migrations.
3. **Option C (Separate Migration Folders):** Move migrations 4 through 9 into a separate directory.

### Recommended Option
**Option A.** The entire repository operates on the complete schema culminating in `V000009`. Verifying that all migrations from `000001` to `000009` apply cleanly on PostgreSQL 18.4 proves end-to-end schema validity.

### Implementation Consequences
- Changes 6 lines in `tests/postgresqlTestEnvironment/reconciliationMigration.test.ts`.
- Makes GitHub Actions workflow `.github/workflows/test-postgresql-wp03.yml` pass completely green.

### Required Acceptance Evidence
- CI job execution log showing `tests 3, pass 3, fail 0` in `test-postgresql-wp03.yml`.

---

## Decision PO-02: Staging Database Migration V000009 Execution

### Technical Issue
Staging Cloud SQL (`easyslice_staging`) currently restricts `platform` to `'youtube'` in `ck_asset_import_authority`. Ingesting TikTok records on staging will fail with constraint violations until `V000009` is applied.

### Available Options
1. **Option A (Apply V000009 during Maintenance Window):** Execute Flyway migrate or the exact DDL script via Cloud SQL proxy during a scheduled staging maintenance window.
2. **Option B (Defer Staging Migration):** Postpone DDL execution until all frontend UI flows are completed.

### Recommended Option
**Option A.** Applying `V000009` is non-destructive, additive, and takes `< 25ms`.

### Implementation Consequences
- Expands `ck_asset_import_authority` to allow `platform IN ('youtube', 'tiktok')`.
- Zero disruption to existing YouTube import requests.

### Required Acceptance Evidence
- Query output from staging Cloud SQL showing `pg_get_constraintdef` for `ck_asset_import_authority` containing `'tiktok'`.

---

## Decision PO-03: Staging GCS Bucket Provisioning (`easyslice-staging-media-artifacts`)

### Technical Issue
Staging uploads require a dedicated, isolated GCS bucket so staging binaries do not pollute production storage or risk cross-environment data leakage.

### Available Options
1. **Option A (Provision Bucket in asia-northeast1):** Create `gs://easyslice-staging-media-artifacts` with uniform bucket-level access, 3-day deletion lifecycle, and CORS for staging domain.
2. **Option B (Use Local Filesystem Mock on Staging):** Store staging uploads on local ephemeral disk.

### Recommended Option
**Option A.** Cloud-native staging verification requires real signed URL streaming to Google Cloud Storage.

### Implementation Consequences
- Estimated cost: < $5.00/month.
- Automatic 3-day lifecycle policy prevents unbounded storage accumulation.

### Required Acceptance Evidence
- GCP console / terraform state confirmation of bucket creation with lifecycle rules and CORS enabled.

---

## Decision PO-04: Staging Service Account & WIF IAM Bindings

### Technical Issue
Staging Vercel deployments need authentication to Cloud Storage and Cloud SQL via Workload Identity Federation (WIF) without hardcoded service account keys.

### Available Options
1. **Option A (Bind Dedicated Staging Service Account):** Provision `easyslice-staging-app-sa` with `roles/storage.objectAdmin` restricted strictly to `easyslice-staging-media-artifacts`, and bind WIF provider.
2. **Option B (Re-use Production Service Account):** Not allowed (violates security boundary).

### Recommended Option
**Option A.** Strictly adheres to principle of least privilege.

### Implementation Consequences
- Zero blast radius to production GCP project or production media bucket.

### Required Acceptance Evidence
- `gcloud iam service-accounts get-iam-policy` output verifying restricted role bindings.

---

## Decision PO-05: Controlled Staging Smoke Test Execution Window

### Technical Issue
An authorized test window is required to run end-to-end verification (synthetic 10MB MP4 upload -> vertical clip optimization -> packaging) against staging infrastructure.

### Available Options
1. **Option A (Authorize 2-Hour Staging Test Window):** Conduct controlled smoke test using synthetic video fixtures and isolated test user identity.
2. **Option B (Skip Staging Smoke Test):** Rely solely on local unit/offline tests.

### Recommended Option
**Option A.** Live verification on staging is mandatory to satisfy Staging Readiness Gates before considering production.

### Implementation Consequences
- Generates 1-2 synthetic asset import rows with `owner_uid = 'test-run.smoke-test.001'`.
- Uploads synthetic test video to staging bucket; cleaned up automatically by 3-day lifecycle.

### Required Acceptance Evidence
- Smoke test execution log demonstrating HTTP 200 response from `/api/media/admit`, successful signed URL generation, and verified vertical MP4 output.
