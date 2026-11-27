# Implementation Gap Matrix: TikTok URL to Clipping Pipeline

**Repository:** `C:\Users\hirom\easyslice-ai`
**Investigation Date:** 2026-11-07

---

## 1. Gap Classification Key
- `VERIFIED_COMPLETE`: Fully implemented, operational, and covered by repository tests.
- `PARTIALLY_IMPLEMENTED`: Fragment exists in code (e.g. UI placeholder or parser stub) but missing full end-to-end wiring.
- `NOT_IMPLEMENTED`: Capability does not exist in the codebase.
- `BLOCKED_BY_EXTERNAL_REQUIREMENT`: Blocked by external third-party limitations (e.g., absence of official TikTok download API, TikTok Terms of Service).
- `BLOCKED_BY_ENVIRONMENT`: Blocked by cloud infrastructure or missing local binaries.
- `NOT_APPLICABLE_WITH_EVIDENCE`: Deliberately excluded by architecture decisions.

---

## 2. Complete Evidence-Backed Gap Matrix

| Area | Existing Implementation | Missing Component | Evidence | Dependency | Risk | Proposed Action | Classification |
|---|---|---|---|---|---|---|---|
| **1. TikTok URL Recognition** | `detectUrlSource()` checks `hostname === "tiktok.com"` in `lib/urlImport.ts:18` | Full URL parser in `classifyUrl()` for desktop and mobile paths | `lib/urlAcquisition/classifyUrl.ts:18` rejects all non-YouTube hosts | URL Classifier contract | False positive on non-video TikTok URLs | Add TikTok domain recognition to `classifyUrl.ts` | **PARTIALLY_IMPLEMENTED** |
| **2. URL Normalization** | None | Regex parser to strip query parameters (`?_r=1`, `&is_from_webapp=1`) and build canonical format `https://www.tiktok.com/@user/video/id` | `lib/urlAcquisition/classifyUrl.ts` contains only YouTube parsing | URL parsing library / regex | Malformed URLs or vanity usernames breaking regex | Implement deterministic snowflake ID regex `/^\d{18,20}$/` | **NOT_IMPLEMENTED** |
| **3. Redirect Handling** | None | HTTP client to resolve `vm.tiktok.com` / `vt.tiktok.com` short links to canonical URLs | Zero redirect resolution code in `lib/urlAcquisition/` or `lib/server/assetImport/` | Safe egress HTTP client | SSRF vulnerability if arbitrary redirects are followed | Implement safe HEAD-based redirect resolver restricted to TikTok domain allowlist | **NOT_IMPLEMENTED** |
| **4. Permission Validation** | User authentication session (`requireAuthenticatedRequest`) exists in `lib/server/productionIdentity/` | Validation of video accessibility, age restrictions, and creator rights | No check for TikTok private/age-gated/deleted status | TikTok response probe / oEmbed | Ingesting private or infringing content | Use TikTok oEmbed API (`/oembed?url=...`) to verify video is public and accessible | **NOT_IMPLEMENTED** |
| **5. Authorized Acquisition** | YouTube direct importer exists (`lib/server/assetImport/directYouTubeImporter.ts`) | TikTok acquisition adapter conforming to `SourceAdapter` | `lib/server/acquisitionWorker/youtubeAdapter.ts` is the only adapter | Source acquisition mechanism | TikTok anti-bot bans, CAPTCHAs, or TOS breach | Recommend User File Upload or Creator Authorized Export; avoid scraping | **BLOCKED_BY_EXTERNAL_REQUIREMENT** |
| **6. Video Binary Availability** | MP4 stream available for uploaded files and YouTube | Raw MP4 video binary from TikTok URL | Official TikTok APIs do NOT provide MP4 downloads (Display API only gives iframe) | TikTok Platform API policy | No official API endpoint provides video bytes | Guide user to upload MP4 file directly, or utilize authorized Creator Studio export | **BLOCKED_BY_EXTERNAL_REQUIREMENT** |
| **7. Asset Registration** | `workflow.jobs` and `workflow.media` in PostgreSQL; GCS storage in `media/${jobId}/${mediaId}/input.mp4` | Additive platform value in `workflow.asset_import_requests` table | DB constraint `ck_asset_import_authority CHECK (platform = 'youtube')` in `V000008` migration | Database migration | DB check violation if platform is `'tiktok'` | Add migration `V000009` updating check constraint to `IN ('youtube', 'tiktok')` | **PARTIALLY_IMPLEMENTED** |
| **8. Metadata Extraction** | Packaged FFmpeg (`inspectIngestedVideo` in `lib/server/youtubeIngestion.ts`) extracts duration, width, height, codec | TikTok title, author, description extraction from web/API | Only video stream FFprobe exists; no TikTok metadata parser | oEmbed / Web parser | Missing title or author credit | Fetch oEmbed JSON to populate video title and author in workspace state | **NOT_IMPLEMENTED** |
| **9. Video Source Layer Handoff** | `{ jobId, mediaId }` durable reference accepted across entire app | Typed TikTok variant in `CanonicalAssetImportSource` | `lib/assetImport/types.ts:8` has `platform: "youtube"` | Asset import types | Type-check failure if TikTok source passed | Extend `CanonicalAssetImportSource` union with TikTok type | **PARTIALLY_IMPLEMENTED** |
| **10. Clipping Job Creation** | `createJobWithId()` and `createMediaWithId()` in `lib/server/durableMediaOwnership/repository.ts` | None (fully capable) | `lib/server/durableMediaOwnership/repository.ts:29-50` | PostgreSQL | None | Handoff directly to existing repository | **VERIFIED_COMPLETE** |
| **11. Analysis & Transcription** | `/api/audio-energy` (FFmpeg) and `/api/transcript/durable` (Gemini API) | None (fully capable) | `app/api/audio-energy/route.ts`, `app/api/transcript/durable/route.ts` | Packaged FFmpeg, Gemini API Key | Audio track missing in silent TikToks | Reuses existing audio/transcript routes unchanged | **VERIFIED_COMPLETE** |
| **12. Clip Candidate Generation** | `lib/clipCandidates/` and `lib/clipRanking/` generate scored candidates; `lib/clipPlatform/profiles.ts` has TikTok profile | None (fully capable) | `lib/clipPlatform/profiles.ts:tiktok` (15-55s policy, 0.22 hook weight) | Clip scoring engine | None | Target profile `"tiktok"` already defined and active | **VERIFIED_COMPLETE** |
| **13. Cutting & Rendering** | `/api/cut` (single clip) and `/api/multi-cut` (batch ZIP) | None (fully capable) | `app/api/multi-cut/route.ts:98` has `scale=720:1280,crop=720:1280` | Packaged FFmpeg | None | Existing FFmpeg renderer handles MP4 seamlessly | **VERIFIED_COMPLETE** |
| **14. Subtitle & Export Flow** | `/api/burn-subtitle` and AdmZip export packaging | None (fully capable) | `app/api/burn-subtitle/route.ts`, `app/api/multi-cut/route.ts:104` | AdmZip, FFmpeg | None | Existing subtitle burn and ZIP export operate on standard MP4 | **VERIFIED_COMPLETE** |
| **15. Error Handling & Recovery** | YouTube-specific error mapping in `app/workspace-flow/page.tsx:325` | TikTok-specific error mappings (private video, deleted, rate limit) | Only YouTube error codes mapped in UI | UI error state | Unclear error message to user | Add localized error messages for TikTok-specific failures | **PARTIALLY_IMPLEMENTED** |
| **16. End-to-End Verification** | Unit tests for YouTube classifier, asset import, multi-cut | TikTok URL end-to-end integration tests | Zero TikTok tests in `tests/urlAcquisition/` | Synthetic fixtures | Regressions | Add offline unit tests with mock TikTok URLs and synthetic fixtures | **NOT_IMPLEMENTED** |
