# Phase 2.19: Final Technical Safety Review Report
## NEXCUT AI TikTok Publisher — Work Packages WP-01 through WP-04

**Investigation Baseline Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869` (`origin/main`)
**Current Branch:** `jules-3110607620436353703-ca56d790`
**Review Type:** Deep Technical Safety Review & Risk Verification
**Author:** Jules (Software Engineer)

---

## 1. Executive Summary

### Final Overall Verdict: `READY_WITH_LIMITATIONS`

An exhaustive, code-level technical safety review was conducted across the actual runtime implementations of **WP-01 through WP-04**.
The codebase demonstrates exceptional baseline isolation and defence-in-depth, but code inspection revealed critical hardcoded production authorities in the runtime that require formal limitations and explicit design adjustments prior to execution.

Key Findings by Area:
1. **GCS Authority (WP-01):** `lib/server/productionMediaRuntime/gcsAdapter.ts` (line 27) hardcodes `nexcut-prod-jp-2026-media`. No environment resolver currently exists. A fail-closed resolver mapping `production` -> `nexcut-prod-jp-2026-media` and `staging` -> `easyslice-staging-media-artifacts` is fully sound, but must be paired with WP-02.
2. **Environment Startup Guards (WP-02):** Code inspection revealed that **three separate production runtime modules** enforce hardcoded production authorities:
   - `lib/server/productionIdentity/vercelWifCredential.ts` (lines 28–36): hardcodes `projectId === "nexcut-prod-jp-2026"` and `serviceAccountEmail === "nexcut-prod-web-auth@nexcut-prod-jp-2026.iam.gserviceaccount.com"`.
   - `lib/server/productionDatabaseRuntime/cloudSqlConnectorAuthority.ts` (lines 40–48): hardcodes `instanceConnectionName === "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql"`, `database === "nexcut"`, and `iamUser === "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam"`.
   - Therefore, `POSTGRES_DATABASE` alone is **not** sufficient; both the instance connection name, database name, and IAM user must be verified.
3. **Migration & Rollback Safety (WP-03):**
   - *Critical Foreign-Key Architecture:* `workflow.asset_import_requests` has FKs pointing to `workflow.jobs` (`fk_asset_import_job_owner`) and `workflow.media` (`fk_asset_import_media_job`).
   - Unrestricted deletion (`DELETE ... WHERE platform = 'tiktok'`) is **strictly unacceptable**. Rollback must isolate **strictly synthetic test records** identified by a unique staging test owner prefix (e.g. `owner_uid LIKE 'staging_test_%'`) or specific test UUIDs.
4. **Offline Synthetic Pipeline (WP-04):** The offline pipeline can be tested 100% locally using packaged FFmpeg 7.0.2 and synthetic subtitle JSON fixtures without any network calls to Gemini or Whisper.

---

## 2. Review 1: WP-01 GCS Authority

### Codebase Inspection References
- `lib/server/productionMediaRuntime/gcsAdapter.ts` (lines 24–33):
  ```typescript
  export const createProductionMediaBucket = (
    authClient: IdentityPoolClient,
    bucketName: string,
  ): ReturnType<Storage["bucket"]> => {
    if (bucketName !== "nexcut-prod-jp-2026-media") throw new Error("Invalid Production media bucket authority");
    const storage = new Storage({
      projectId: "nexcut-prod-jp-2026",
      authClient: createStorageCompatibleAuthClient(authClient),
    });
    return storage.bucket(bucketName);
  };
  ```
- `lib/server/productionMediaRuntime/composition.ts` (line 22):
  ```typescript
  const bucket = createProductionMediaBucket(authClient, required("MEDIA_BUCKET_NAME", process.env.MEDIA_BUCKET_NAME));
  ```

### Analysis
1. `APP_ENVIRONMENT` is currently **not obtained** in `composition.ts` or `gcsAdapter.ts`. It is only referenced as a client-side public variable (`NEXT_PUBLIC_APP_ENV`) in legacy documentation.
2. The bucket name is currently fetched from `process.env.MEDIA_BUCKET_NAME`, but `createProductionMediaBucket` immediately throws if it does not equal `"nexcut-prod-jp-2026-media"`.
3. The proposed resolver `resolveAuthorizedBucketName(env, configuredBucket)` can safely reject unknown environments by checking `env === "production" | "staging"` and throwing for any other string or undefined.
4. Production and staging bucket names are strictly separated into an immutable lookup table:
   - `production`: `nexcut-prod-jp-2026-media`
   - `staging`: `easyslice-staging-media-artifacts`
5. The change does **not** weaken production behavior: when `APP_ENVIRONMENT === "production"`, the check remains 100% identical to the current hardcoded invariant.
6. All GCS operations in `/api/media/admit` and `/api/transcript/durable` pass through `withProductionMediaRuntime`, which invokes this exact bucket factory.

**WP-01 Status:** `ACCEPTED_FOR_LOCAL_IMPLEMENTATION`

---

## 3. Review 2: WP-02 Environment Startup Guards

### Codebase Inspection References
- `lib/server/productionDatabaseRuntime/cloudSqlConnectorAuthority.ts` (lines 40–48):
  ```typescript
  function validate(configuration: ProductionCloudSqlConfiguration): void {
    if (configuration.instanceConnectionName !== "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql") {
      throw new Error("Invalid Production Cloud SQL authority");
    }
    if (configuration.database !== "nexcut") throw new Error("Invalid Production database authority");
    if (configuration.iamUser !== "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam") {
      throw new Error("Invalid Production IAM database user authority");
    }
  }
  ```
- `lib/server/productionIdentity/vercelWifCredential.ts` (lines 28–36):
  ```typescript
  const validateConfiguration = (configuration: VercelWifConfiguration): void => {
    if (configuration.projectId !== "nexcut-prod-jp-2026") throw new Error("Invalid Production GCP project authority");
    if (!/^projects\/[1-9][0-9]*\/locations\/global\/workloadIdentityPools\/nexcut-prod-vercel\/providers\/vercel-production$/.test(configuration.providerResource)) {
      throw new Error("Invalid Production WIF provider authority");
    }
    if (configuration.serviceAccountEmail !== "nexcut-prod-web-auth@nexcut-prod-jp-2026.iam.gserviceaccount.com") {
      throw new Error("Invalid Production Firebase service account authority");
    }
  };
  ```

### Analysis
1. `POSTGRES_DATABASE` alone is **insufficient** to establish database identity. The instance connection name (`instanceConnectionName`) and IAM user (`iamUser`) are strictly validated against production constants.
2. In the existing code, staging runtime would crash immediately upon boot because `validateConfiguration` and `validate(configuration)` strictly demand production project and instance names.
3. Therefore, WP-02 must introduce an explicit multi-environment authority descriptor for Cloud SQL and Firebase WIF.
4. Staging credentials cannot accidentally select production resources because the production connector authority validates all three tuples (`instanceConnectionName`, `database`, `iamUser`).
5. These guards execute synchronously during module initialization inside `withProductionMediaRuntime` and `withFirebaseAdminAuth` **before** any socket connection or query execution.
6. Automated unit tests can completely verify these conditions offline by supplying mocked configuration objects to `validate` functions.

**WP-02 Status:** `ACCEPTED_WITH_LIMITATIONS`
*Limitation:* WP-02 implementation must cover not just database name, but the full Cloud SQL configuration tuple and Firebase WIF configuration tuple.

---

## 4. Review 3: WP-03 Migration and Rollback Safety

### Codebase Inspection References
- `db/workflow/migrations/V000008__add_asset_import_idempotency.sql` (lines 33–37):
  ```sql
  ALTER TABLE workflow.jobs ADD CONSTRAINT uq_jobs_id_owner UNIQUE (id, owner_uid);
  ALTER TABLE workflow.media ADD CONSTRAINT uq_media_id_job UNIQUE (id, job_id);
  ALTER TABLE workflow.asset_import_requests ADD CONSTRAINT fk_asset_import_job_owner
    FOREIGN KEY (job_id, owner_uid) REFERENCES workflow.jobs(id, owner_uid) ON DELETE RESTRICT;
  ALTER TABLE workflow.asset_import_requests ADD CONSTRAINT fk_asset_import_media_job
    FOREIGN KEY (media_id, job_id) REFERENCES workflow.media(id, job_id) ON DELETE RESTRICT;
  ```

### Analysis & Resolution of Critical Questions
1. **Foreign-Key Relationships:** `workflow.asset_import_requests` holds foreign keys referencing `workflow.jobs(id, owner_uid)` and `workflow.media(id, job_id)`. Both have `ON DELETE RESTRICT`.
2. **Correct Deletion Order:** Because `asset_import_requests` points to `jobs` and `media`, deleting rows from `asset_import_requests` must occur **before** deleting their corresponding test jobs and media rows (or the child rows in `asset_import_requests` must be deleted first).
3. **Critical Rollback Guard:** An unrestricted `DELETE ... WHERE platform = 'tiktok'` is **strictly prohibited**. In a shared staging environment, other developers or concurrent tests could have valid data.
4. **Synthetic Test Record Isolation:** All synthetic test records created during staging smoke tests must use a deterministic test prefix:
   - `owner_uid` matching `staging_test_tiktok_%`
   - `idempotency_key` matching `test_key_%`
5. **Rollback SQL Specification:**
   ```sql
   BEGIN;
   SET LOCAL lock_timeout = '5s';

   -- 1. Assert database identity
   DO $$
   BEGIN
     IF current_database() != 'easyslice_staging' THEN
       RAISE EXCEPTION 'Safety Violation: Target database is not easyslice_staging';
     END IF;
   END $$;

   -- 2. Delete ONLY explicitly identifiable synthetic staging test rows
   DELETE FROM workflow.asset_import_requests
   WHERE platform = 'tiktok' AND owner_uid LIKE 'staging_test_tiktok_%';

   -- 3. Assert no un-isolated tiktok rows remain before altering constraint
   DO $$
   BEGIN
     IF EXISTS (SELECT 1 FROM workflow.asset_import_requests WHERE platform = 'tiktok') THEN
       RAISE EXCEPTION 'Rollback Blocked: Non-test platform=tiktok records detected';
     END IF;
   END $$;

   -- 4. Re-apply constraint
   ALTER TABLE workflow.asset_import_requests DROP CONSTRAINT ck_asset_import_authority;
   ALTER TABLE workflow.asset_import_requests ADD CONSTRAINT ck_asset_import_authority
     CHECK (command_version = '1.0' AND platform = 'youtube');
   COMMIT;
   ```
6. If non-test TikTok records exist, rollback intentionally aborts and raises an exception rather than silently destroying data.

**WP-03 Status:** `ACCEPTED_WITH_LIMITATIONS`
*Limitation:* Rollback script must strictly target `owner_uid LIKE 'staging_test_tiktok_%'` and fail closed if un-isolated rows exist.

---

## 5. Review 4: WP-04 Offline Synthetic Pipeline

### Codebase Inspection References
- `lib/server/audioHighlightInspection.ts` & `lib/server/packagedFfmpeg.ts`: Uses packaged FFmpeg in `node_modules/.nexcut-runtime/`.
- `lib/clipPlatform/platformAwareOptimization.ts`: TikTok clipping profile accepts pre-computed story candidates and transcript cues.
- `app/api/transcript/durable/route.ts`: Audio extraction uses FFmpeg; transcription calls `GeminiTranscriptProvider`.

### Analysis
1. The local pipeline can be completely exercised offline by feeding synthetic subtitle cues directly into `platformAwareOptimization.ts` and executing local FFmpeg rendering.
2. The synthetic subtitle JSON fixture format matches `TranscriptWord[]` / `SubtitleCue[]` used across the clipping engine.
3. Packaged FFmpeg 7.0.2 is verified present and materialized via `npm run prebuild`.
4. The test can generate a real vertical 1080x1920 MP4 file locally using `lavfi` synthetic test sources and packaged FFmpeg.
5. The test can run `ffprobe` or `inspectAudioMedia` locally to verify exact 9:16 aspect ratio, duration between 15–55s, and video encoding parameters.
6. All network-capable classes (such as `GeminiTranscriptProvider` and `Storage`) are completely avoided or mocked in offline tests.
7. Zero external network calls are made.

**WP-04 Status:** `ACCEPTED_FOR_LOCAL_IMPLEMENTATION`

---

## 6. Work Package Integration & Sequencing

### Code Overlap in `composition.ts`
- WP-01 modifies bucket creation in `composition.ts`.
- WP-02 modifies database and credential assertions in `composition.ts`.
- *Resolution:* WP-01 and WP-02 should be implemented in coordinated succession:
  1. **Step 1: WP-01** (GCS bucket resolver function + unit tests).
  2. **Step 2: WP-02** (Environment guard assertions in `composition.ts` and `routeGuard.ts` + unit tests).
  3. **Step 3: WP-03** (Author staging SQL scripts in `db/workflow/migrations/staging/` + static verification test).
  4. **Step 4: WP-04** (Synthetic pipeline integration test + fixture).
  5. **Step 5: Full Regression Suite Run** (Verify 40 baseline tests + all new unit tests pass).

---

## 7. Review 6: Git and Evidence Integrity Audit

### Git State
- **HEAD Commit SHA:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
- **Current Branch:** `jules-3110607620436353703-ca56d790`
- **Working Tree & Staging Status:**
  - `git status --short`: Shows 22 files staged in the Git Index (`A  docs/implementation/...`).
  - `git diff`: Unstaged diff is 0 (clean).
  - All Phase 2.16, 2.17, 2.18, and approval matrix documents are **staged in the index awaiting commit**, not committed to `origin/main`.
  - *Correction:* The phrase "workspace completely clean" in prior summaries was colloquially used to mean no uncommitted working-tree modifications existed outside the staged index, but strictly speaking, the workspace contains **staged, uncommitted files**.

---

## 8. Final Status Summary

| Work Package | Title | Final Technical Status | Primary Safeguard / Limitation |
|---|---|---|---|
| **WP-01** | GCS Environment Bucket Authority | `ACCEPTED_FOR_LOCAL_IMPLEMENTATION` | Fail-closed resolver; production bucket strictly locked to `nexcut-prod-jp-2026-media`. |
| **WP-02** | Environment Startup Guards | `ACCEPTED_WITH_LIMITATIONS` | Must validate full Cloud SQL connection tuple and WIF project authority, not just DB name. |
| **WP-03** | Staging Migration & Rollback Scripts | `ACCEPTED_WITH_LIMITATIONS` | Rollback must isolate test records by prefix (`staging_test_tiktok_%`); no blanket delete. |
| **WP-04** | Offline Synthetic Pipeline Test | `ACCEPTED_FOR_LOCAL_IMPLEMENTATION` | Zero external network calls; real packaged FFmpeg vertical 9:16 rendering. |

### Overall Verdict: `READY_WITH_LIMITATIONS`

The technical designs and risk controls for WP-01 through WP-04 are thoroughly verified and ready for local-only code implementation, subject to the documented limitations. Decision to proceed with local implementation rests exclusively with the Product Owner.
