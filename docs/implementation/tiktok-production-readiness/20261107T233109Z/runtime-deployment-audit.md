# Runtime and Deployment Audit

**Audit Timestamp:** `2026-11-07T23:31:09Z`
**Evaluator:** Jules (Software Engineer)
**Overall Status:** `NOT_VERIFIED` for Live Production Environment / `PASS` for Local Architecture Alignment

---

## 1. Production Architecture Overview

The NEXCUT AI production system relies on a hybrid infrastructure model defined in `infra/production/gcp/`:
1. **Frontend & API Routes:** Next.js (App Router) deployed on Vercel (`runtime = "nodejs"`).
2. **Media Storage:** Google Cloud Storage bucket (`production_media` in `infra/production/gcp/media-storage.tf`).
3. **Database:** Google Cloud SQL PostgreSQL 18 instance (`nexcut-prod-postgresql` in `infra/production/gcp/cloud-sql.tf`).
4. **Cloud Run / Worker:** Private Cloud Run services for heavy worker jobs (`infra/production/gcp/cloud-run.tf`).
5. **Authentication & Identity:** Google Workload Identity Federation (WIF) bridging Vercel OIDC tokens to GCP IAM service accounts (`infra/production/gcp/vercel-wif.tf`).

---

## 2. Configuration & Runtime Constraints

| Runtime Component | Configured Boundary / Invariant | Production Risk / Finding | Status |
|---|---|---|---|
| **Vercel Serverless Function Timeout** | Route-level: `export const maxDuration = 300` | Heavy FFmpeg rendering or long media processing could hit Vercel maximum execution limits (default 15s–60s on hobby/pro; up to 300s on Enterprise). Resumable direct upload to GCS properly avoids function upload timeouts. | MITIGATED |
| **Vercel Payload Limit (4.5 MB)** | Direct GCS resumable upload via `/api/media/admit` | The client obtains a GCS resumable URL and streams directly to GCP bucket, never transmitting multi-gigabyte video files through Vercel serverless edges. | PASS |
| **Packaged FFmpeg Availability** | Materialized via `npm run prebuild` (`node scripts/materializeFfmpegBinary.mjs`) | FFmpeg 7.0.2 is packaged into `.nexcut-runtime/ffmpeg/bin/ffmpeg`. Verified functional for 9:16 vertical MP4 exports locally. In Vercel deployment, `npm run prebuild` must run in build step. | PASS |
| **Google Cloud WIF & Credentials** | `lib/server/productionMediaRuntime/composition.ts` | Requires environment variables: `MEDIA_BUCKET_NAME`, `CLOUD_SQL_INSTANCE_CONNECTION_NAME`, `POSTGRES_DATABASE`, `POSTGRES_IAM_USER`, and `@vercel/oidc` token. | NOT_VERIFIED (External Config) |
| **PostgreSQL Pool Management** | `withProductionMediaCloudSqlPool` | Connects via IAM authentication. Cloud SQL connection pooling must be monitored for pool exhaustion under high concurrent multi-cut rendering requests. | NOT_VERIFIED (Production Metrics) |
| **GCS Lifecycle Policy** | 7-day TTL on temporary objects; custom time on exports | Prevents unbounded storage cost accumulation from abandoned uploads and temporary slices. | PASS |

---

## 3. Deployment Gaps Requiring Production Verification

1. **Vercel Environment Variables:**
   - Ensure `MEDIA_BUCKET_NAME`, `CLOUD_SQL_INSTANCE_CONNECTION_NAME`, `POSTGRES_DATABASE`, and `POSTGRES_IAM_USER` are correctly provisioned in Vercel project environment settings.
2. **Flyway Migration Runner:**
   - Migration `V000009__expand_asset_import_platform.sql` must be triggered via the migration service account (`database_migration@...`) before activating TikTok asset imports.
3. **External Real-World Testing:**
   - End-to-end execution of `/api/media/admit` in a deployed staging environment with real GCS buckets and real Cloud SQL instances.
