# User-File Fallback Behavior

**Timestamp:** `2026-11-07T08:16:31Z`

---

## 1. User Journey Flow
1. **URL Entry:**
   - User pastes a TikTok video URL into the Universal URL Import text field in `app/workspace-flow/page.tsx`.
2. **Recognition & Metadata Presentation:**
   - `classifyUrl()` validates the URL and extracts `videoId` and `authorUsername`.
   - `evaluateTikTokAcquisitionGuidance()` renders an informative card displaying the canonical URL, Video ID, and author name.
3. **Explicit Fallback Explanation:**
   - The UI presents a clear explanation:
     *"TikTok公式APIは動画MP4バイナリの自動取得を提供していません。また、利用規約（第5条）およびクリエイターの権利保護に基づき、無断スクレイピングや自動ダウンロードは行いません。お持ちの動画ファイル（MP4形式）を直接アップロードしてください。"*
4. **Direct Media Admission:**
   - User drops their authorized TikTok MP4 file onto the upload dropzone.
   - `handleVideoUpload()` calls `admitDurableMedia(file)` (`lib/client/durableMediaAdmission.ts`).
   - Browser sends `initiate` request to `/api/media/admit`, streams file to Google Cloud Storage resumable upload URL, and completes `finalize` request.
5. **Durable Handoff:**
   - The asset is registered in PostgreSQL `workflow.jobs` and `workflow.media`.
   - Client receives `{ jobId, mediaId }`.
   - The video is immediately available for downstream processing.
