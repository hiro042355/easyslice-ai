# Product Owner Approval Checklist & Decision Matrix

**Plan Target:** TikTok URL-to-Clipping Staging Readiness
**Target Environment:** Staging
**Authority:** Product Owner (`hiro042355`)
**Baseline Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`

---

## 1. Executive Summary: Current Approval & Readiness State

- **Current Status:** `STAGING_PLAN_APPROVED_FOR_PO_REVIEW`
- **Verified Capabilities (Offline):**
  - URL parsing and SSRF defense (max 3 hops, allowlist, HTTPS-only).
  - Proactive client-side 2GB file and MIME validation (`durableMediaAdmission.ts`).
  - Server-side admission request construction and mock resumable upload contract.
  - 15–55s duration window and vertical crop weighting in clipping engine.
  - FFmpeg 7.0.2 binary materialization and packaging.
  - 40/40 offline regression unit tests passing (exit code 0, 0 skipped).
- **Unverified External Capabilities (Pending Staging):**
  - Live execution of migration `V000009` on Cloud SQL.
  - Live binary chunk streaming to staging GCS bucket.
  - Staging Firebase token authentication and IAM bindings.
  - End-to-end staging smoke test execution.
- **Explicitly Not Approved / Prohibited:**
  - Connecting to production Cloud SQL or production GCS buckets.
  - Executing live TikTok OAuth, Graph, or scraping APIs.
  - Consuming external paid AI APIs (Gemini/Whisper) without separate PO authorization.
  - Deploying preview branches to production Vercel environments.

---

## 2. Comprehensive Operational Approval Matrix (Groups A–D)

Mandatory classification standards:
- `SAFE_DOCUMENTATION_ONLY`
- `SAFE_LOCAL_OFFLINE`
- `REQUIRES_PO_APPROVAL`
- `REQUIRES_EXTERNAL_ACCOUNT_OWNER_APPROVAL`
- `BLOCKED_PENDING_DEPENDENCY`
- `NOT_VERIFIED`

| ID | Operational Action & Scope | Group | Classification | Resource / Scope | Risk | Prerequisites | Required Evidence | Approval Owner |
|---|---|---|---|---|---|---|---|---|
| **ACT-A1** | Author Staging Readiness Documentation | A | `SAFE_DOCUMENTATION_ONLY` | Local repo (`docs/...`) | None | Git clone; merged `main` baseline | Merged markdown & JSON files in repo | Jules (Engineer) |
| **ACT-A2** | Generate Local Synthetic Test MP4s (10MB, 2GB) | A | `SAFE_LOCAL_OFFLINE` | Local disk (`ffmpeg -f lavfi`) | Disk space | Packaged FFmpeg binary | Local MP4 files with verified byte count | Jules (Engineer) |
| **ACT-A3** | Run 40-Test Offline Regression Suite | A | `SAFE_LOCAL_OFFLINE` | Local test runner (`npx tsx --test`) | None | Dependencies (`npm ci`) | 40/40 tests passing (exit code 0) | Jules (Engineer) |
| **ACT-A4** | Design Staging GCS Authority Refactor | A | `SAFE_DOCUMENTATION_ONLY` | Local Design Spec | Architecture drift | Review `gcsAdapter.ts` | Design doc in `staging-readiness-plan/` | Jules (Engineer) |
| **ACT-B1** | Authorize Staging Cloud SQL Migration `V000009` | B | `REQUIRES_PO_APPROVAL` | Staging Cloud SQL (`easyslice_staging`) | Access Exclusive lock | Backup verified; staging idle | Signed PO approval; staging DDL log | Product Owner |
| **ACT-B2** | Authorize Staging GCS Bucket Provisioning | B | `REQUIRES_PO_APPROVAL` | GCP Staging Project (`easyslice-staging`) | Storage cost (<$5/mo) | GCP billing envelope active | Signed PO approval; GCS bucket lifecycle rule | Product Owner |
| **ACT-B3** | Authorize Staging Test User Identities | B | `REQUIRES_PO_APPROVAL` | Staging Firebase Auth tenant | None | Staging Firebase project active | Staging test UID (`usr_staging_tiktok_01`) | Product Owner |
| **ACT-B4** | Authorize Staging Smoke Test (Scope A: Synthetic) | B | `REQUIRES_PO_APPROVAL` | Staging Web / API runtime | Staging log pollution | Acts B1, B2, B3 complete; synthetic fixtures | Execution sign-off dossier | Product Owner |
| **ACT-B5** | Authorize Live Gemini Transcription Test (Scope B) | B | `REQUIRES_PO_APPROVAL` | External Gemini API | Quota / billing consumption | Dedicated staging Gemini API key & budget | Signed PO approval & budget cap | Product Owner |
| **ACT-C1** | Apply Migration `V000009` via Cloud SQL Proxy | C | `BLOCKED_PENDING_DEPENDENCY` | Staging Cloud SQL instance | Accidental connection | Act B1 approval; `gcloud` access | `ck_asset_import_authority` check query log | Infrastructure Operator |
| **ACT-C2** | Configure Staging GCS Bucket CORS & Lifecycle | C | `BLOCKED_PENDING_DEPENDENCY` | Staging GCS bucket | Misconfiguration | Act B2 approval; GCP IAM access | `gsutil lifecycle get` output log | Infrastructure Operator |
| **ACT-C3** | Deploy Preview Branch to Staging Vercel | C | `BLOCKED_PENDING_DEPENDENCY` | Staging Vercel runtime | Environment drift | Act B1–B4 approvals | Vercel deployment URL & build logs | Infrastructure Operator |
| **ACT-C4** | Execute Staging Smoke Test (Scope A) | C | `BLOCKED_PENDING_DEPENDENCY` | Staging App & GCS | Upload failure | Acts C1, C2, C3 complete | GCS metadata inspection & Cloud SQL row verification | Infrastructure Operator |
| **ACT-C5** | Configure Staging Service Account & IAM Roles | C | `BLOCKED_PENDING_DEPENDENCY` | GCP IAM Staging | Privilege escalation | Act B2 approval; bucket exists | `gcloud storage buckets get-iam-policy` log | Infrastructure Operator |
| **ACT-D1** | Production Cloud SQL Execution | D | `NOT_VERIFIED` | Production Cloud SQL | Data corruption | Full staging sign-off | Explicit Production Release Sign-Off | Prohibited |
| **ACT-D2** | Production GCS Bucket Mutation | D | `NOT_VERIFIED` | Production GCS bucket | Data overwrite | Full staging sign-off | Explicit Production Release Sign-Off | Prohibited |
| **ACT-D3** | Live TikTok Scraping / Direct Binary Download | D | `NOT_VERIFIED` | External TikTok endpoints | Terms violation / IP block | Formal TikTok API Partnership | Prohibited | Prohibited |
| **ACT-D4** | Unapproved External Paid AI API Usage | D | `NOT_VERIFIED` | External AI APIs | Unbudgeted billing | Explicit budget approval | Prohibited | Prohibited |

---

## 3. Dependency DAG & Ordering

```text
[ Group A: Safe Local / Documentation Preparation ]
  ├── ACT-A1: Staging Docs
  ├── ACT-A2: Test MP4 Generation
  ├── ACT-A3: Offline Regression Suite (40/40 PASS)
  └── ACT-A4: Environment-Specific GCS Authority Design
         │
         ▼
[ Group B: Product Owner Independent Decisions ]
  ├── PO-01: Staging Cloud SQL Migration Window
  ├── PO-02: Staging GCS Bucket Provisioning
  │      └── PO-03: Staging Bucket-Scoped IAM Roles (Depends on PO-02)
  ├── PO-04: Staging Firebase Test User Creation
  └── PO-05: Staging Smoke Test Execution (Scope A: Synthetic Fixtures)
         │ (Requires PO-01, PO-02, PO-03, PO-04 signed & executed)
         ▼
[ Group C: Staging Infrastructure Operations ]
  ├── ACT-C1: Apply Migration V000009 DDL
  ├── ACT-C2: Configure GCS Bucket CORS & 3-Day Lifecycle
  ├── ACT-C5: Bind Bucket IAM to Service Account
  ├── ACT-C3: Deploy Staging Build to Vercel
  └── ACT-C4: Execute Scope A Smoke Test (10MB MP4 Upload -> FFmpeg Clip -> Export)
         │
         ▼
[ Deferred Phase: Production Release Gating (Group D - Strictly Prohibited) ]
```

---

## 4. Product Owner Independent Decision List

- [ ] **Decision PO-01 (Staging Cloud SQL Migration V000009):**
  - *Scope:* Authorize applying `V000009__expand_asset_import_platform.sql` to staging database `easyslice_staging`.
  - *Rollback:* Purges test child records (`workflow.media`, `workflow.jobs`) then test `asset_import_requests` before restoring constraint.
  - *Determination:* `[ ] APPROVED   [ ] REJECTED   [ ] DEFERRED`

- [ ] **Decision PO-02 (Staging GCS Bucket Provisioning):**
  - *Scope:* Authorize creation of staging bucket `easyslice-staging-media-artifacts` in `asia-northeast1` with 3-day deletion lifecycle rule.
  - *Determination:* `[ ] APPROVED   [ ] REJECTED   [ ] DEFERRED`

- [ ] **Decision PO-03 (Staging Service Account IAM):**
  - *Scope:* Authorize binding `roles/storage.objectAdmin` restricted strictly to `easyslice-staging-media-artifacts` for `easyslice-staging-app-sa`. Depends on PO-02.
  - *Determination:* `[ ] APPROVED   [ ] REJECTED   [ ] DEFERRED`

- [ ] **Decision PO-04 (Staging Firebase Test User):**
  - *Scope:* Authorize provisioning test account `test-tiktok-operator@staging.easyslice.internal` in staging Firebase tenant.
  - *Determination:* `[ ] APPROVED   [ ] REJECTED   [ ] DEFERRED`

- [ ] **Decision PO-05 (Staging Media Pipeline Smoke Test - Scope A):**
  - *Scope:* Authorize 2-hour controlled staging test window using synthetic transcript fixtures (zero external AI calls).
  - *Determination:* `[ ] APPROVED   [ ] REJECTED   [ ] DEFERRED`
