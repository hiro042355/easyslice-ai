# Phase 2.17: Independent Staging Implementation Readiness Review Report

**Investigation Baseline Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869` (`origin/main`)
**Current Branch:** `jules-3110607620436353703-ca56d790`
**Review Type:** Independent Read-Only Architecture and Implementation Readiness Review
**Author:** Jules (Software Engineer)

---

## 1. Executive Summary

### Final Verdict: `LOCAL_IMPLEMENTATION_READY_WITH_LIMITATIONS`

An independent technical audit of the Phase 2.16 safety design, staging readiness plan, gatekeeper audit, and Product Owner approval matrix confirms that the codebase architecture and proposed safety designs are technically sound, robustly bounded, and ready for **local-only code implementation**.

Key Review Findings:
1. **GCS Environment Isolation:** The fail-closed bucket authority design ensures that production can strictly only touch `nexcut-prod-jp-2026-media`, while staging can strictly only touch `easyslice-staging-media-artifacts`. Cross-environment access throws immediate runtime exceptions.
2. **Database & Firebase Isolation:** Configuration assertions and token audience/issuer validation prevent cross-environment authentication and Cloud SQL leakage.
3. **Migration & Rollback Safeguards:** Lock timeout (`lock_timeout = '5s'`) and foreign-key-ordered row purges ensure rollback does not fail or silently destroy unrelated data.
4. **IAM Least Privilege:** Verified that resumable upload sessions (`createResumableUpload`) do not require `signBlob` and that bucket-scoped `roles/storage.objectAdmin` is completely sufficient. Zero credentials or private keys are exposed to the browser.
5. **Smoke Test Decoupling:** The media pipeline smoke test (Scope A) is strictly decoupled from external Gemini API calls by utilizing synthetic subtitle fixtures.

*Important Boundary:* This review confirms readiness to begin **local-only code implementation** of work packages (e.g. writing the bucket authority refactor and automated unit tests). It does **NOT** authorize applying database migrations, creating GCS buckets, deploying to Vercel, or invoking live APIs.

---

## 2. Phase 2.16 Evidence Review

The deliverables in `docs/implementation/tiktok-production-readiness/phase-2.16-safety-corrections/` were audited against actual codebase files:
- `lib/server/productionMediaRuntime/gcsAdapter.ts`: Confirmed hardcoded `nexcut-prod-jp-2026-media` requires the designed environment-specific authority refactor.
- `app/api/media/admit/route.ts`: Confirmed `createResumableUpload` is invoked server-side; client streams binary via PUT.
- `db/workflow/migrations/V000008` & `V000009`: Confirmed foreign key constraints and transactional DDL behavior.
- `app/api/transcript/durable/route.ts`: Confirmed transcription relies on Google Gemini API (`GEMINI_API_KEY`), proving that Whisper is not used and that Scope A must use synthetic fixtures to prevent external AI billing.

---

## 3. Environment Isolation Findings

### A. GCS Bucket Isolation
- Production: `nexcut-prod-jp-2026-media` only.
- Staging: `easyslice-staging-media-artifacts` only.
- Unknown/Empty Environment: Fails closed immediately.
- Test Cases for Cross-Access Rejection:
  1. `assert.throws(() => resolveAuthorizedBucketName("production", "easyslice-staging-media-artifacts"))`
  2. `assert.throws(() => resolveAuthorizedBucketName("staging", "nexcut-prod-jp-2026-media"))`
  3. `assert.throws(() => resolveAuthorizedBucketName(undefined, "nexcut-prod-jp-2026-media"))`
  4. `assert.throws(() => resolveAuthorizedBucketName("development", "nexcut-prod-jp-2026-media"))`

### B. Firebase Authentication Isolation
- Staging Firebase project `easyslice-staging` issues tokens with audience/issuer `https://securetoken.google.com/easyslice-staging`.
- Production Firebase project issues tokens with audience/issuer `https://securetoken.google.com/nexcut-prod`.
- Verification of token signature against the wrong project public key fails closed with HTTP 401 at `lib/server/productionIdentity/routeGuard.ts`.
- Required Startup Checks:
  - Startup check asserting `FIREBASE_PROJECT_ID === "easyslice-staging"` when `APP_ENVIRONMENT === "staging"`.
  - Startup check asserting `FIREBASE_PROJECT_ID === "nexcut-prod"` when `APP_ENVIRONMENT === "production"`.

### C. Cloud SQL Isolation
- Staging database URL must contain `easyslice_staging`.
- Startup check in `cloudSqlAdapter.ts` must verify `POSTGRES_DATABASE === "easyslice_staging"` when `APP_ENVIRONMENT === "staging"`. Any connection string pointing to production triggers immediate process abort.

---

## 4. Security and IAM Findings

- **Server-Side Resumable Session Initiation:** The server uses `authClient` (WIF/Service Account) with `roles/storage.objectAdmin` restricted strictly to `projects/_/buckets/easyslice-staging-media-artifacts`.
- **Zero Browser Secrets:** The client browser receives only the signed session URI string (`uploadUrl`). It requires no GCP credentials, no private keys, and no service account tokens.
- **compensatory Cleanup:** On transaction failure, `object.delete({ ignoreNotFound: true })` cleans up the uploaded file to prevent orphan accumulation.

---

## 5. Migration and Rollback Findings

- **Target Database Verification:** DDL script asserts `current_database() = 'easyslice_staging'`.
- **Lock Behavior:** Lock timeout `SET LOCAL lock_timeout = '5s'` prevents indefinite transaction queues during table check evaluation.
- **Rollback Order:** Rollback executes cascading deletion in strict dependency order:
  1. `workflow.media` (test media rows)
  2. `workflow.jobs` (test job rows)
  3. `workflow.asset_import_requests` (`platform = 'tiktok'`)
  4. Re-adds `ck_asset_import_authority` check constraint.
- **Backup Verification:** Mandates pre-migration database snapshot and logical dump.

---

## 6. Test Scope Separation: Scope A vs Scope B

- **Scope A (Media Pipeline Smoke Test):**
  - Uses synthetic transcript JSON fixtures.
  - Validates URL guidance, resumable upload, GCS admission, Cloud SQL commit, FFmpeg vertical clipping, and ZIP packaging.
  - Zero calls to Gemini API or external AI services.
- **Scope B (Live Gemini Transcription Test):**
  - Requires explicit Product Owner approval, approved billing quota, and dedicated Gemini API key.
  - Remains excluded from Scope A.

---

## 7. Proposed Implementation Work Packages (Local Code Only)

The future implementation is partitioned into small, independently verifiable work packages:

### Work Package WP-01: GCS Environment-Specific Bucket Authority
- **Scope:** Implement `resolveAuthorizedBucketName` and integrate into `gcsAdapter.ts` and `composition.ts`.
- **Files Affected:** `lib/server/productionMediaRuntime/gcsAdapter.ts`, `lib/server/productionMediaRuntime/composition.ts`.
- **Acceptance Criteria:** Production allows only production bucket; staging allows only staging bucket; mismatches fail closed.
- **Automated Tests:** `tests/productionMediaRuntime/gcsEnvironmentAuthority.test.ts` (100% pass).
- **Rollback Strategy:** `git restore` on modified files.
- **External Dependencies:** Zero (pure local TypeScript refactor).

### Work Package WP-02: Environment Startup Guard Assertions
- **Scope:** Add startup environment validation to `composition.ts` asserting matching database and Firebase configuration.
- **Files Affected:** `lib/server/productionMediaRuntime/composition.ts`, `lib/server/productionIdentity/routeGuard.ts`.
- **Acceptance Criteria:** Staging runtime halts if database or Firebase project ID points to production.
- **Automated Tests:** `tests/productionIdentity/environmentGuard.test.ts`.
- **Rollback Strategy:** `git restore`.
- **External Dependencies:** Zero.

### Work Package WP-03: Staging Migration & Rollback SQL Scripts
- **Scope:** Prepare standalone, transactional migration and rollback runner scripts with lock timeouts and FK pre-checks.
- **Files Affected:** `db/workflow/migrations/staging/apply_v000009_staging.sql`, `db/workflow/migrations/staging/rollback_v000009_staging.sql`.
- **Acceptance Criteria:** Scripts contain explicit assertion of `current_database()` and foreign-key safe rollback logic.
- **Automated Tests:** Unit test verifying SQL syntax and assertion blocks.
- **Rollback Strategy:** Delete staging SQL scripts.
- **External Dependencies:** Zero.

### Work Package WP-04: Synthetic Transcript Fixture Test Runner
- **Scope:** Create dedicated offline integration test verifying TikTok MP4 admission to FFmpeg clipping using synthetic transcript fixtures.
- **Files Affected:** `tests/urlAcquisition/tiktokSyntheticPipelineIntegration.test.ts`.
- **Acceptance Criteria:** Pipeline runs from mock admission through FFmpeg clipping to export without network or AI API calls.
- **Automated Tests:** `npx tsx --test tests/urlAcquisition/tiktokSyntheticPipelineIntegration.test.ts`.
- **Rollback Strategy:** Delete test file.
- **External Dependencies:** Packaged FFmpeg binary only.

---

## 8. Remaining Blockers

1. **PO Decision PO-01:** Formal approval of staging Cloud SQL migration window.
2. **PO Decision PO-02:** Formal approval of staging GCS bucket creation.
3. **PO Decision PO-03:** Formal approval of bucket-scoped IAM role binding.
4. **PO Decision PO-04:** Formal approval of staging Firebase test account creation.
5. **PO Decision PO-05:** Formal approval of controlled staging smoke test window (Scope A).

---

## 9. Explicit Approval Boundaries

This review explicitly establishes:
- **AUTHORIZED FOR LOCAL IMPLEMENTATION:** Authoring local TypeScript code changes, unit tests, and migration script wrappers (Work Packages WP-01 through WP-04).
- **STRICTLY PROHIBITED WITHOUT SEPARATE PO SIGN-OFF:**
  - Connecting to or modifying Cloud SQL instances.
  - Creating or configuring GCS buckets.
  - Binding IAM roles or modifying service accounts.
  - Deploying to Vercel.
  - Invoking live TikTok or Gemini APIs.
