# Staging Architecture & Dependency Checklist

**Document Timestamp:** `2026-11-08T07:10:00Z`
**Purpose:** Define architectural topology, infrastructure dependencies, IAM permissions, and configuration prerequisites for controlled staging validation.

---

## 1. Architectural Topology Overview

```text
[ Browser / Playwright Test Runner ]
               │
               ▼ (HTTPS / Session Cookie)
     [ Next.js Staging Runtime ]
     ├── Client: DurableMediaAdmission (2GB check, MIME check)
     └── Server: /api/media/admit (Auth Guard, Transaction, Storage Orchestrator)
               │                                      │
               ▼ (GCS Resumable Signed Session)        ▼ (TCP 5432 / pg connection pool)
     [ Google Cloud Storage ]                 [ Cloud SQL PostgreSQL ]
       (Staging Media Bucket)                   (Schema: workflow)
       Lifecycle: 3-day deletion                Migration: V000001 -> V000009
```

---

## 2. Infrastructure & Resource Prerequisites

### A. Google Cloud Storage (GCS)
- **Bucket ID:** `easyslice-staging-media-artifacts` (isolated from production)
- **Location:** `asia-northeast1`
- **Storage Class:** `Standard`
- **Uniform Bucket-Level Access:** Enabled
- **Public Access Prevention:** Enforced
- **Object Lifecycle Management:**
  - Rule: Automatically delete objects older than 3 days (`Age >= 3 days`).
  - Abort incomplete multipart/resumable uploads after 1 day.
- **CORS Configuration:**
  - Allowed Origins: `https://staging.nexcut.app` (and local test runners when authorized).
  - Allowed Methods: `PUT`, `POST`, `OPTIONS`.
  - Allowed Headers: `Content-Type`, `Content-Length`, `x-goog-resumable`.
  - Max Age: 3600 seconds.

### B. Google Cloud SQL (PostgreSQL)
- **Instance ID:** `easyslice-staging-pg` (dedicated staging instance; **never** connect to production)
- **Database Version:** PostgreSQL 15+
- **Database Name:** `easyslice_staging`
- **Schema:** `workflow`
- **Migration Level:** Up to `V000008` currently; ready for `V000009`.

### C. Authentication (Firebase / Identity Platform) & Isolation Safeguards
- **Tenant:** Staging Firebase Project (`easyslice-staging`).
- **Isolation Boundaries:**
  - Production service account keys and project IDs must **never** be injected into staging.
  - Staging Firebase Admin verifies tokens against project `easyslice-staging`.
  - If a production token is presented to staging, the JWT signature verification fails closed (HTTP 401).
  - If a staging token is presented to production, verification fails closed (HTTP 401).
- **Required Automated Token Rejection Tests:**
  1. Staging route guard rejects production-signed ID token.
  2. Production route guard rejects staging-signed ID token.
  3. Mismatched or empty `FIREBASE_PROJECT_ID` throws configuration error and halts startup.
- **Test User Accounts:**
  - Standard User: `test-tiktok-operator@staging.easyslice.internal` (UID: `usr_staging_tiktok_01`)
  - Malicious / Spoof User: `test-imposter@staging.easyslice.internal` (UID: `usr_staging_imposter_99`)

---

## 3. Required Staging Environment Variables

The following variables must be configured in the staging deployment runtime environment (e.g., Vercel Staging Environment Settings):

```bash
# PostgreSQL Connection (Workflow Schema)
WORKFLOW_DATABASE_URL="postgresql://workflow_staging_user:PASSWORD@STAGING_CLOUDSQL_IP:5432/easyslice_staging?sslmode=require"
POSTGRES_MAX_CONNECTIONS=10
POSTGRES_IDLE_TIMEOUT_MS=10000

# Google Cloud Storage Configuration
GCS_MEDIA_BUCKET_NAME="easyslice-staging-media-artifacts"
GCS_PROJECT_ID="easyslice-staging-project"
APP_ENVIRONMENT="staging"

# Firebase Admin Staging Authentication
FIREBASE_PROJECT_ID="easyslice-staging"
FIREBASE_CLIENT_EMAIL="firebase-staging-admin@easyslice-staging.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Security & Session
SESSION_COOKIE_SECRET="STAGING_ONLY_RANDOM_256_BIT_SECRET"
NEXT_PUBLIC_APP_ENV="staging"
```

---

## 4. Service Account & IAM Roles (Least Privilege)

The staging runtime service account (`easyslice-staging-app-sa@easyslice-staging.iam.gserviceaccount.com`) requires strictly bounded roles:

| GCP Role | Resource Scope | Purpose |
|---|---|---|
| `roles/storage.objectAdmin` | `projects/_/buckets/easyslice-staging-media-artifacts` | Issue signed resumable upload URLs, verify object metadata, compensatory delete. |
| `roles/cloudsql.client` | Staging Cloud SQL instance | Authorize Cloud SQL Proxy TCP connectivity. |
| Firebase Admin SDK access | Staging Firebase project | Authorize decoded ID token verification. |

*Note: No access to production projects or buckets is permitted. `iam.serviceAccounts.signBlob` is not required for `createResumableUpload`.*

---

## 5. Smoke Test Scope Separation: Synthetic Fixtures vs Live External APIs

To maintain zero unexpected billing and prevent unvetted AI API calls, the smoke test is partitioned into two distinct scopes:

### Scope A: Media Pipeline Smoke Test (Synthetic Fixtures - Default)
- **Path:**
  1. Authenticated session check (`usr_staging_tiktok_01`).
  2. TikTok URL guidance check (`/api/url/classify`).
  3. Resumable upload session initiation (`/api/media/admit` `action: "initiate"`).
  4. 10MB test MP4 binary streaming to GCS.
  5. Admission finalization (`/api/media/admit` `action: "finalize"`).
  6. Durable media & job records committed to Cloud SQL.
  7. Clipping generation using **synthetic transcript fixtures** (pre-computed subtitle JSON as tested in `platformAwareOptimization.test.ts`).
  8. Packaged FFmpeg 7.0.2 vertical 9:16 MP4 crop rendering.
  9. Final ZIP packaging and download.
- **External AI Calls:** **Zero**. No external AI or transcription calls.
- **Cost:** < $0.05 (compute/storage).

### Scope B: Live Transcription Integration Test (Separate PO Authorization Required)
- **Path:**
  - Invokes `/api/transcript/durable`.
  - Downloads audio and calls Google Gemini API (`GEMINI_API_KEY`) via `GeminiTranscriptProvider`.
- **Pre-requisite:** Explicit Product Owner approval, approved billing quota, and dedicated staging Gemini API key.
- **Safety Rule:** Scope A must **never** be conflated with Scope B. Scope A validates the media admission and clipping pipeline; Scope B validates live AI transcription.
