# Remaining External Approvals & Blockers

**Verification Timestamp:** `2026-11-08T04:50:22Z`
**Evaluator:** Jules (Software Engineer)
**Baseline:** `main` @ `d636ae79045cca888757bf897e969d5d485f6640`

---

## 1. External Approvals & Authorizations Required

Before enabling the TikTok URL-to-clipping pipeline in the live production environment, the following operational approvals and actions must be taken:

| Item | Responsible Party | Scope | Required Action |
|---|---|---|---|
| **Cloud SQL Migration V000009** | DBA / DevOps Lead | Production Cloud SQL | Execute `V000009__expand_asset_import_platform.sql` during a scheduled maintenance window. |
| **GCS Production Bucket Verification** | Cloud Platform Admin | GCP Storage | Confirm bucket lifecycle rule (7-day abort cleanup) and CORS headers for resumable uploads. |
| **Workload Identity Federation (WIF)** | Security / Platform Lead | GCP IAM & Vercel | Validate Vercel OIDC identity mapping to `google_service_account.media_runtime`. |
| **Production Environment Audit** | DevOps / Release Manager | Vercel Project Settings | Verify production environment variables (`GCS_BUCKET_NAME`, `FIREBASE_PROJECT_ID`, etc.) are configured. |
| **Staging End-to-End Smoke Test** | QA / Product Owner | Staging Web App | Perform user journey verification: paste TikTok URL, view guidance, upload MP4, verify clips and download ZIP. |

---

## 2. Blockers & Technical Boundaries

1. **Direct TikTok Video Scraping is Prohibited:**
   - TikTok Terms of Service and official API policies prohibit unauthorized direct media downloading.
   - The system is architected to require user-authorized MP4 uploads (`POST /api/media/admit`). This is an intentional architectural boundary, not an outstanding bug.

2. **Database Application Requires External Deployment:**
   - Sandboxes cannot and must not connect to live production databases.
   - The SQL script is thoroughly reviewed and verified backward-compatible, but remains `NOT_VERIFIED` in live Cloud SQL until executed.

3. **External Speech-to-Text / AI Model API Credentials:**
   - In accordance with safety policies, no paid third-party external AI APIs were accessed or billed during verification.
   - Speech transcription services in production must be verified against their respective staging API keys.
