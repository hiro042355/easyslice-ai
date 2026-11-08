# Product Owner Approval Checklist & Decision Matrix

**Plan Target:** TikTok URL-to-Clipping Staging Readiness
**Target Environment:** Staging
**Authority:** Product Owner (`hiro042355`)
**Baseline Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`

---

## 1. Executive Summary: Current Approval & Readiness State

- **Current Status:** `STAGING_PLAN_APPROVED_FOR_PO_REVIEW`
- **Verified Capabilities:**
  - URL parsing and SSRF defense (max 3 hops, allowlist, HTTPS-only).
  - Proactive client-side 2GB file and MIME validation (`durableMediaAdmission.ts`).
  - Server-side admission request construction and mock resumable upload contract.
  - 15–55s duration window and vertical crop weighting in clipping engine.
  - FFmpeg 7.0.2 binary materialization and packaging.
  - 40/40 offline regression unit tests passing (exit code 0, 0 skipped).
- **Unverified External Capabilities:**
  - Live execution of migration `V000009` on Cloud SQL.
  - Live binary chunk streaming to staging GCS bucket.
  - Staging Firebase token authentication and IAM bindings.
  - End-to-end staging smoke test execution.
- **Explicitly Not Approved / Prohibited:**
  - Connecting to production Cloud SQL or production GCS buckets.
  - Executing live TikTok OAuth, Graph, or scraping APIs.
  - Consuming external paid AI APIs (Whisper/STT, OpenAI, etc.).
  - Deploying to production Vercel runtime.

---

## 2. Comprehensive Operational Approval Matrix (Groups A–D)

Every operational action is categorized using mandatory classification standards:
- `SAFE_DOCUMENTATION_ONLY`
- `SAFE_LOCAL_OFFLINE`
- `REQUIRES_PO_APPROVAL`
- `REQUIRES_EXTERNAL_ACCOUNT_OWNER_APPROVAL`
- `BLOCKED_PENDING_DEPENDENCY`
- `NOT_VERIFIED`

| ID | Operational Action | Group | Classification | Resource / Scope | Risk | Prerequisites | Required Evidence | Approval Owner |
|---|---|---|---|---|---|---|---|---|
| **ACT-A1** | Author Staging Readiness Documentation | A | `SAFE_DOCUMENTATION_ONLY` | Local repo (`docs/...`) | None | None | Merged PR #8 baseline in repo | Jules (Engineer) |
| **ACT-A2** | Generate Local Synthetic Test MP4s (10MB, 2GB) | A | `SAFE_LOCAL_OFFLINE` | Local disk (`ffmpeg -f lavfi`) | Disk space | Packaged FFmpeg binary | Local MP4 files with verified byte count | Jules (Engineer) |
| **ACT-A3** | Run Offline Unit & Contract Regression Suites | A | `SAFE_LOCAL_OFFLINE` | Local test runner (`npx tsx --test`) | None | Dependencies (`npm ci`) | 40/40 tests passing (exit code 0) | Jules (Engineer) |
| **ACT-B1** | Authorize Staging Cloud SQL Migration `V000009` | B | `REQUIRES_PO_APPROVAL` | Staging Cloud SQL (`easyslice_staging`) | DDL lock (<100ms) | Backup & staging instance provisioned | Signed PO approval; staging DDL execution log | Product Owner |
| **ACT-B2** | Authorize Staging GCS Bucket Provisioning | B | `REQUIRES_PO_APPROVAL` | GCP Staging Project (`easyslice-staging`) | Storage cost (<$5/mo) | GCP billing envelope active | Signed PO approval; GCS bucket lifecycle rule | Product Owner |
| **ACT-B3** | Authorize Staging Test User Identities | B | `REQUIRES_PO_APPROVAL` | Staging Firebase Auth tenant | None | Staging Firebase project active | Staging test UID (`usr_staging_tiktok_01`) | Product Owner |
| **ACT-B4** | Authorize Controlled Staging Smoke Test Run | B | `REQUIRES_PO_APPROVAL` | Staging Web / API runtime | Staging log pollution | Acts B1, B2, B3 complete | Execution sign-off dossier | Product Owner |
| **ACT-C1** | Apply Migration `V000009` via Cloud SQL Proxy | C | `BLOCKED_PENDING_DEPENDENCY` | Staging Cloud SQL instance | Accidental connection | Act B1 approval; `gcloud` access | `ck_asset_import_authority` check query log | Infrastructure Operator |
| **ACT-C2** | Configure Staging GCS Bucket CORS & Lifecycle | C | `BLOCKED_PENDING_DEPENDENCY` | Staging GCS bucket | Misconfiguration | Act B2 approval; GCP IAM access | `gsutil lifecycle get` output log | Infrastructure Operator |
| **ACT-C3** | Deploy Preview Branch to Staging Vercel | C | `BLOCKED_PENDING_DEPENDENCY` | Staging Vercel runtime | Environment drift | Act B1–B4 approvals | Vercel deployment URL & build logs | Infrastructure Operator |
| **ACT-C4** | Execute Staging E2E Resumable Upload Test | C | `BLOCKED_PENDING_DEPENDENCY` | Staging App & GCS | Upload failure | Acts C1, C2, C3 complete | GCS object metadata check & DB record | Infrastructure Operator |
| **ACT-D1** | Production Cloud SQL Execution | D | `NOT_VERIFIED` | Production Cloud SQL | Data corruption | Full staging sign-off | Explicit Production Release Sign-Off | Prohibited |
| **ACT-D2** | Production GCS Bucket Mutation | D | `NOT_VERIFIED` | Production GCS bucket | Data overwrite | Full staging sign-off | Explicit Production Release Sign-Off | Prohibited |
| **ACT-D3** | Live TikTok Scraping / Direct Binary Download | D | `NOT_VERIFIED` | External TikTok endpoints | Terms violation / IP block | Formal TikTok API Partnership | Prohibited | Prohibited |
| **ACT-D4** | External Paid AI API Consumption (Whisper/STT) | D | `NOT_VERIFIED` | Paid third-party APIs | Runaway billing | Formal budget authorization | Prohibited | Prohibited |

---

## 3. Dependency Map

The execution prerequisites form a strict directed acyclic graph (DAG):

```text
[ Group A: Local Offline Prep ]
         │ (PASS: 40/40 Tests, FFmpeg Ready)
         ▼
[ Group B: Product Owner Approvals ]
  ├── Approval B1: Staging Cloud SQL Migration Window
  ├── Approval B2: Staging GCS Bucket Creation (<$5/mo)
  ├── Approval B3: Staging Test Account Creation
  └── Approval B4: Controlled Smoke Test Window
         │ (All B Approvals Granted)
         ▼
[ Group C: Staging Infrastructure Operations ]
  ├── Step C1: Apply V000009 DDL to Staging Cloud SQL
  ├── Step C2: Apply GCS CORS & 3-Day Lifecycle Policy
  ├── Step C3: Deploy Preview Branch to Staging Vercel
  └── Step C4: Execute Staging Resumable Upload & Admission
         │ (Successful Staging Sign-Off)
         ▼
[ Phase 3: Production Release (Deferred) ]
```

**Stop Condition:** If any step in Group C fails (e.g. DDL syntax mismatch, GCS 403 Forbidden, token verification failure), all operations must immediately halt, trigger rollback procedures in `migration-and-rollback-plan.md`, and report findings to the Product Owner.

---

## 4. Product Owner Independent Decision List

The Product Owner must explicitly sign off on each of the following discrete decisions:

- [ ] **Decision PO-01 (Staging Cloud SQL):** Approve executing `V000009__expand_asset_import_platform.sql` on the staging Cloud SQL database `easyslice_staging`.
- [ ] **Decision PO-02 (Staging GCS Bucket):** Approve provisioning the isolated staging bucket `easyslice-staging-media-artifacts` with automatic 3-day deletion lifecycle rule.
- [ ] **Decision PO-03 (Service Account IAM):** Approve binding role `roles/storage.objectAdmin` restricted to `easyslice-staging-media-artifacts` for `easyslice-staging-app-sa`.
- [ ] **Decision PO-04 (Staging Test User):** Approve creation of synthetic staging test account `test-tiktok-operator@staging.easyslice.internal`.
- [ ] **Decision PO-05 (Staging E2E Execution Window):** Authorize scheduling a 2-hour controlled staging test window to validate URL input -> manual MP4 upload -> vertical clip generation -> export packaging.
