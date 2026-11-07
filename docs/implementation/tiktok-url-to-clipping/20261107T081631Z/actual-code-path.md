# Actual Code Path Trace: TikTok URL Entry to Clipped Video Export

**PR:** #5
**Timestamp:** `2026-11-07T09:00:00Z`

---

## 1. End-to-End Code Path Trace

```
Step 1: TikTok URL Input
   └─ File: app/workspace-flow/page.tsx (lines 178-192, 840-880)
   └─ Function: WorkspaceFlowPage()
   └─ Action: User inputs TikTok URL into Universal URL Import text field.

Step 2: URL Classification & Metadata Parsing
   └─ File: lib/urlAcquisition/classifyUrl.ts (lines 48-96)
   └─ Function: classifyUrl()
   └─ Action: Identifies TikTok hostname, validates 18-19 digit snowflake ID, parses author username, strips query params, returns `SUPPORTED_TIKTOK`.

Step 3: Acquisition Boundary Assessment & User Guidance
   └─ File: lib/urlAcquisition/tiktokAcquisitionState.ts (lines 16-36)
   └─ Function: evaluateTikTokAcquisitionGuidance()
   └─ Action: Returns guidance explaining why TikTok APIs do not provide video MP4 downloads and directs the user to supply an authorized MP4 file.
   └─ File: app/workspace-flow/page.tsx (lines 845-890)
   └─ Action: Displays canonical URL, video ID, and instructions in UI.

Step 4: User-Provided Video File Upload
   └─ File: app/workspace-flow/page.tsx (lines 200-245)
   └─ Function: handleVideoUpload() / handleVideoDrop()
   └─ File: lib/client/durableMediaAdmission.ts (lines 62-85)
   └─ Function: admitDurableMedia()
   └─ Action: Initiates resumable upload with `/api/media/admit`, streams MP4 to Google Cloud Storage bucket, and finalizes registration.

Step 5: Durable Media Registration & Database Persistence
   └─ File: app/api/media/admit/route.ts (lines 35-95)
   └─ Function: POST()
   └─ File: lib/server/durableMediaOwnership/repository.ts (lines 29-50)
   └─ Function: createJobWithId() and createMediaWithId()
   └─ Action: Commits transaction in PostgreSQL `workflow.jobs` and `workflow.media`, returning `{ jobId, mediaId }`.

Step 6: Analysis & Transcription Handoff
   └─ File: app/workspace-flow/page.tsx (lines 330-410)
   └─ Function: handleAnalyze()
   └─ Endpoint A: POST /api/audio-energy (FFmpeg volume analysis on GCS asset)
   └─ Endpoint B: POST /api/transcript/durable (FFmpeg audio extraction -> transcript)
   └─ Endpoint C: POST /api/ai-highlight (Scored highlights based on transcript)

Step 7: Platform Profile & Clip Candidate Optimization
   └─ File: lib/clipPlatform/profiles.ts (lines 8)
   └─ Profile: CLIP_PLATFORM_PROFILES_V1.tiktok
   └─ Action: Enforces 15–55s duration policy (25s preferred) and 0.22 hook weighting.

Step 8: Video Cutting & Multi-Cut Rendering
   └─ File: app/api/cut/route.ts (lines 33-85) or app/api/multi-cut/route.ts (lines 55-125)
   └─ Action: Spawns packaged FFmpeg (`resolvePackagedFfmpeg()`) using scale and crop filter `scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280` for vertical 9:16 video.

Step 9: Packaging & Client Export
   └─ File: app/api/multi-cut/route.ts (lines 90-120)
   └─ Action: AdmZip bundles rendered MP4 clips into `clips.zip`.
   └─ File: lib/reviewQueue.ts (lines 50-70)
   └─ Action: Registers export item in review queue for creator review and posting.
```
