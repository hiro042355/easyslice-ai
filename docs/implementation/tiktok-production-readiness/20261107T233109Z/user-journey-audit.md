# User Journey Audit: TikTok URL-to-Clipping Pipeline

**Audit Timestamp:** `2026-11-07T23:31:09Z`
**Evaluator:** Jules (Software Engineer)
**Overall Status:** `PASS` (for URL recognition & authorized file handoff) / `NOT_APPLICABLE` (for automated raw video downloading due to platform restrictions)

---

## 1. End-to-End User Journey Walkthrough

```
[User Pastes TikTok URL]
        │
        ▼
[lib/urlAcquisition/classifyUrl.ts]
        │
        ├─ Short URL (vm.tiktok.com / vt.tiktok.com) ──► [resolveSafeTikTokRedirect] ──► Canonical Desktop URL
        │
        ▼
[lib/urlAcquisition/tiktokAcquisitionState.ts]
        │
        ▼
[UI Renders TikTok Guidance in app/workspace-flow/page.tsx]
        │  • Video ID: e.g. 7123456789012345678
        │  • Author: @creator
        │  • Clear notification: TikTok API does not provide MP4 binary download
        │  • Action: User provides authorized MP4 video file
        │
        ▼
[User Drops Authorized MP4 File into Dropzone]
        │
        ▼
[lib/client/durableMediaAdmission.ts (admitDurableMedia)]
        │
        ├── 1. POST /api/media/admit { action: "initiate", mime: "video/mp4", size }
        │      └── Server validates size <= 2GB, mime == "video/mp4", same origin, authenticated user.
        │      └── Server creates Resumable Upload URL to GCS (`media/${jobId}/${mediaId}/input.mp4`).
        │
        ├── 2. Direct PUT to GCS resumable upload URL
        │      └── Client streams video binary directly to Google Cloud Storage (bypasses Vercel payload limit).
        │
        └── 3. POST /api/media/admit { action: "finalize", jobId, mediaId }
               └── Server verifies GCS metadata (size match, owner UID match, jobId, mediaId).
               └── Inserts into PostgreSQL `workflow.jobs` and `workflow.media`.
        │
        ▼
[Handoff into Existing Clipping Pipeline]
        │
        ├── Duration Detection & Thumbnail Extraction (HTML5 video element / metadata)
        ├── Audio Energy Analysis (`POST /api/audio-energy`)
        ├── Durable Subtitle Transcription (`POST /api/transcript/durable`)
        ├── AI Highlight Ranking (`POST /api/ai-highlight` with targetPlatform: "tiktok")
        │      └── Applies TikTok profile (15s–55s duration window, 0.22 hook weight, vertical 9:16 priority)
        ├── Durable Multi-Cut Video Rendering (`POST /api/multi-cut`)
        │      └── Executes packaged FFmpeg with vertical 9:16 crop filter (`scale=720:1280,crop=720:1280`)
        └── ZIP Packaging & Client Download (`/api/exports/:exportId`)
```

---

## 2. Stage-by-Stage Transition Analysis

| Step | User Action / System Transition | Implementation Reference | Status | Audit Findings & Failure Modes |
|---|---|---|---|---|
| 1 | Pastes TikTok URL in `universalUrl` input | `app/workspace-flow/page.tsx:840` | PASS | Dynamic classification fires on input change without server roundtrip. |
| 2 | URL classification & normalization | `lib/urlAcquisition/classifyUrl.ts:80-128` | PASS | Canonicalizes `@user/video/:id` and `/v/:id.html`. Strips tracking queries (`?is_from_webapp=1`, `?_r=1`, UTM parameters). |
| 3 | Short redirect resolution | `lib/urlAcquisition/tiktokRedirect.ts:40-104` | PASS | Safe HEAD-only resolution, HTTPS-only, 3-hop max, strict hostname allowlist (`ALLOWED_REDIRECT_HOSTS`). Blocks SSRF. |
| 4 | Guidance display & capability notice | `lib/urlAcquisition/tiktokAcquisitionState.ts:16-41` | PASS | Explicitly informs user: "TikTok公式APIは動画MP4バイナリの自動取得を提供していません... お持ちの動画ファイル（MP4形式）を直接アップロードしてください". Eliminates ambiguity. |
| 5 | Authorized file selection | `app/workspace-flow/page.tsx:241-268, 968-984` | PASS | Drag-and-drop or file browser accepts `.mp4`. Rejects non-video files on client. |
| 6 | Durable Media Admission (`/api/media/admit`) | `app/api/media/admit/route.ts:25-96` | PASS | 3-step handshake: Initiate -> Direct GCS Upload -> Finalize. Atomic DB transaction registers `workflow.jobs` and `workflow.media`. |
| 7 | AI Highlight & Clipping | `app/workspace-flow/page.tsx:431-508` | PASS | Passes durable media reference. Selects platform profile `"tiktok"` with optimal hook weight (0.22) and duration (15–55s). |
| 8 | Multi-Cut & Vertical Export | `app/api/multi-cut/route.ts` & `lib/server/durableMultiCut.ts` | PASS | Renders vertical 9:16 crops with packaged FFmpeg. Generates downloadable export and ZIP archive. |

---

## 3. Discrepancies and Gap Identification

1. **Pre-Validation of Max File Size on Client:**
   - Server enforces `MAX_MEDIA_BYTES = 2 * 1024 * 1024 * 1024` (2GB).
   - In `lib/client/durableMediaAdmission.ts`, `file.size <= 0` is checked, but `file.size > MAX_MEDIA_BYTES` is only caught when the server returns 400.
   - *Remediation:* Hardened client check to proactively reject files exceeding 2GB with a descriptive message before initiating network requests.
2. **Clear Association of TikTok URL Context in Workspace State:**
   - Currently, pasting a TikTok URL renders guidance, and uploading an MP4 populates `video`, `durableMedia`, and clear messages.
   - The user journey is smooth, unambiguous, and safe.
