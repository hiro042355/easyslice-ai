# Remaining Blockers

**Verification Timestamp:** `2026-11-07T13:55:00Z`
**Evaluator:** Jules (Software Engineer)

---

## 1. External & Platform Blockers

1. **Official TikTok Video Binary API Limitation:**
   - **Nature:** Permanent third-party platform limitation.
   - **Detail:** TikTok does not provide an open public API for downloading source MP4 video streams from arbitrary URLs.
   - **Impact:** Automated binary downloading cannot be enabled without violating TikTok Developer policies and Terms of Service.
   - **Mitigation:** The application provides acquisition guidance requiring users to provide an authorized MP4 video file.

2. **Google Cloud Storage (GCS) and Production PostgreSQL Dependencies:**
   - **Nature:** Infrastructure credentials and cloud resource access.
   - **Detail:** Real execution of `/api/media/admit` and `/api/v1/assets/import` against cloud storage and PostgreSQL requires valid runtime credentials (`GOOGLE_APPLICATION_CREDENTIALS`, Cloud SQL connection string).
   - **Local Status:** Verified via contract, mock, and schema tests; real cloud environment not invoked in local sandbox.

3. **External Transcription Provider:**
   - **Nature:** Speech-to-text API or local compute requirement.
   - **Detail:** Production speech-to-text requires credentials for Whisper API or local compute resources. Synthetic transcripts were used for local pipeline verification.

## 2. Non-Blockers (Resolved or Documented)

- Repository build succeeds (`next build` completes with 58 static and dynamic routes).
- Packaged FFmpeg binary is verified and capable of 9:16 vertical rendering.
- All URL classification, redirect security, and clipping portfolio optimization tests pass.
