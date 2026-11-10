# Deliverable 06: Test and Acceptance Matrix

## 1. Automated Test Suite Inventory

| Test Suite / Path | Category | Execution Command | Target Scope | Environment |
| :--- | :--- | :--- | :--- | :--- |
| `tests/workflowMigration/localConnectionGuard.test.ts` | Security / Guard | `npx tsx --test tests/workflowMigration/localConnectionGuard.test.ts` | Validates host checks reject non-localhost connections | Local / CI |
| `tests/workflowMigration/rollbackIsolationHarness.test.ts` | Rollback / Taint | `npx tsx --test tests/workflowMigration/rollbackIsolationHarness.test.ts` | Validates 5 transactional states and synthetic taint isolation | Local / CI |
| `tests/workflowMigration/stagingMigrationScriptIntegrity.test.ts` | DDL Integrity | `npx tsx --test tests/workflowMigration/stagingMigrationScriptIntegrity.test.ts` | Validates V000008 & V000009 SQL statements | Local / CI |
| `tests/productionMediaRuntime/gcsEnvironmentAuthority.test.ts` | Storage Authority | `npx tsx --test tests/productionMediaRuntime/gcsEnvironmentAuthority.test.ts` | Validates fail-closed GCS bucket mapping | Local / CI |
| `tests/productionMediaRuntime/productionMediaRuntimeAdapters.test.ts` | Adapter Runtime | `npx tsx --test tests/productionMediaRuntime/productionMediaRuntimeAdapters.test.ts` | Validates WIF pin & Cloud SQL connection tuples | Local / CI |
| `tests/urlAcquisition/classifyTikTokUrl.test.ts` | Classification | `npx tsx --test tests/urlAcquisition/classifyTikTokUrl.test.ts` | Validates TikTok web and mobile share URL patterns | Local / CI |
| `tests/urlAcquisition/durableMediaAdmissionValidation.test.ts` | Media Admission | `npx tsx --test tests/urlAcquisition/durableMediaAdmissionValidation.test.ts` | Validates 2GB limit and video/mp4 MIME constraints | Local / CI |
| `tests/postgresqlTestEnvironment/reconciliationMigration.test.ts` | Container Integration | `npx tsx --test --test-concurrency=1 tests/postgresqlTestEnvironment/reconciliationMigration.test.ts` | Pinned PostgreSQL 18.4 & Flyway 12.6.1 migration replay | GitHub Actions Runner (Docker) |

---

## 2. Acceptance Gate Criteria

### Gate 1: Local Offline Verification (Passed)
- Criteria: All 7 offline unit and contract test suites execute with 0 failures.
- Status: **PASSED** (Validated in Jules Development Window).

### Gate 2: Containerized CI Integration (Pending PO-01)
- Criteria: Workflow `.github/workflows/test-postgresql-wp03.yml` runs to completion on GitHub Actions runner with all 13 steps succeeding.
- Status: **BLOCKED PENDING PO-01** (Requires updating migration expectation from 3 to 9 in `reconciliationMigration.test.ts`).

### Gate 3: Staging Infrastructure Provisioning (Pending PO-02, PO-03, PO-04)
- Criteria:
  1. Staging Cloud SQL has `V000009` applied.
  2. GCS bucket `easyslice-staging-media-artifacts` exists with 3-day lifecycle and CORS.
  3. Staging WIF service account has restricted `roles/storage.objectAdmin` on staging bucket only.
- Status: **PENDING PRODUCT OWNER APPROVAL**.

### Gate 4: Staging End-to-End Smoke Test (Pending PO-05)
- Criteria:
  1. POST `/api/v1/assets/import` with TikTok URL returns guidance instructing MP4 upload.
  2. POST `/api/media/admit` generates signed URL on `easyslice-staging-media-artifacts`.
  3. Client uploads 10MB test MP4.
  4. Optimization pipeline crops to vertical 9:16 cut.
  5. Vertical MP4 artifact is downloadable and valid.
- Status: **PENDING STAGING DEPLOYMENT & PO-05**.

### Gate 5: Production Lockdown (Group D)
- Criteria: Strict enforcement that no production database, bucket, or live platform scraping is triggered.
- Status: **LOCKED & VERIFIED**.
