# Deliverable 01: Final Staging Architecture Specification

## 1. Executive Summary & Architectural Scope
This document specifies the authoritative staging and production readiness architecture for the NEXCUT AI TikTok publishing and media ingestion subsystem. It consolidates all architectural decisions, security boundaries, and operational procedures established across Phase 2.16 through Phase 2.72.

The architecture enforces strict fail-closed boundaries across four classification groups:
- **Group A (Local / Offline Implementation):** Fully authorized, mocked, synthetic, zero cloud access.
- **Group B (Design & Pre-Approval):** Architectural blueprints, risk analyses, and DDL formulations.
- **Group C (Staging Validation):** Controlled staging environment execution, gated by 5 distinct Product Owner approvals (PO-01 through PO-05).
- **Group D (Production Operations):** Strictly prohibited during this readiness cycle; permanently locked down until staging verification completes.

---

## 2. Infrastructure Readiness & Isolation Matrix

### 2.1 Cloud Resource Separation
| Component | Staging Environment | Production Environment | Guard / Enforcement Mechanism |
| :--- | :--- | :--- | :--- |
| **GCP Project** | `nexcut-staging` (or dedicated staging folder) | `nexcut-prod-jp-2026` (Number: `566365202495`) | `mediaWifCredential.ts` project number pin |
| **GCS Bucket** | `easyslice-staging-media-artifacts` | `nexcut-prod-jp-2026-media` | `resolveAuthorizedBucketName()` in `gcsAdapter.ts` |
| **Cloud SQL Instance** | Dedicated staging instance / database `easyslice_staging` | `nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql` / `nexcut` | `validateMediaCloudSqlAuthority()` in `cloudSqlAdapter.ts` |
| **IAM User** | `easyslice-staging-sa@...` | `nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam` | Hard-fail on environment string mismatch |
| **WIF Provider** | `projects/.../providers/vercel-staging` | `projects/566365202495/locations/global/workloadIdentityPools/nexcut-prod-vercel/providers/vercel-production` | Exact string equality in `validateMediaWifConfig()` |

### 2.2 Local & Test Environment Isolation
- Local unit tests and developer devbox environments MUST NOT connect to remote Cloud SQL or GCS instances.
- `lib/workflowMigration/localConnectionGuard.ts` intercepts database connection options, asserting that `host` resolves strictly to `localhost` or `127.0.0.1`. Any external hostname (e.g. `*.google.internal`, public IP, or Cloud SQL proxy remote domain) triggers an immediate process halt.

---

## 3. Database & Migration Safety Architecture

### 3.1 Migration V000009 DDL Contract
Flyway migration `db/workflow/migrations/V000009__expand_asset_import_platform.sql` executes the following atomic operations under schema `workflow`:
```sql
ALTER TABLE workflow.asset_import_requests
  DROP CONSTRAINT IF EXISTS ck_asset_import_authority;

ALTER TABLE workflow.asset_import_requests
  ADD CONSTRAINT ck_asset_import_authority
  CHECK (platform IN ('youtube', 'tiktok'));
```

### 3.2 Lock Duration & Concurrency Safety
- **Lock Required:** `ACCESS EXCLUSIVE` on `workflow.asset_import_requests`.
- **Pre-requisite Condition:** Table row count must be audited prior to DDL execution. In staging/production, the constraint is purely additive over an existing enum-like check.
- **Lock Window:** Under normal conditions, dropping and re-adding a check constraint without table rewrite requires `< 25ms`.
- **Timeout Protection:** The staging execution script must set:
  ```sql
  SET LOCAL lock_timeout = '2000ms';
  SET LOCAL statement_timeout = '5000ms';
  ```

### 3.3 Rollback Architecture (`U000009`)
In the event that migration `V000009` must be rolled back:
1. Identify and purge/archive all rows with `platform = 'tiktok'`.
2. Delete child records in dependent tables referencing those requests.
3. Re-apply the baseline check constraint allowing only `'youtube'`:
   ```sql
   ALTER TABLE workflow.asset_import_requests
     DROP CONSTRAINT IF EXISTS ck_asset_import_authority;

   ALTER TABLE workflow.asset_import_requests
     ADD CONSTRAINT ck_asset_import_authority
     CHECK (platform IN ('youtube'));
   ```
4. Update `public.flyway_schema_history` if rolling back within a Flyway-managed pipeline.

---

## 4. Authentication, Token Security & Tenant Isolation

### 4.1 Route Authentication & Firebase Guard
- Every incoming mutation at `/api/v1/assets/import` and `/api/media/admit` is gated by `requireAuthenticatedRequest` (`lib/server/productionIdentity/routeGuard.ts`).
- Production identity tokens are decoded via Firebase Admin SDK.
- The authenticated `uid` is injected into the request context and becomes the immutable `owner_uid` stored in PostgreSQL.

### 4.2 Synthetic Test Taint Purge Guard
- To prevent test or staging data from commingling with production user data, all automated test runs generate records prefixed with:
  ```text
  owner_uid = 'test-run.<RUN_ID>.<SEQ>'
  ```
- Any synthetic cleanup or teardown queries must enforce strict predicate qualification:
  ```sql
  DELETE FROM workflow.asset_import_requests
  WHERE ((owner_uid LIKE 'test-run.%') IS TRUE)
    AND created_at < NOW() - INTERVAL '1 hour';
  ```
- Unconditional `DELETE` or wildcard truncations are statically and dynamically rejected by `rollbackIsolationHarness.ts`.

---

## 5. Pipeline Execution & Ingestion Flow

```text
[ Client / Browser ]
         │
         │ 1. POST /api/v1/assets/import { url: "https://www.tiktok.com/@user/video/..." }
         ▼
[ Route Guard: requireAuthenticatedRequest ]
         │ (Decodes Firebase JWT, extracts uid)
         ▼
[ URL Acquisition: classifyUrl.ts & classifyTikTokUrl.ts ]
         │
         ├─► If Direct TikTok Video URL:
         │     Return HTTP 200 with guidance payload:
         │     { status: "direct_download_unsupported", guidance: "UPLOAD_MP4", admissionEndpoint: "/api/media/admit" }
         │
         └─► If MP4 Upload via /api/media/admit:
               │
               ▼
[ Durable Media Admission: lib/client/durableMediaAdmission.ts ]
         │ 2. Validates video/mp4 MIME type and size <= 2GB (MAX_MEDIA_BYTES)
         │ 3. Issues GCS Resumable Signed Upload URL (restricted to authorized bucket)
         ▼
[ Google Cloud Storage (Bucket Authority Verified) ]
         │ 4. Client streams binary chunks directly to GCS
         ▼
[ Media Processing Worker / FFmpeg ]
         │ 5. Validates MP4 atom headers and duration window (15s - 55s)
         │ 6. Executes vertical crop (9:16) weighting
         │ 7. Produces optimized vertical MP4 cut artifact
         ▼
[ Workflow Outbox & State Persistence ]
         │ 8. PostgreSQL state transitions to 'completed'
```

---

## 6. Failure Recovery & Compensatory Transactions

1. **GCS Upload Abandonment:**
   - If a client initiates a resumable upload but aborts before completion, GCS bucket lifecycle rules automatically delete incomplete multipart uploads after 1 day (`abortIncompleteMultipartUploadDays = 1`).
2. **PostgreSQL Insert Failure After GCS Upload:**
   - If the database transaction fails during `admit` registration, the runtime issues an asynchronous compensatory delete request against the orphan GCS object key.
3. **Worker Processing Crash:**
   - Reconciliation engine detects orphaned workflows in state `processing` whose `heartbeat_at` exceeds 5 minutes. The reconciliation worker marks the job `retry_pending` or executes terminal fail-safe cleanup.

---

## 7. Observability & Telemetry

- **Structured JSON Logging:** All audit events, WIF handshakes, and migration checkpoints emit structured JSON containing `event_name`, `timestamp`, `environment`, `tenant_id`, and `correlation_id`.
- **Redaction of Sensitive Credentials:** The logging layer strips authorization headers, OAuth refresh tokens, and Cloud SQL passwords prior to stdout emission.
- **Health Checks:** Staging deployment exposes `/api/health` verifying Cloud SQL connection pool status and GCS read capability.
