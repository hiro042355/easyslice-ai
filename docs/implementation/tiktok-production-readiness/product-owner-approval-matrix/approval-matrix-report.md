# Product Owner Approval Matrix & Staging Execution Gate Review
## Phase 2.13: Controlled Staging Preparation

**Document Timestamp:** `2026-11-08T06:40:00Z`
**Auditor & Architect:** Jules (Software Engineer)
**Investigation Baseline Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869` (`origin/main`)
**Evaluation Scope:** Operational Groups A–D, Migration V000009, GCS Resumable Admission, Firebase Identity, Whisper Quota Safeguards, and Stop Conditions.

---

## 1. Executive Summary

### Current Readiness State
- **Branch & Commit:** `origin/main` @ `e8338e8b7dcd731dc9b494204e16749fc4918869`.
- **Merge State:** PR #8 merged cleanly into `main` with verified parents `d636ae7` (PR #7) and `681239d` (PR #8).
- **Independent Audit Verdict:** `STAGING_PLAN_APPROVED_FOR_PO_REVIEW`. This verdict explicitly approves the readiness plan for Product Owner review only; it is **NOT** authorization to execute staging or production operations.

### What Has Been Verified (Offline & Code Boundary)
- **URL Classification & SSRF Defense:** Canonical parsing and strict SSRF redirect guard (max 3 hops, approved hostnames, HTTPS-only) in `classifyTikTokUrl.ts` and `tiktokRedirect.ts`.
- **Authorized MP4 Upload Guidance:** Contract-level handoff in `tiktokPipelineHandoff.ts` directing users to upload authorized MP4 files rather than attempting unauthorized direct scraping.
- **Client & Server 2GB & MIME Validation:** Enforced both on client (`durableMediaAdmission.ts`) and server (`app/api/media/admit/route.ts`).
- **Clipping Optimization:** TikTok profile with 15–55s duration window and vertical crop weighting in `platformAwareOptimization.ts`.
- **Packaging & Materialization:** Packaged FFmpeg 7.0.2 binary materialized and operational offline.
- **Offline Regression Suite:** 40/40 tests passing with exit code 0, 0 skipped, and 0 failures.

### What Remains Unverified (Live External State)
- **Staging Cloud SQL Migration:** Migration `V000009__expand_asset_import_platform.sql` has not been applied to live Cloud SQL.
- **Live GCS Resumable Upload Streaming:** Signed session creation and binary chunk streaming to a live Google Cloud Storage bucket.
- **Staging Firebase Authentication:** Route-level authentication token verification with live Firebase Admin SDK.
- **End-to-End Staging User Journey:** Live pipeline execution from URL submission to vertical clip export.

### What Is Explicitly Not Approved
- Any connection to or operation against production Cloud SQL or production GCS buckets.
- Any live scraping, headless browser crawling, or unauthorized OAuth/Graph API calls to `tiktok.com`.
- Any consumption of external paid AI APIs (e.g. OpenAI Whisper API, Gemini, Anthropic).
- Deploying preview branches to production Vercel environments.

---

## 2. Group A–D Approval Matrix

Every operational action across Groups A–D is evaluated across the 10 required operational dimensions and classified into one of the mandatory approval categories:
- `SAFE_DOCUMENTATION_ONLY`
- `SAFE_LOCAL_OFFLINE`
- `REQUIRES_PO_APPROVAL`
- `REQUIRES_EXTERNAL_ACCOUNT_OWNER_APPROVAL`
- `BLOCKED_PENDING_DEPENDENCY`
- `NOT_VERIFIED`

| ID | Operational Action & Scope | Resource / Target | Nature of Change | Prereqs & Dependencies | Required Credentials / Roles | Cost Impact | Rollback / Recovery Method | Required Verification Evidence | Mandatory Classification |
|---|---|---|---|---|---|---|---|---|---|
| **ACT-A1** | Author Staging Readiness & Approval Documentation | Local Repo (`docs/...`) | Local Docs Only; no state change | Git clone; merged `main` baseline | Local git write access | $0.00 | `git restore` | Merged markdown & JSON files in repo | `SAFE_DOCUMENTATION_ONLY` |
| **ACT-A2** | Synthesize Local Test Media (10MB, 2GB boundary MP4) | Local Dev Environment | Local Filesystem Only; creates temporary test files | Packaged FFmpeg 7.0.2 binary | Local CLI execution permissions | $0.00 | Delete local temp MP4 files | `ls -la` verifying exact byte boundaries | `SAFE_LOCAL_OFFLINE` |
| **ACT-A3** | Run 40-Test Offline Regression Suite | Local Dev Environment | Memory / CPU execution; no state change | `npm ci` dependencies installed | Local Node.js runtime access | $0.00 | N/A | TAP log showing 40/40 PASS, exit code 0 | `SAFE_LOCAL_OFFLINE` |
| **ACT-B1** | Authorize Staging Cloud SQL Migration `V000009` | GCP Staging Cloud SQL (`easyslice_staging`) | Schema DDL change: modifies check constraint | Backup verified; staging instance idle | Product Owner approval signature | $0.00 (within Cloud SQL instance) | Transactional rollback script `U000009` | Signed PO approval artifact | `REQUIRES_PO_APPROVAL` |
| **ACT-B2** | Authorize Staging GCS Bucket Provisioning | GCP Staging Project (`easyslice-staging`) | Infrastructure: provisions GCS bucket & lifecycle rule | GCP staging project billing account active | Product Owner approval signature | < $5.00/mo (Standard GCS, 3-day purge) | `gcloud storage rm --recursive` | Signed PO approval artifact | `REQUIRES_PO_APPROVAL` |
| **ACT-B3** | Authorize Staging Test User Accounts | Staging Firebase Auth Project | Security State: creates test user identity | Staging Firebase tenant active | Product Owner approval signature | $0.00 (Firebase free tier) | Delete test user UID in Firebase console | Signed PO approval artifact | `REQUIRES_PO_APPROVAL` |
| **ACT-B4** | Authorize Staging Smoke Test Execution Window | Staging Web / API Runtime | System State: creates staging jobs and media rows | Approvals B1, B2, B3 granted | Product Owner approval signature | Negligible (< $1.00 compute/egress) | Purge test database rows and GCS objects | Signed PO approval artifact | `REQUIRES_PO_APPROVAL` |
| **ACT-C1** | Apply Migration `V000009` to Staging Cloud SQL | Staging Cloud SQL Instance | Schema DDL mutation (`ALTER TABLE ...`) | Approval B1; Cloud SQL Auth Proxy active | `roles/cloudsql.client` + staging DB user credentials | $0.00 incremental | Execute `U000009__revert_expand_asset_import_platform.sql` | `psql` query confirming constraint definition | `BLOCKED_PENDING_DEPENDENCY` |
| **ACT-C2** | Configure Staging GCS Bucket CORS & 3-Day Lifecycle | Staging GCS Bucket (`easyslice-staging-media-artifacts`) | Bucket metadata configuration | Approval B2; GCP project owner access | `roles/storage.admin` on staging project | < $5.00/mo | Update bucket lifecycle JSON | `gcloud storage buckets describe` JSON log | `BLOCKED_PENDING_DEPENDENCY` |
| **ACT-C3** | Deploy Staging Preview to Vercel Staging Environment | Vercel Staging Project | Deployment configuration & serverless function deploy | Approvals B1–B4; Vercel account access | Vercel Deployment Token + Staging Env Secrets | Included in Vercel Pro/Team plan | Rollback to prior staging deployment in Vercel | Vercel deployment URL & successful healthcheck | `BLOCKED_PENDING_DEPENDENCY` |
| **ACT-C4** | Execute Staging E2E Resumable Upload Test | Staging Runtime & GCS | Storage & Database: stores 10MB test MP4 and DB row | Acts C1, C2, C3 complete; test user credentials | Staging Firebase test user session cookie | < $0.01 | Automatic 3-day GCS purge; manual row delete | GCS metadata inspection & Cloud SQL row verification | `BLOCKED_PENDING_DEPENDENCY` |
| **ACT-C5** | Configure Staging Service Account & WIF Bindings | GCP IAM (`easyslice-staging.iam.gserviceaccount.com`) | IAM Policy: binds restricted storage role to SA | Approval B2; GCP IAM Admin access | `roles/resourcemanager.projectIamAdmin` | $0.00 | Revoke IAM role binding | `gcloud projects get-iam-policy` output | `BLOCKED_PENDING_DEPENDENCY` |
| **ACT-D1** | Connect to or Modify Production Cloud SQL | Production Database (`easyslice_prod`) | Prohibited State Mutation | Formal Production Release Sign-Off | Production DB Credentials | High risk | Database restoration from Cloud SQL snapshot | None (Forbidden) | `NOT_VERIFIED` |
| **ACT-D2** | Upload, Read, or Delete in Production GCS Buckets | Production GCS Bucket | Prohibited Storage Mutation | Formal Production Release Sign-Off | Production Storage Admin | High risk | Storage versioning restoration | None (Forbidden) | `NOT_VERIFIED` |
| **ACT-D3** | Automated Live TikTok Scraping / Direct Binary Download | External TikTok Infrastructure | Prohibited Third-Party Terms Violation | Formal TikTok API Commercial Agreement | N/A | Legal / IP Blacklist risk | Cease requests immediately | None (Forbidden) | `NOT_VERIFIED` |
| **ACT-D4** | External Paid AI API Consumption (Whisper / Speech-to-Text) | Paid Third-Party AI APIs (OpenAI, Gemini) | Billing / Quota Consumption | Product Owner Budget & Architecture Sign-Off | External API Keys | Variable paid API charges | Revoke API key | None (Forbidden) | `NOT_VERIFIED` |

---

## 3. Dependency Map

The staging execution path enforces a strict directed acyclic graph (DAG). No dependent action may commence until its parent nodes have produced verified evidence:

```text
========================================================================================
LEVEL 1: LOCAL & DOCUMENTATION BASELINE (COMPLETED)
----------------------------------------------------------------------------------------
[ ACT-A1: Staging Docs ] ──────┐
[ ACT-A2: Test MP4 Prep ] ─────┼──► [ Milestone 1: Local Integrity Verified (40/40 PASS) ]
[ ACT-A3: Offline Tests ] ─────┘
                                                      │
                                                      ▼
========================================================================================
LEVEL 2: PRODUCT OWNER GO/NO-GO DECISIONS (PENDING PRODUCT OWNER REVIEW)
----------------------------------------------------------------------------------------
                                          [ Decision PO-01: Cloud SQL DDL Window ]
                                          [ Decision PO-02: Staging GCS Provisioning ]
                                          [ Decision PO-03: Staging IAM Service Account ]
                                          [ Decision PO-04: Staging Test Account ]
                                          [ Decision PO-05: Controlled Test Window ]
                                                      │
                                                      ▼ (All 5 Decisions Approved)
========================================================================================
LEVEL 3: STAGING INFRASTRUCTURE CONFIGURATION (GROUP C - BLOCKED PENDING PO APPROVAL)
----------------------------------------------------------------------------------------
     ┌────────────────────────────────────────────────┼──────────────────────────────┐
     ▼                                                ▼                              ▼
[ ACT-C1: Apply V000009 ]                  [ ACT-C2: Configure GCS ]     [ ACT-C5: WIF / IAM Roles ]
(Cloud SQL Proxy DDL)                     (CORS & 3-Day Lifecycle)      (Least-Privilege Bindings)
     │                                                │                              │
     └────────────────────────────────────────────────┼──────────────────────────────┘
                                                      │
                                                      ▼
========================================================================================
LEVEL 4: RUNTIME DEPLOYMENT & VERIFICATION (GROUP C - BLOCKED PENDING LEVEL 3)
----------------------------------------------------------------------------------------
                                   [ ACT-C3: Vercel Staging Deploy ]
                                   (Configured with Staging Secrets Only)
                                                      │
                                                      ▼
                                   [ ACT-C4: Staging E2E Resumable Upload ]
                                   (10MB MP4 Upload -> Vertical Clip -> Export)
                                                      │
                                                      ▼
========================================================================================
LEVEL 5: PRODUCTION RELEASE GATING (GROUP D - STRICTLY PROHIBITED AT THIS PHASE)
----------------------------------------------------------------------------------------
[ ACT-D1: Prod DB ]   [ ACT-D2: Prod GCS ]   [ ACT-D3: Scraping ]   [ ACT-D4: Paid AI APIs ]
                      (ALL REMAIN BLOCKED & PROHIBITED)
========================================================================================
```

---

## 4. Product Owner Independent Decision List

Each decision requires independent Product Owner review and explicit sign-off:

1. **Decision PO-01 (Staging Database Migration V000009):**
   - *Scope:* Authorize applying `V000009__expand_asset_import_platform.sql` to staging database `easyslice_staging`.
   - *Impact:* Alters `ck_asset_import_authority` check constraint to allow `platform IN ('youtube', 'tiktok')`. Purely additive DDL. Lock duration < 100ms.
   - *Determination:* `[ ] APPROVED   [ ] REJECTED   [ ] DEFERRED`

2. **Decision PO-02 (Staging GCS Bucket Creation):**
   - *Scope:* Authorize creation of staging bucket `easyslice-staging-media-artifacts` in region `asia-northeast1`.
   - *Impact:* Enforces 3-day deletion lifecycle rule. Estimated monthly cost < $5.00 USD.
   - *Determination:* `[ ] APPROVED   [ ] REJECTED   [ ] DEFERRED`

3. **Decision PO-03 (Staging Service Account IAM):**
   - *Scope:* Authorize binding `roles/storage.objectAdmin` restricted strictly to `easyslice-staging-media-artifacts` for `easyslice-staging-app-sa`.
   - *Impact:* Enables signed resumable upload sessions. Zero access granted to production buckets.
   - *Determination:* `[ ] APPROVED   [ ] REJECTED   [ ] DEFERRED`

4. **Decision PO-04 (Staging Firebase Test User):**
   - *Scope:* Authorize provisioning test account `test-tiktok-operator@staging.easyslice.internal`.
   - *Impact:* Isolated test identity for route guard authentication testing.
   - *Determination:* `[ ] APPROVED   [ ] REJECTED   [ ] DEFERRED`

5. **Decision PO-05 (Controlled Staging Smoke Test Window):**
   - *Scope:* Authorize a 2-hour maintenance window to execute the end-to-end smoke test on staging.
   - *Impact:* Validates upload, clipping, and export with synthetic test media.
   - *Determination:* `[ ] APPROVED   [ ] REJECTED   [ ] DEFERRED`

---

## 5. Proposed Execution Sequence & Stop Conditions

The proposed execution sequence enforces mandatory verification gates between steps:

### Sequence Step 1: Pre-Execution Infrastructure Gate
- Verify staging Cloud SQL backup exists.
- Verify `current_database()` is `easyslice_staging` and **not** production.
- **Stop Condition 1:** If connection string contains production hostname or IP, immediately abort execution.

### Sequence Step 2: Staging Database Migration
- Execute `V000009__expand_asset_import_platform.sql` inside transactional block.
- Verify constraint definition via `pg_get_constraintdef`.
- Execute test insert with `platform = 'tiktok'` and rollback.
- **Stop Condition 2:** If DDL fails or constraint rejects valid `'tiktok'` row, execute rollback script `U000009` and halt.

### Sequence Step 3: Staging GCS Configuration
- Create bucket `easyslice-staging-media-artifacts`.
- Apply lifecycle rule (delete age >= 3 days; abort multipart >= 1 day).
- Apply CORS configuration for `https://staging.nexcut.app`.
- **Stop Condition 3:** If lifecycle policy fails to apply or public access prevention is disabled, immediately lock down bucket and halt.

### Sequence Step 4: Staging Vercel Deployment
- Inject staging environment variables (Cloud SQL staging connection, staging bucket name, staging Firebase credentials).
- Deploy staging preview build.
- **Stop Condition 4:** If build fails or any production secret is detected in staging configuration, tear down deployment immediately.

### Sequence Step 5: Controlled Smoke Test Execution
- Authenticate with staging test user credentials.
- Submit TikTok URL, verify guidance emission.
- Upload synthetic 10MB test MP4 via resumable signed URL.
- Verify metadata validation on server (`/api/media/admit`).
- Verify FFmpeg clipping execution and vertical crop packaging.
- Download vertical MP4 cut.
- **Stop Condition 5:** If upload returns HTTP 4xx/5xx or database transaction fails without compensatory GCS delete, halt test and capture logs.

---

## 6. Prohibited Actions (Zero Tolerance)

The following actions are strictly prohibited and must **never** be performed without separate, formal authorization:
1. **No Production Database Mutation:** Never execute DDL, DML, or queries against production Cloud SQL (`easyslice_prod`).
2. **No Production Storage Access:** Never create, read, or delete objects in production GCS buckets.
3. **No Direct TikTok Scraping:** Never invoke `yt-dlp` or headless browsers against live `tiktok.com` or `douyin.com` video binary URLs.
4. **No Paid External AI APIs:** Never call OpenAI Whisper API, Gemini, Anthropic, or other paid transcription/STT APIs. All transcription/processing must use packaged offline local components.
5. **No Secret Disclosure:** Never print, log, or commit GCP service account private keys, database passwords, or session cookies.
6. **No Host Filesystem Alteration:** Never touch or modify `C:\Users\hirom\easyslice-ai`.

---

## 7. Evidence References

This audit and approval matrix is grounded strictly on inspected evidence:
- **Git Commit Baseline:** `origin/main` commit `e8338e8b7dcd731dc9b494204e16749fc4918869`.
- **Merge Ancestry:** PR #7 merge baseline `d636ae79045cca888757bf897e969d5d485f6640` and PR #8 branch head `681239db71d949216e18b7163a19b73c667adee4`.
- **Merged PR #8 Evidence Inventory:** 18 files in `docs/implementation/tiktok-production-readiness/post-merge-verification/20261108T045022Z/`.
- **Staging Readiness Plan Deliverables:** 11 documents in `docs/implementation/tiktok-production-readiness/staging-readiness-plan/`.
- **Independent Gatekeeper Audit Report:** `docs/implementation/tiktok-production-readiness/staging-readiness-plan-audit/gatekeeper-audit-report.md`.
- **Raw Test Logs:** `docs/implementation/tiktok-production-readiness/staging-readiness-plan-audit/raw-audit-logs/forty-regression-tests.log` (40/40 tests passing, exit code 0).
- **Migration SQL:** `db/workflow/migrations/V000009__expand_asset_import_platform.sql`.
