# Authorized MP4 Upload Handoff Verification Report

**Verification Timestamp:** `2026-11-07T13:55:00Z`
**Evaluator:** Jules (Software Engineer)

---

## 1. Acquisition Policy & User Guidance

Direct automated binary downloading of TikTok videos is deliberately disallowed due to:
1. **TikTok Official API Policies:** Official TikTok for Developers APIs (Display API, Research API, Content Posting API) do not offer automated programmatic video downloading from arbitrary URLs.
2. **TikTok Terms of Service (Section 5):** Prohibits scraping, data extraction, or automated downloading without prior written consent.
3. **NEXCUT Security Architecture:** Enforces compliance and protects platform and user integrity.

When a user provides a TikTok URL, the system evaluates the state via `evaluateTikTokAcquisitionGuidance` (`lib/urlAcquisition/tiktokAcquisitionState.ts`):
- Capability: `url_recognized_binary_restricted`
- Guidance Title: `TikTok動画URLを認識しました`
- Explanation: Informs user that automated binary download is not provided by official APIs and explains terms.
- Action Required: Prompts user to supply an authorized MP4 video file.
- File Accept constraint: `video/mp4`
- `isAutomatedDownloadAvailable: false`

## 2. Authorized MP4 Upload Route (`/api/media/admit`)

The file submission path utilizes `/api/media/admit`:
1. **Initiate Phase (`action: "initiate"`):**
   - Requires authenticated session (`requireAuthenticatedRequest`).
   - Requires same-origin request (`validateSameOriginMutation`).
   - Enforces `mime === "video/mp4"` and size up to 2GB (`MAX_MEDIA_BYTES`).
   - Generates unique `jobId` (UUID) and `mediaId` (UUID).
   - Creates resumable GCS upload session with metadata headers (`nexcutOwnerUid`, `nexcutJobId`, `nexcutMediaId`, `nexcutExpectedSize`).
2. **Upload Execution:**
   - Direct upload from client to Google Cloud Storage via resumable URL.
3. **Finalize Phase (`action: "finalize"`):**
   - Validates uploaded object size and contentType against expected metadata.
   - Durably commits records to PostgreSQL tables `workflow.jobs` and `workflow.media`.
   - Returns `{ jobId, mediaId }` to UI for subsequent clipping steps.

## 3. Metadata & Fingerprint Continuity

In `tests/urlAcquisition/tiktokPipelineHandoff.test.ts`:
- Canonical import source format:
  ```json
  {
    "platform": "tiktok",
    "videoId": "7123456789012345678",
    "normalizedUrl": "https://www.tiktok.com/@creator/video/7123456789012345678",
    "authorUsername": "creator"
  }
  ```
- Deterministic 32-byte sha256 fingerprint generated via `createAssetImportFingerprint`.
- Verified compatibility with PostgreSQL check constraint `ck_asset_import_authority` (`platform IN ('youtube', 'tiktok')`).
- Suite Result: PASS (3/3 tests passed, exit code 0).
- Raw Log Reference: `raw-test-logs/tiktok-pipeline-handoff.log`.
