# Executive Summary: TikTok Video URL Acquisition → Existing NEXCUT AI Clipping Pipeline

**Date:** 2026-11-07
**Author:** Jules (Software Engineer)
**Status:** BLOCKED_BY_EXTERNAL_REQUIREMENTS (for arbitrary public TikTok URL auto-download) / PARTIALLY_READY (for user-authorized/manual asset import)

---

## 1. Objective and Core Question

This investigation answers the primary question:
**What exactly is missing to make a TikTok video URL usable as an input to the existing NEXCUT AI clipping engine?**

This report represents a comprehensive, read-only architectural investigation, platform terms audit, and gap analysis across the core repository (`C:\Users\hirom\easyslice-ai`).

---

## 2. Executive Findings

### A. Current Implementation State
- **TikTok URL Acquisition is NOT implemented.**
  - `lib/urlAcquisition/classifyUrl.ts` permits only YouTube hosts (`youtube.com`, `youtu.be`) and explicitly rejects all other domains as `UNSUPPORTED_URL`.
  - `lib/urlImport.ts` has a helper `detectUrlSource` that merely inspects the hostname string (`tiktok.com`) for a passive UI label in `app/workspace-flow/page.tsx`. It performs no URL parsing, validation, redirect resolution, or video acquisition.
  - The production asset import endpoint (`POST /api/v1/assets/import`) strictly requires `classifyUrl(value.sourceUrl).kind === "SUPPORTED_YOUTUBE"` (`lib/server/assetImport/requestBoundary.ts:40`).

### B. Binary Video Acquisition Feasibility (The Critical Bottleneck)
- **Official TikTok APIs do NOT provide arbitrary video binary downloads.**
  - An exhaustive review of TikTok Developer Documentation (Content Posting API, Display/oEmbed API, Research API, Commercial Content API) establishes that TikTok does **not** expose an API to fetch the raw MP4 video stream from a user-supplied TikTok URL.
  - The TikTok Content Posting API is strictly for uploading/publishing videos to TikTok.
  - The TikTok Display API provides only oEmbed metadata and iframe embed code, not downloadable media binaries.
  - The TikTok Research API is restricted to approved academic researchers and does not provide bulk video file downloads.
- **Automated Web Scraping / Reverse Engineering:**
  - Tools like `yt-dlp` can technically attempt extraction, but doing so directly violates TikTok's Terms of Service (Section 5 prohibitions against scraping, data extraction, or automated harvesting without express written consent).
  - TikTok enforces aggressive anti-bot protections (Akamai Bot Manager, ByteDance edge defenses, signature challenges), leading to high failure rates and IP-level bans.
  - NEXCUT's explicit architectural and security policy (`docs/ACQUISITION_WORKER_ARCHITECTURE_V1.md`) strictly prohibits cookies, browser extraction, shared credentials, and unauthorized scraping.

### C. Downstream Clipping Pipeline Readiness
- **The existing Video Source Layer and Clipping Engine ARE ALREADY FULLY CAPABLE of processing TikTok videos once ingested.**
  - Ingestion produces a durable media record (`jobId`, `mediaId`) in PostgreSQL (`workflow.jobs` and `workflow.media`) and stores the canonical MP4 in Google Cloud Storage (`media/${jobId}/${mediaId}/input.mp4`).
  - Downstream engines (`/api/audio-energy`, `/api/transcript/durable`, `/api/ai-highlight`, `/api/cut`, `/api/multi-cut`) are completely agnostic to the original video provider. They operate purely on the durable MP4 asset using packaged FFmpeg.
  - NEXCUT already has a dedicated TikTok clip optimization profile (`lib/clipPlatform/profiles.ts:tiktok`) with 15–55s duration windows, hook weighting (0.22), and 9:16 vertical crop rendering (`app/api/multi-cut/route.ts:98`).

---

## 3. The First Missing Step
The exact first point of failure in the pipeline is **URL Classification** in `lib/urlAcquisition/classifyUrl.ts` (line 21), which rejects TikTok URLs with `{ kind: "UNSUPPORTED_URL" }`.
If that gate is bypassed, the immediate hard technical blocker is **Source Acquisition**: there is no lawful, officially supported API to fetch the video binary given only a TikTok URL.

---

## 4. Key Architectural Deliverables Summary

| Deliverable | Key Insight |
|---|---|
| `existing-pipeline-architecture.md` | Full trace from UI through CSRF, Idempotency, Cloud Storage, PostgreSQL, packaged FFmpeg, Gemini AI highlight, and ZIP packaging. |
| `tiktok-url-handling-audit.md` | Audits URL structures (`/@user/video/id`, `vm.tiktok.com`), snowflake video IDs, redirect requirements, and total absence of backend TikTok handling. |
| `acquisition-method-assessment.md` | Contrast of Official APIs vs User Uploads vs Scraping; proves official binary download does not exist. |
| `source-contract-integration.md` | Defines the exact additions needed for `CanonicalAssetImportSource`, DB check constraints, and `SourceAdapter`. |
| `implementation-gap-matrix.md` | 16-area gap matrix classifying each component (e.g. Ingestion/Rendering: VERIFIED_COMPLETE; Acquisition: BLOCKED). |
| `end-to-end-feasibility.md` | Step-by-step trace showing the first failure at Step 2/4. |
| `test-coverage-gap.md` | Maps existing tests and documents offline synthetic test strategy. |
| `implementation-roadmap.md` | 4-phase concrete roadmap with strict boundaries between code Jules can build and approvals required by the Product Owner. |

---

## 5. Final Recommendation and Status

**Final Status:** `BLOCKED_BY_EXTERNAL_REQUIREMENTS`
(For automated URL-to-MP4 binary downloading from public TikTok URLs)

**Alternative Recommended Path:**
Adopt a **User-Authorized / Direct Upload Handoff** model:
1. Provide a TikTok-aware UI in Creator Flow that accepts either:
   - Direct user upload of the TikTok MP4 file (fully supported today via `/api/media/admit`), OR
   - URL metadata ingestion (via TikTok oEmbed / Display API) paired with a user-uploaded MP4 asset.
2. If the Product Owner approves automated extraction via an isolated Cloud Run Acquisition Worker (as architected in `docs/ACQUISITION_WORKER_ARCHITECTURE_V1.md`), that worker must be isolated, versioned, and accept the legal and platform-rate-limit trade-offs.
