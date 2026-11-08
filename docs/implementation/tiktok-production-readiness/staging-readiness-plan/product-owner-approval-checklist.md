# Product Owner Approval Checklist

**Plan Target:** TikTok URL-to-Clipping Staging Readiness
**Target Environment:** Staging
**Authority:** Product Owner (`hiro042355`)

The following items require explicit Product Owner authorization before execution commences:

---

## 1. Staging Infrastructure Approvals

- [ ] **Approval A1: Staging Cloud SQL Migration Window**
  *Scope:* Apply `db/workflow/migrations/V000009__expand_asset_import_platform.sql` to staging Cloud SQL database `easyslice_staging`.
  *Impact:* Modifies check constraint `ck_asset_import_authority` on `workflow.asset_import_requests` to allow `platform IN ('youtube', 'tiktok')`. Purely additive; zero schema lock risk.

- [ ] **Approval A2: Staging GCS Bucket Provisioning**
  *Scope:* Authorize creation / configuration of dedicated staging GCS bucket `easyslice-staging-media-artifacts` with 3-day deletion lifecycle rule.
  *Impact:* Enables end-to-end resumable upload and compensation testing. Total storage cost bounded to < $5.00/month.

- [ ] **Approval A3: Staging Service Account & Workload Identity**
  *Scope:* Authorize provisioning of `easyslice-staging-app-sa` with restricted `roles/storage.objectAdmin` on staging bucket only.

---

## 2. Staging Execution & Verification Approvals

- [ ] **Approval B1: Test Identity Provisioning**
  *Scope:* Create staging Firebase test accounts (`usr_staging_tiktok_01`) for manual & automated smoke testing.

- [ ] **Approval B2: Controlled End-to-End User Journey Smoke Test**
  *Scope:* Execute full staging test: (1) Input TikTok URL, (2) Receive upload guidance, (3) Upload synthetic 10MB test MP4, (4) Process vertical clipping via packaged FFmpeg, (5) Download resulting vertical MP4 cut.

- [ ] **Approval B3: Staging Verification Evidence Capture**
  *Scope:* Authorize recording of staging Cloud SQL query outputs and GCS network logs in dedicated staging audit dossier.

---

## 3. Production Deployment Sign-Off (Deferred)

- [ ] **Deferred Approval P1: Production Migration & Deployment**
  *Scope:* Production deployment remains **BLOCKED** and strictly deferred until staging execution is complete, verified, and reviewed.
