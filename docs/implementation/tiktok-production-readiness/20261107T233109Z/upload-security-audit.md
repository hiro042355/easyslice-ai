# Upload and File Security Audit

**Audit Timestamp:** `2026-11-07T23:31:09Z`
**Evaluator:** Jules (Software Engineer)
**Overall Status:** `PASS` (Robust production controls verified)

---

## 1. Security Control Inventory & Analysis

| Control Area | Implementation Reference | Status | Evidence & Security Evaluation |
|---|---|---|---|
| **File Type Validation (MIME)** | `app/api/media/admit/route.ts:36, 61`<br>`lib/client/durableMediaAdmission.ts:74` | PASS | Strict enforcement: Only `"video/mp4"` is admitted. Rejects any non-MP4 MIME type. |
| **File Size Limits** | `app/api/media/admit/route.ts:11, 36` | PASS | Hard limit of `2 * 1024 * 1024 * 1024` (2 GiB). Integer safety checked via `Number.isSafeInteger(body.size)`. Size > 0 enforced. |
| **Content Size Verification** | `app/api/media/admit/route.ts:65` | PASS | At `finalize` step, the GCS object metadata is retrieved: `String(metadata.size) !== custom.nexcutExpectedSize` rejects mismatched or truncated uploads. |
| **Direct-to-Storage Architecture** | `lib/client/durableMediaAdmission.ts:82` | PASS | Client uploads directly to GCS via Resumable Upload URL, bypassing Vercel serverless request body limits (4.5 MB). |
| **Authentication & Authorization** | `app/api/media/admit/route.ts:20`<br>`lib/server/productionIdentity/routeGuard.ts` | PASS | `requireAuthenticatedRequest(request)` enforces valid session cookie / token. Rejects unauthenticated calls with 401. |
| **Origin & CSRF Protection** | `app/api/media/admit/route.ts:16-18, 22-23` | PASS | `sameOrigin(request)` compares `Origin` header with `new URL(request.url).origin`. Cross-origin requests fail with 403. |
| **Owner Isolation (`ownerUid`)** | `app/api/media/admit/route.ts:46, 62`<br>`lib/server/durableMediaOwnership/repository.ts:45, 57` | PASS | Owner UID from authenticated session is stamped into GCS custom metadata (`nexcutOwnerUid`) and PostgreSQL foreign keys (`workflow.jobs.owner_uid`). Finalize validates ownership match. |
| **Storage Key Isolation & Traversal** | `lib/server/durableMediaOwnership/storageKey.ts:8-16` | PASS | Keys follow fixed pattern `media/${jobId}/${mediaId}/${kind}.mp4` where `jobId` and `mediaId` must be strictly formatted UUID v4 (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`). No user input is reflected in paths; path traversal is mathematically impossible. |
| **Duplicate Upload Handling** | `app/api/media/admit/route.ts:73-77` | PASS | Idempotent finalize: If `resolveOwnedJob` and `resolveOwnedMedia` already exist for the given `jobId`/`mediaId` with matching storage key, returns 200 without creating duplicate records. |
| **Failure Cleanup & Abort Handling** | `app/api/media/admit/route.ts:82-87` | PASS | On database error during finalize, transaction is rolled back and GCS object is deleted via `object.delete({ ignoreNotFound: true })`. Abandoned partial uploads in GCS are cleaned up by bucket lifecycle rules (`lifecycle_rule` in Terraform). |
| **Temporary File Handling in Processing** | `lib/server/durableMultiCut.ts:30-80` | PASS | Multi-cut FFmpeg jobs use isolated temporary directories under `/tmp` created via `mkdtemp`, with `rm -rf` cleanup in `finally` blocks. |

---

## 2. Bucket Lifecycle Security (`infra/production/gcp/media-storage.tf`)

1. **Uniform Bucket-Level Access:** `uniform_bucket_level_access = true` enforced.
2. **Public Access Prevention:** `public_access_prevention = "enforced"` prevents accidental public exposure of media binaries.
3. **Automated Deletion of Abandoned Uploads:**
   - Standard objects: `days_since_custom_time = 7`
   - Acquisition handoff: `age = 7` with `matches_prefix = ["acquisition-handoff/v1/"]`.
4. **IAM Least Privilege:**
   - Only `google_service_account.media_runtime` is granted object read/write permissions via Google Cloud Workload Identity Federation (WIF).

---

## 3. Upload Security Verdict

- **Result:** `PASS`.
- The durable media admission boundary is tightly guarded with authentication, origin checks, UUID validation, owner-scoped isolation, GCS resumable upload tokens, metadata verification, and automatic failure rollback.
