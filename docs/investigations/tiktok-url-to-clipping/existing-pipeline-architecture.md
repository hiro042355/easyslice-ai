# Existing Pipeline Architecture: NEXCUT AI Video Clipping

**Repository:** `C:\Users\hirom\easyslice-ai`
**Investigation Date:** 2026-11-07
**Scope:** Complete call chain from user entry to exported clips

---

## 1. High-Level Pipeline Flowchart

```
[ User Input (Workspace Flow / Classic UI) ]
                     │
                     ▼
[ URL Classification: classifyUrl() (lib/urlAcquisition/classifyUrl.ts) ]
                     │
                     ▼
[ Production Asset Import: POST /api/v1/assets/import (CSRF + Idempotency) ]
                     │
                     ▼
[ Direct YouTube / Source Importer (lib/server/assetImport/directYouTubeImporter.ts) ]
                     │
                     ├──> Packaged yt-dlp / Runtime (lib/server/packagedYtDlp.ts)
                     ├──> Video Inspection: inspectIngestedVideo (packaged FFmpeg)
                     ├──> GCS Upload: media/${jobId}/${mediaId}/input.mp4
                     └──> PostgreSQL: workflow.jobs & workflow.media (Owned Media)
                                         │
 ┌───────────────────────────────────────┴───────────────────────────────────────┐
 │                                                                               │
 ▼                                                                               ▼
[ Audio Energy Analysis ]                                       [ Durable AI Transcription ]
POST /api/audio-energy                                          POST /api/transcript/durable
FFmpeg volume analysis                                           FFmpeg audio extract -> Gemini
 │                                                                               │
 └───────────────────────────────────────┬───────────────────────────────────────┘
                                         │
                                         ▼
                       [ Clip Candidate Generation & Ranking ]
                       - lib/clipBoundary.ts
                       - lib/clipCandidates/
                       - lib/clipPlatform/ (profiles.ts: "tiktok", "youtube-shorts")
                                         │
                                         ▼
                       [ Video Cutting & Subtitle Rendering ]
                       - POST /api/cut (single clip MP4 + camera filters)
                       - POST /api/burn-subtitle (hardcoded subtitles)
                       - POST /api/multi-cut (batch 9:16 vertical / original crops)
                                         │
                                         ▼
                       [ ZIP Packaging & Review Queue ]
                       - AdmZip packaging in /api/multi-cut
                       - lib/reviewQueue.ts (ReviewQueueItem)
                       - Client-side download
```

---

## 2. Detailed Step-by-Step Architecture Trace

### Step 1: User Input and Product Entry Point
- **Files:** `app/workspace-flow/page.tsx`, `app/page.tsx`
- **Functionality:**
  - Modern flow: `app/workspace-flow/page.tsx` provides Step 1 (Upload/Import).
  - Offers a "Universal URL Import" text box that executes `detectUrlSource(universalUrl)` (`lib/urlImport.ts`).
  - Offers a YouTube URL text box that calls `handleFetchYoutube()`.
  - Also offers direct drag-and-drop file upload calling `handleVideoUpload()` which connects to `/api/media/admit`.
- **Status:** VERIFIED COMPLETE for YouTube & File Upload; TikTok shows informational UI label only.

### Step 2: Video URL Validation and Source Classification
- **Files:** `lib/urlAcquisition/classifyUrl.ts`, `lib/urlImport.ts`
- **Contracts & Types:**
  - `classifyUrl(input: unknown): UrlClassification` (`lib/urlAcquisition/types.ts`)
  - Output union: `SupportedYouTubeUrl | { kind: "UNSUPPORTED_YOUTUBE" } | { kind: "UNSUPPORTED_URL" } | { kind: "INVALID_INPUT" }`
- **Behavior:**
  - Checks maximum length (2048 chars), protocols (`http:`, `https:`), hostname allowlist (`AUTHORIZED_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}`).
  - Validates 11-character video ID regex (`/^[A-Za-z0-9_-]{11}$/`).
  - Rejects URLs with playlist query params (`list`).
- **Tests:** `tests/urlAcquisition/classifyUrl.test.ts` (8 passing unit tests).
- **Status:** VERIFIED COMPLETE for YouTube; Rejects TikTok as `UNSUPPORTED_URL`.

### Step 3: Source Acquisition and Download Mechanism
- **Files:** `app/api/v1/assets/import/route.ts`, `lib/server/assetImport/directYouTubeImporter.ts`, `lib/server/packagedYtDlp.ts`
- **Contracts & Security:**
  - Requires session authentication (`requireAuthenticatedRequest`).
  - Requires same-origin POST (`validateSameOriginMutation`).
  - Requires valid CSRF token (`validateAssetImportCsrf`).
  - Requires bounded `Idempotency-Key` header (`/^[A-Za-z0-9._~-]{1,128}$/`).
  - Claims idempotency row in `workflow.asset_import_requests` using framed SHA-256 fingerprint.
- **Acquisition Execution:**
  - Verifies pinned yt-dlp version (`2026.03.13`).
  - Spawns packaged yt-dlp to download MP4 into isolated temporary workspace directory (`/tmp/nexcut-jobs/<jobId>/input/youtube-source.mp4`).
- **Tests:** `tests/urlAcquisition/productionAssetImportCommand.test.ts`.
- **Status:** VERIFIED COMPLETE for YouTube.

### Step 4: Video Metadata Extraction & Validation
- **Files:** `lib/server/youtubeIngestion.ts`, `lib/server/acquisitionWorker/mediaValidation.ts`
- **Behavior:**
  - Invokes packaged FFmpeg (`resolvePackagedFfmpeg()` in `lib/server/packagedFfmpeg.ts`).
  - Calls `inspectIngestedVideo(executable, mediaPath)`.
  - Runs FFprobe / FFmpeg parse: extracts duration, width, height, video stream presence, codec (`libx264` / `h264`).
  - Enforces positive duration, file existence, and size constraints (< 2 GiB, <= 240 seconds for acquisition worker policy).
- **Status:** VERIFIED COMPLETE.

### Step 5: Video Source Layer Registration & Durable Ownership
- **Files:** `lib/server/durableMediaOwnership/repository.ts`, `lib/server/durableMediaOwnership/storageKey.ts`
- **Database Tables:**
  - `workflow.jobs` (`id` UUID, `owner_uid` text, `created_at`, `updated_at`)
  - `workflow.media` (`id` UUID, `job_id` UUID, `owner_uid` text, `purpose` 'input', `mime_type` 'video/mp4', `storage_key` text)
- **Object Storage:**
  - Streams local MP4 to Google Cloud Storage bucket (`media/${jobId}/${mediaId}/input.mp4`).
  - Commits PostgreSQL transaction registering job and media.
  - Updates `workflow.asset_import_requests` to state `'succeeded'` with `job_id`, `media_id`, and `duration_seconds`.
- **Status:** VERIFIED COMPLETE.

### Step 6: Ingestion and Job Handoff to Workspace
- **Files:** `app/workspace-flow/page.tsx:300`
- **Behavior:**
  - Response payload returns: `{ status: "succeeded", jobId, mediaId, durationSeconds, source }`.
  - Client state receives `durableMedia: { jobId, mediaId }`.
  - Video element source is set to `/api/media/${jobId}/${mediaId}`.
- **Status:** VERIFIED COMPLETE.

### Step 7: Analysis and Transcription
- **Files:** `app/api/audio-energy/route.ts`, `app/api/transcript/durable/route.ts`, `app/api/ai-highlight/route.ts`
- **Behavior:**
  - **Option A (Audio Energy):** Calls `/api/audio-energy` with `{ jobId, mediaId }`. Downloads GCS asset to isolated temp folder, runs packaged FFmpeg with `-af ebur128` / `-af volumedetect`, and computes energy peaks across timeline.
  - **Option B (Durable Transcript):** Calls `/api/transcript/durable` with `{ jobId, mediaId }`. FFmpeg extracts audio track to WAV/MP3, sends to Gemini API (`GeminiTranscriptProvider`), and returns timestamped subtitles.
  - **Option C (Subtitle AI Highlight):** Sends timestamped subtitles to `/api/ai-highlight`, which uses Gemini with prompt: *"あなたはYouTube ShortsとTikTok向けの動画編集AIです"* to score and identify high-retention segments.
- **Status:** VERIFIED COMPLETE.

### Step 8: Clip Candidate Generation and Selection
- **Files:** `lib/clipCandidates/`, `lib/clipBoundary.ts`, `lib/clipRanking/`, `lib/clipPlatform/`
- **Behavior:**
  - `decideCanonicalClipBoundary()` optimizes start and end timestamps based on speech boundaries, sentence pauses, or audio energy troughs.
  - `lib/clipPlatform/profiles.ts` contains platform-specific weighting:
    - Target `"tiktok"`: duration policy (min: 15s, preferred: 25s, max: 55s), hook weight (0.22), story completeness (0.19), standalone value (0.15).
    - Target `"youtube-shorts"`: duration policy (min: 20s, preferred: 45s, max: 58s), hook weight (0.18), story completeness (0.28).
  - `portfolioSelector.ts` selects non-overlapping top-performing clips.
- **Tests:** `tests/clipPlatform/platformAwareOptimization.test.ts`.
- **Status:** VERIFIED COMPLETE.

### Step 9: Video Cutting and Rendering
- **Files:** `app/api/cut/route.ts`, `app/api/multi-cut/route.ts`
- **Behavior:**
  - **Single Clip:** `POST /api/cut` takes `jobId`, `mediaId`, `start`, `end`, and optional camera pan/zoom instructions (`buildCameraFfmpegFilter`). Spawns packaged FFmpeg to render clip.
  - **Batch Multi-Cut:** `POST /api/multi-cut` accepts `{ jobId, mediaId, clips: [...] , outputFormat: "shorts" | "original" }`.
    - If `outputFormat === "shorts"`, applies FFmpeg filter `scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280` with `-c:v libx264 -preset ultrafast -crf 21 -c:a aac -b:a 128k`.
    - If `outputFormat === "original"`, applies stream copy (`-c copy`).
- **Tests:** `tests/productionIdentity/durableMultiCut.test.ts`, `tests/productionIdentity/durableCutOwnership.test.ts`.
- **Status:** VERIFIED COMPLETE.

### Step 10: Subtitle Generation & Burning
- **Files:** `app/api/burn-subtitle/route.ts`, `lib/server/durableSubtitleBurn.ts`
- **Behavior:**
  - Downloads source video and generates ASS/SRT subtitle filter.
  - Burns styled subtitles onto the video stream using FFmpeg `subtitles` filter with font and layout styling.
- **Status:** VERIFIED COMPLETE.

### Step 11: Export, Packaging, and Review Queue
- **Files:** `app/api/multi-cut/route.ts`, `lib/reviewQueue.ts`
- **Behavior:**
  - `POST /api/multi-cut` packs rendered MP4 clips into an in-memory ZIP via `AdmZip` (`createMultiCutZipEntryName`).
  - Returns `application/zip` stream with `Content-Disposition: attachment; filename=clips.zip`.
  - Adds clip entry to `lib/reviewQueue.ts` with metadata (title, hashtags, posting time, platform target: "tiktok" | "youtube" | "instagram").
- **Status:** VERIFIED COMPLETE.
