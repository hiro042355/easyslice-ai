# Implementation Summary: TikTok Video Source Integration

**Date:** 2026-11-07
**Author:** Jules (Software Engineer)
**Status:** IMPLEMENTED_OFFLINE_READY / USER_FILE_FALLBACK_ACTIVE

---

## 1. What Was Implemented

1. **TikTok URL Recognition and Classification:**
   - Updated `lib/urlAcquisition/types.ts` and `lib/urlAcquisition/classifyUrl.ts` to recognize standard desktop URLs (`https://www.tiktok.com/@user/video/:id`), mobile URLs (`https://m.tiktok.com/v/:id.html`), and short share hosts (`vm.tiktok.com`, `vt.tiktok.com`).
   - Implemented strict snowflake ID validation (`/^\d{18,20}$/`) and username extraction.
   - Implemented automatic stripping of tracking query parameters (`?_r=1`, `&is_from_webapp=1`, `utm_*`).
   - Implemented safe classification of non-video TikTok URLs (profiles, live streams, sounds, photo carousels) as `UNSUPPORTED_TIKTOK`.
   - Maintained 100% backward compatibility with existing YouTube classification.

2. **Safe Short URL & Redirect Handling Contract:**
   - Implemented `lib/urlAcquisition/tiktokRedirect.ts` providing `resolveSafeTikTokRedirect()`.
   - Resolves HTTP 301/302/307 redirects using manual redirect inspection (`redirect: "manual"` and `HEAD` request).
   - Enforces strict hostname allowlist (`tiktok.com`, `www.tiktok.com`, `m.tiktok.com`, `vm.tiktok.com`, `vt.tiktok.com`) preventing SSRF or open redirect vulnerabilities.

3. **Contract and Schema Expansion:**
   - Extended `CanonicalAssetImportSource` in `lib/assetImport/types.ts` to support `platform: "tiktok"`.
   - Verified that `createAssetImportFingerprint()` (`lib/server/assetImport/fingerprint.ts`) deterministically computes 32-byte SHA-256 fingerprints for TikTok assets.
   - Added migration script `db/workflow/migrations/V000009__expand_asset_import_platform.sql` updating `ck_asset_import_authority` check constraint to `IN ('youtube', 'tiktok')`.

4. **Acquisition Boundary & User Guidance Engine:**
   - Implemented `lib/urlAcquisition/tiktokAcquisitionState.ts` providing structured user guidance when direct binary acquisition is restricted by platform policy.

5. **Creator Flow Workspace UI Integration:**
   - Enhanced `app/workspace-flow/page.tsx` Step 1 (Universal URL Import) to classify TikTok URLs in real-time.
   - When a valid TikTok URL is provided, the UI displays the canonical URL, video ID, author username, and clear guidance explaining why direct automated download is restricted under platform terms.
   - Provides seamless guidance directing the user to supply their authorized MP4 video file, which directly enters the durable admission pipeline (`/api/media/admit`) and hands off to existing analysis, clipping, and export.

6. **End-to-End Pipeline Reuse:**
   - Admitted MP4 assets register in `workflow.jobs` and `workflow.media`.
   - Reuses existing audio energy analysis (`/api/audio-energy`), transcript generation (`/api/transcript/durable`), and AI highlights (`/api/ai-highlight`).
   - Reuses existing TikTok clip optimization profile in `lib/clipPlatform/profiles.ts` (15–55s duration policy, 0.22 hook strength, 9:16 vertical crop).
   - Reuses existing cutting engine (`/api/cut`, `/api/multi-cut`) and ZIP packaging.

---

## 2. What Remains Unsupported
- **Automated Public TikTok URL Video Binary Downloading:**
  - Official TikTok APIs do not provide arbitrary raw MP4 binaries from URLs.
  - Automated extraction/scraping without express written consent violates TikTok Terms of Service (Section 5) and NEXCUT security policies.
  - Therefore, automated URL-to-MP4 binary download remains unsupported without external credentials or explicit legal/PO authorization.
