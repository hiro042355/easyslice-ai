# Current Main Baseline Overview

**Audit Timestamp:** `2026-11-08T05:50:00Z`
**Current `origin/main` SHA:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Prior Baseline Commit:** `d636ae79045cca888757bf897e969d5d485f6640` (PR #7 Merge Baseline)

---

## 1. Baseline Git State

```text
Commit:  e8338e8b7dcd731dc9b494204e16749fc4918869
Parents: d636ae79045cca888757bf897e969d5d485f6640 681239db71d949216e18b7163a19b73c667adee4
Author:  hiro042355 <hiroma04231603@gmail.com>
Subject: Merge pull request #8 from hiro042355/jules-15655640267996884995-a76be81e
```

The tree reflects a 100% reproducible state. The workspace is directly situated on this commit.

---

## 2. Reconfirmed TikTok Pipeline Capabilities Status

A comprehensive review of the codebase on `main` confirms the status of the 10 core pipeline dimensions:

### 1. TikTok URL Classification
- **Code Reference:** `lib/urlAcquisition/classifyTikTokUrl.ts`, `lib/urlAcquisition/classifyUrl.ts`
- **Current Status:** `VERIFIED_OFFLINE`
- **Details:** Classifies desktop paths (`/@user/video/:id`), mobile paths (`/v/:id.html`), short link formats (`vm.tiktok.com`, `vt.tiktok.com`, `v.douyin.com`), rejecting non-video paths and lookalike phishing hosts. Matches `CanonicalAssetImportSource` platform discriminator `'tiktok'`.

### 2. Safe Redirect Resolution & SSRF Protection
- **Code Reference:** `lib/urlAcquisition/tiktokRedirect.ts`
- **Current Status:** `VERIFIED_OFFLINE`
- **Details:** Limits redirect hops (max 3), enforces strict HTTPS scheme, timeout bounded (5000ms), and strictly checks destination host against approved TikTok hostnames (`tiktok.com`, `www.tiktok.com`, `m.tiktok.com`, `vt.tiktok.com`, `vm.tiktok.com`, `douyin.com`, `v.douyin.com`). Prevents loop exhaustion and private IP SSRF attacks.

### 3. Authorized MP4 Upload Handoff
- **Code Reference:** `lib/urlAcquisition/tiktokPipelineHandoff.ts`, `lib/client/durableMediaAdmission.ts`
- **Current Status:** `VERIFIED_OFFLINE`
- **Details:** When a TikTok URL is input, the application returns clear guidance (`evaluateTikTokAcquisitionGuidance`) instructing the user to supply their authorized MP4 file directly to `/api/media/admit`, adhering strictly to platform terms and bypassing direct scraping.

### 4. 2 GiB Client-Side Validation
- **Code Reference:** `lib/client/durableMediaAdmission.ts`
- **Current Status:** `VERIFIED_OFFLINE`
- **Details:** Proactively verifies `file.size <= 2 * 1024 * 1024 * 1024` and MIME type `video/mp4` before dispatching any network request. Fails immediately and cleanly with descriptive client diagnostics on 0-byte, negative, NaN, non-MP4, or oversized inputs.

### 5. Server-Side Authoritative Validation
- **Code Reference:** `app/api/media/admit/route.ts`
- **Current Status:** `VERIFIED_OFFLINE`
- **Details:** Authenticates caller via Firebase Admin session (`requireAuthenticatedRequest`), validates `ownerUid`, checks CSRF/Origin boundaries, verifies GCS metadata length against byte ceiling, and enforces transactional integrity.

### 6. Media Admission and Persistence
- **Code Reference:** `app/api/media/admit/route.ts`, `workflow.media`, `workflow.jobs`
- **Current Status:** `VERIFIED_OFFLINE`
- **Details:** PostgreSQL transaction commits asset records atomically; on failure, compensatory GCS deletion is dispatched to prevent orphan media accumulation. Idempotent on repeated calls.

### 7. Existing Clipping Pipeline
- **Code Reference:** `lib/clipPlatform/platformAwareOptimization.ts`
- **Current Status:** `VERIFIED_OFFLINE`
- **Details:** Features an explicit TikTok platform profile (`tiktok`), enforcing a 15–55 second window, 9:16 vertical crop weighting, and narrative coherence prioritization without altering the core candidate quality floor.

### 8. Final Video Export
- **Code Reference:** Packaged FFmpeg 7.0.2 in `node_modules/.nexcut-runtime/`
- **Current Status:** `VERIFIED_OFFLINE`
- **Details:** Packaged binary renders vertical 9:16 MP4 crops and bundles multi-cut packages into ZIP archives locally.

### 9. Database Migration V000009
- **Code Reference:** `db/workflow/migrations/V000009__expand_asset_import_platform.sql`
- **Current Status:** `NOT_VERIFIED` (Static Review: `PASS`)
- **Details:** Migration script drops and re-adds `ck_asset_import_authority` check constraint to include `'tiktok'`. Static review shows it is purely additive and backward-compatible with `'youtube'`. Live execution against Cloud SQL has not been executed.

### 10. Production Runtime Configuration
- **Code Reference:** Environment variables, Workload Identity Federation, GCP Project settings
- **Current Status:** `NOT_VERIFIED`
- **Details:** Live staging/production runtime configuration, IAM bindings, and Cloud SQL pool limits remain to be verified in a dedicated staging environment.
