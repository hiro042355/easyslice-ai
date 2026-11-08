# Staging Architecture & Dependency Checklist

**Document Timestamp:** `2026-11-08T05:50:00Z`
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
- **Bucket ID:** `easyslice-staging-media-artifacts` (or project equivalent, isolated from production)
- **Location:** `asia-northeast1` (or matching compute region)
- **Storage Class:** `Standard`
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

### C. Authentication (Firebase / Identity Platform)
- **Tenant:** Staging Firebase Project (`easyslice-staging`).
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

*Note: No access to production projects or buckets is permitted.*

---

## 5. Staging Operations Categorization

All activities are strictly partitioned:

- **Group A (Can be prepared locally without external access):**
  - Synthesize dummy MP4 files (1MB, 50MB, exact 2GB boundary).
  - Draft SQL verification script and automated CLI test runner.
  - Review Flyway migration execution order.

- **Group B (Requires Product Owner approval):**
  - Authorizing staging Cloud SQL migration window.
  - Approving staging GCP project billing envelope (< $50/mo limit).
  - Designating staging test users and credentials.

- **Group C (Requires external account or infrastructure access):**
  - Authenticating Google Cloud SDK / `gcloud`.
  - Connecting Cloud SQL Proxy to staging database.
  - Deploying Next.js preview branch to Vercel Staging.

- **Group D (Must remain strictly prohibited until explicitly authorized):**
  - Any connection string pointing to production Cloud SQL.
  - Any operation targeting production GCS buckets.
  - Any execution of real TikTok OAuth or external web scraping APIs.
  - Incurring charges on paid external AI or speech recognition services.
