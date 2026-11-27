# Phase 2.16: Staging Safety Corrections & Implementation Design Report

**Investigation Baseline Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869` (`origin/main`)
**Previous Verdict:** `PO_DECISIONS_READY_WITH_LIMITATIONS`
**Classification:** Documentation-Only Implementation Design & Safety Corrections
**Author:** Jules (Software Engineer)

---

## 1. Executive Summary

During Phase 2.15 technical risk investigation, five critical limitations were identified in the preliminary staging assumptions:
1. **GCS Authority Lock-in:** `lib/server/productionMediaRuntime/gcsAdapter.ts` hardcodes `nexcut-prod-jp-2026-media`, which actively prevents staging execution against `easyslice-staging-media-artifacts`.
2. **Migration Rollback & Lock Realities:** Rollback of `V000009` deletes `platform = 'tiktok'` records that may have cascading foreign-key references to `workflow.jobs` and `workflow.media`. Unmeasured claims of guaranteed sub-50ms or zero-downtime execution lack empirical support.
3. **IAM Least-Privilege & Signing:** The current implementation uses Google Cloud Storage resumable upload sessions (`createResumableUpload`) rather than V4 Signed URLs. Therefore, `iam.serviceAccounts.signBlob` is **not** required; bucket-scoped `roles/storage.objectAdmin` is sufficient.
4. **Firebase Admin Tenant Isolation:** Test accounts must be provisioned in an isolated staging Firebase tenant with distinct project IDs and service credentials to prevent cross-environment token acceptance.
5. **Transcription Reality:** The repository's transcription endpoint (`/api/transcript/durable`) integrates with the **Google Gemini API** (`GEMINI_API_KEY`), **not** Whisper. Packaged FFmpeg extracts audio locally, but speech-to-text requires external AI calls.

This report establishes the complete safety design and architectural corrections required before any staging implementation begins, with zero external side effects and zero modifications to application runtime code.

---

## 2. GCS Environment-Specific Bucket Authority Design

### The Problem
In `lib/server/productionMediaRuntime/gcsAdapter.ts` (lines 26–33):
```typescript
export const createProductionMediaBucket = (
  authClient: IdentityPoolClient,
  bucketName: string,
): ReturnType<Storage["bucket"]> => {
  if (bucketName !== "nexcut-prod-jp-2026-media") throw new Error("Invalid Production media bucket authority");
  ...
};
```
The hardcoded check blocks any staging bucket, but simply removing the check would weaken production safety.

### Proposed Architecture
Design an explicit, fail-closed environment-to-bucket authority mapping:

```typescript
export type SupportedRuntimeEnvironment = "production" | "staging";

const AUTHORIZED_BUCKET_MAP: Readonly<Record<SupportedRuntimeEnvironment, string>> = Object.freeze({
  production: "nexcut-prod-jp-2026-media",
  staging: "easyslice-staging-media-artifacts",
});

export const resolveAuthorizedBucketName = (
  env: string | undefined,
  configuredBucketName: string | undefined,
): string => {
  if (!env || (env !== "production" && env !== "staging")) {
    throw new Error(`Unauthorized or missing APP_ENVIRONMENT: ${String(env)}`);
  }
  const expectedBucket = AUTHORIZED_BUCKET_MAP[env];
  if (!configuredBucketName || configuredBucketName !== expectedBucket) {
    throw new Error(
      `Bucket authority mismatch for environment "${env}": expected "${expectedBucket}", received "${String(configuredBucketName)}"`,
    );
  }
  return expectedBucket;
};
```

### Safety Guarantees
- Production runtime (`APP_ENVIRONMENT=production`) **only** accepts `nexcut-prod-jp-2026-media`. Attempting to pass the staging bucket throws an immediate fatal exception.
- Staging runtime (`APP_ENVIRONMENT=staging`) **only** accepts `easyslice-staging-media-artifacts`. Attempting to pass the production bucket throws an immediate fatal exception.
- Any missing, malformed, or unrecognized environment fails closed.

---

## 3. Migration and Rollback Safety Review (PO-01)

### Lock Behavior & Realities
- `ALTER TABLE workflow.asset_import_requests ADD CONSTRAINT ...` evaluates the constraint against all existing rows under an `ACCESS EXCLUSIVE` lock on `workflow.asset_import_requests`.
- While table scans on small tables execute quickly, execution time is concurrency-dependent. Prior claims of guaranteed sub-50ms or zero-downtime execution are unmeasured and unsupported.
- *Correction:* The pre-flight checklist must mandate pausing background ingestion workers and establishing a strict 5-second lock timeout: `SET LOCAL lock_timeout = '5s';`.

### Rollback Ordering & Synthetic Record Isolation
- The rollback script restores `CHECK (command_version = '1.0' AND platform = 'youtube')`. This DDL fails if any row with `platform = 'tiktok'` remains.
- In `V000008`, `workflow.asset_import_requests` has foreign keys referencing `workflow.jobs` (`fk_asset_import_job_owner`) and `workflow.media` (`fk_asset_import_media_job`).
- *Rollback Sequence Requirement:*
  1. Delete test media rows (`workflow.media`) referenced by test TikTok imports.
  2. Delete test job rows (`workflow.jobs`) referenced by test TikTok imports.
  3. Delete test TikTok import requests.
  4. Assert zero rows remain with `platform = 'tiktok'`.
  5. Re-apply `platform = 'youtube'` check constraint.

### Mandatory Pre-Flight Backup
A full logical backup (`pg_dump -n workflow`) and Cloud SQL point-in-time snapshot must be verified and logged before migration execution.

---

## 4. IAM Permission Analysis (PO-03)

### Implementation Mechanism
In `app/api/media/admit/route.ts`:
- **Step 1 (Session Initiation):** The server invokes `@google-cloud/storage` `bucket.file(storageKey).createResumableUpload(...)`. This performs an authenticated HTTP POST directly to `https://storage.googleapis.com/upload/resumable/...` using the server's Workload Identity Federation OAuth 2.0 access token.
- **Step 2 (Binary Streaming):** The browser receives the session URI and issues standard chunked `PUT` requests directly to Google Cloud Storage.
- **Step 3 (Metadata & Cleanup):** The server calls `object.getMetadata()` and `object.delete({ ignoreNotFound: true })`.

### Least-Privilege Role Assignment
- **Service Account Identity:** `easyslice-staging-app-sa@easyslice-staging.iam.gserviceaccount.com`.
- **Required Permissions:**
  - `storage.objects.create` (create resumable upload session)
  - `storage.objects.get` (inspect metadata on finalize)
  - `storage.objects.delete` (compensatory cleanup on abort)
- **Sufficient Role:** `roles/storage.objectAdmin` bound **strictly** to `projects/_/buckets/easyslice-staging-media-artifacts`.
- **Signing Role:** `iam.serviceAccounts.signBlob` is **not** required. The server does not sign V4 URLs; it requests a Google-managed resumable upload URI.
- **Browser Identity:** Zero IAM permissions or tokens required.

---

## 5. Firebase Admin Tenant Isolation (PO-04)

### Cross-Environment Contamination Defense
To prevent token spoofing between staging and production:
1. **Separate Projects:** Staging must use a distinct Firebase project (`easyslice-staging`) with independent private keys and client emails.
2. **Audience & Issuer Enforcement:** The Firebase Admin SDK verifies JWT tokens against `https://securetoken.google.com/<projectId>`. Tokens issued by `easyslice-prod` have an audience/issuer matching the production project and are rejected by staging (HTTP 401). Tokens issued by `easyslice-staging` are rejected by production.

### Required Automated Test Cases
1. **Production Token in Staging:** Verify that a valid token signed by production Firebase fails verification when presented to the staging route guard.
2. **Staging Token in Production:** Verify that a valid token signed by staging Firebase fails verification when presented to the production route guard.
3. **Mismatched Configuration:** Verify that omitting or corrupting `FIREBASE_PROJECT_ID` throws a startup configuration error and halts execution.

---

## 6. Smoke Test Scope Separation (PO-05)

The end-to-end smoke test must be strictly decoupled into two isolated scopes:

### Scope A: Media Pipeline Smoke Test (Synthetic Fixtures - Default)
- **Execution Path:**
  1. Authenticate with staging test account (`usr_staging_tiktok_01`).
  2. Input TikTok URL and verify client guidance (`/api/url/classify`).
  3. Initiate admission session (`/api/media/admit` `action: "initiate"`).
  4. Stream 10MB synthetic test MP4 to GCS resumable URL.
  5. Finalize admission (`/api/media/admit` `action: "finalize"`).
  6. Commit durable media and job rows to staging Cloud SQL.
  7. Process clipping using **synthetic subtitle JSON fixtures** (as proven offline in `tests/clipPlatform/platformAwareOptimization.test.ts`).
  8. Render vertical 9:16 MP4 crop using packaged FFmpeg 7.0.2.
  9. Bundle into ZIP package and download.
- **External Calls:** Zero external AI calls.
- **Cost:** < $0.05 compute/storage.
- **Acceptance Boundary:** Confirms full media ingestion, clipping, and export capabilities without claiming live AI transcription readiness.

### Scope B: Live Transcription Integration Test (Separate Authorization Required)
- **Execution Path:** Calls `/api/transcript/durable` to transcribe extracted audio using `GeminiTranscriptProvider` (`gemini-1.5-flash`).
- **Pre-requisite:** Explicit Product Owner approval, approved billing quota, and dedicated staging Gemini API key.
- **Safety Restriction:** Scope B remains unverified and blocked until separate PO authorization is granted.

---

## 7. Revised PO Decision Dependency Matrix

```text
[ Group A: Safe Local Preparation ]
  ├── ACT-A1: Staging Readiness Documentation
  ├── ACT-A2: Synthetic Test MP4 Preparation
  ├── ACT-A3: Offline Regression Suite (40/40 PASS)
  └── ACT-A4: Environment-Specific GCS Authority Design
         │
         ▼
[ Group B: Product Owner Independent Decisions ]
  ├── PO-01: Staging Cloud SQL Migration V000009
  │      (Requires: Staging DB backup verified, idle workers, rollback procedure)
  ├── PO-02: Staging GCS Bucket Provisioning
  │      (Requires: Project billing envelope active, 3-day deletion lifecycle rule)
  │      └── PO-03: Staging Bucket-Scoped IAM Roles (Strictly depends on PO-02)
  ├── PO-04: Staging Firebase Test Identity Creation
  │      (Requires: Dedicated staging tenant easyslice-staging)
  └── PO-05: Staging Smoke Test Execution (Scope A: Synthetic Fixtures)
         (Strictly depends on PO-01, PO-02, PO-03, PO-04 verified complete)
         │
         ▼
[ Group C: Staging Infrastructure Operations (BLOCKED Pending PO Approvals) ]
  ├── ACT-C1: Apply Migration V000009 via Cloud SQL Proxy
  ├── ACT-C2: Configure Staging GCS Bucket CORS & Lifecycle
  ├── ACT-C5: Bind Bucket IAM to Service Account
  ├── ACT-C3: Deploy Staging Build to Vercel
  └── ACT-C4: Execute Scope A Smoke Test
         │
         ▼
[ Group D: Prohibited Operations (Production Mutation, Direct Scraping, Paid APIs) ]
```

---

## 8. Exact Implementation Files Requiring Future Modification

*Note: These files were NOT modified during this task. They represent the exact design surface for future implementation.*

1. **`lib/server/productionMediaRuntime/gcsAdapter.ts`**
   - Replace hardcoded `"nexcut-prod-jp-2026-media"` check with `resolveAuthorizedBucketName(process.env.APP_ENVIRONMENT, bucketName)`.
2. **`lib/server/productionMediaRuntime/composition.ts`**
   - Pass `process.env.APP_ENVIRONMENT` and `process.env.MEDIA_BUCKET_NAME` into bucket resolution.
3. **`lib/server/productionIdentity/routeGuard.ts`**
   - Ensure `projectId` validation explicitly asserts match with expected staging or production tenant.
4. **`db/workflow/migrations/V000009__expand_asset_import_platform.sql`**
   - Prepare transactional deployment wrapper with `lock_timeout`.

---

## 9. Automated Test Cases Required

Before staging deployment, the following automated test suites must be created:
1. `tests/productionMediaRuntime/gcsEnvironmentAuthority.test.ts`:
   - Production environment accepts `nexcut-prod-jp-2026-media`.
   - Production environment throws on `easyslice-staging-media-artifacts`.
   - Staging environment accepts `easyslice-staging-media-artifacts`.
   - Staging environment throws on `nexcut-prod-jp-2026-media`.
   - Undefined or unrecognized environment throws fatal error.
2. `tests/productionIdentity/firebaseTenantIsolation.test.ts`:
   - Staging route guard rejects production-signed Firebase JWT.
   - Production route guard rejects staging-signed Firebase JWT.
   - Malformed project ID fails closed.
3. `tests/workflowMigration/v000009ConstraintRollback.test.ts`:
   - Positive insert with `platform = 'tiktok'`.
   - Negative insert with unsupported platform.
   - Rollback script cleanup of test child and parent rows before constraint restoration.

---

## 10. Remaining Blockers & Required PO Decisions

| ID | Description | Current Status | Blocker Resolution Requirement |
|---|---|---|---|
| **BLK-01** | PO Decision on PO-01 (Migration V000009) | `PENDING` | PO approval of migration window with verified backup |
| **BLK-02** | PO Decision on PO-02 (Staging GCS Bucket) | `PENDING` | PO approval of staging bucket creation with 3-day lifecycle |
| **BLK-03** | PO Decision on PO-03 (Service Account IAM) | `PENDING` | PO approval of bucket-scoped `objectAdmin` role (depends on PO-02) |
| **BLK-04** | PO Decision on PO-04 (Staging Firebase User) | `PENDING` | PO approval of staging tenant test identity creation |
| **BLK-05** | PO Decision on PO-05 (Scope A Smoke Test) | `PENDING` | PO approval of 2-hour staging smoke test with synthetic fixtures |
| **BLK-06** | Code Refactor for Bucket Authority | `DESIGNED` | Implementation of `resolveAuthorizedBucketName` in `gcsAdapter.ts` |
| **BLK-07** | Live AI Transcription (Scope B) | `DEFERRED` | Remains blocked and excluded from Scope A smoke test |
