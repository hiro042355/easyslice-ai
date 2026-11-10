# Security and Cost Risk Register: Staging Phase

**Document Timestamp:** `2026-11-08T05:50:00Z`
**Purpose:** Enumerate security, financial, and operational risks associated with staging validation, defining concrete mitigation controls and tripwires.

---

## 1. Risk Register Matrix

| Risk ID | Risk Description | Severity | Probability | Mitigation Strategy & Safeguards | Tripwire / Action Limit |
|---|---|---|---|---|---|
| **RISK-SEC-01** | Accidental connection to Production Cloud SQL or GCS | `CRITICAL` | `LOW` | Strict environment variable separation (`easyslice_staging` vs `easyslice_prod`); IP allowlists; dedicated IAM service accounts with zero production access. | Pre-flight script aborts if connection string contains `prod` or production IP. |
| **RISK-SEC-02** | TikTok Anti-Scraping / Account Blocking | `HIGH` | `MEDIUM` | Do **not** use scraping or automated headless browser download for TikTok video binaries. Adhere strictly to the MP4 file upload workflow. | Zero automated TikTok video binary requests issued to `tiktok.com`. |
| **RISK-SEC-03** | Malicious / Oversized Payload Injection (SSRF / DoS) | `HIGH` | `LOW` | Strict URL allowlist with max 3 hops in `tiktokRedirect.ts`. Client and server enforcement of 2 GiB ceiling and `video/mp4` MIME type. | Immediate 400 Bad Request if host not in allowlist or payload > 2GB. |
| **RISK-SEC-04** | Cross-Tenant Data Access in Staging | `MEDIUM` | `LOW` | Authoritative session checks in route handler verifying `ownerUid` matches authenticated Firebase token. GCS object prefix enforced. | Admission fails closed if `metadata.name` prefix does not match token UID. |
| **RISK-COST-01** | Uncontrolled GCS Storage Accumulation | `MEDIUM` | `MEDIUM` | GCS object lifecycle rule configured to purge objects automatically after 3 days. Server compensation cleans up aborts. | Staging bucket lifecycle rule: `Age >= 3 days` delete. Max staging bucket size: 50 GB. |
| **RISK-COST-02** | External Paid AI API Charges | `HIGH` | `LOW` | Core architecture uses packaged local FFmpeg 7.0.2. Strict repository rule prohibits external paid AI API calls (OpenAI, Gemini, etc.). | Zero paid AI API dependencies in code or lockfiles. |
| **RISK-COST-03** | Cloud SQL Staging Compute Runaway | `LOW` | `LOW` | Use minimum viable instance (`db-custom-1-3840` or shared core). Auto-shutdown or scale-down when not conducting active testing. | Staging monthly budget cap: $50 USD. Alerts at 50%, 80%, 100%. |

---

## 2. Forbidden Actions (Zero Tolerance)

The following actions are strictly prohibited without prior written Product Owner sign-off:
1. Exporting or running queries against production database instances.
2. Ingesting, downloading, or publishing to live TikTok creator accounts using unauthorized APIs.
3. Committing or logging live GCP service account keys, Firebase private keys, or staging database credentials.
4. Modifying host developer environment (`C:\Users\hirom\easyslice-ai`).
5. Disabling or modifying CORS / security headers on GCS buckets to bypass authorization checks.
