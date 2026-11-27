# Required External Approvals

**Audit Timestamp:** `2026-11-07T23:31:09Z`
**Evaluator:** Jules (Software Engineer)

---

The following actions exceed local engineering authorization and require explicit external sign-off or action:

## 1. Product Owner Approvals
1. **TikTok Acquisition Policy Confirmation:**
   - Formal sign-off on continuing the user-provided MP4 model without automated video downloading.
   - Approval of user-facing UI copy and guidance explanations in `app/workspace-flow/page.tsx`.
2. **Release Go/No-Go Decision:**
   - Approval to schedule production release following verification of staging environment.

## 2. Infrastructure & Database Approvals
1. **Cloud SQL Migration Execution:**
   - Authorization for DBA / DevOps to apply `V000009__expand_asset_import_platform.sql` to Google Cloud SQL production instance `nexcut-prod-postgresql`.
2. **Production Secrets & Environment Variables:**
   - Verification that `MEDIA_BUCKET_NAME`, `CLOUD_SQL_INSTANCE_CONNECTION_NAME`, `POSTGRES_DATABASE`, and `POSTGRES_IAM_USER` are correctly set in the production Vercel project environment.
3. **Speech-to-Text API Quota & Billing:**
   - Confirmation of active billing and quota for speech recognition provider (Whisper / STT API).
