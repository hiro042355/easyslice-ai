# Product Owner Action Checklist

**Audit Timestamp:** `2026-11-07T23:31:09Z`
**Evaluator:** Jules (Software Engineer)

---

## Pre-Release Actions for Product Owner & Release Team

- [ ] **Policy & Copy Review:**
  - Verify and approve Japanese copy in `app/workspace-flow/page.tsx` and `lib/urlAcquisition/tiktokAcquisitionState.ts`:
    - "TikTok動画URLを認識しました"
    - "TikTok公式APIは動画MP4バイナリの自動取得を提供していません..."
    - "お持ちの動画ファイル（MP4形式）を直接アップロードしてください。"

- [ ] **Database Migration Sign-Off:**
  - Authorize application of `db/workflow/migrations/V000009__expand_asset_import_platform.sql` to Cloud SQL production instance `nexcut-prod-postgresql`.

- [ ] **Cloud Infrastructure & Storage Validation:**
  - Confirm GCS production bucket (`MEDIA_BUCKET_NAME`) is provisioned with 7-day lifecycle rules and WIF IAM permissions.
  - Confirm Cloud SQL PostgreSQL 18 instance user (`POSTGRES_IAM_USER`) has migration and runtime privileges.

- [ ] **External API Dependencies:**
  - Verify Whisper/STT API key and quota for subtitle transcription in production.

- [ ] **Staging Smoke Test:**
  - Perform one full end-to-end smoke test on staging: Paste real TikTok URL -> Verify guidance -> Drop authorized MP4 -> Observe highlight generation and 9:16 export.

- [ ] **Production Deployment Go-Ahead:**
  - Authorize deployment of PR to production environment.
