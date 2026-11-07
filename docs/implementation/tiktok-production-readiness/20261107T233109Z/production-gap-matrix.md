# Production Gap Matrix

**Audit Timestamp:** `2026-11-07T23:31:09Z`
**Evaluator:** Jules (Software Engineer)

---

| Area | Current Implementation State | Production Requirement | Gap Severity | Proposed Resolution / Action Required | Owner |
|---|---|---|---|---|---|
| **URL Recognition** | Fully supports desktop, mobile, and short links; strips tracking parameters. | Robust, SSRF-safe URL parsing. | **NONE (PASS)** | Maintained and verified by offline unit tests. | Engineering |
| **User Guidance** | Clear explanation that TikTok API does not provide binary downloads; prompts for authorized MP4. | Clear, non-misleading messaging for users. | **NONE (PASS)** | Continuous adherence to copy guidelines. | Product / Legal |
| **Media Admission Client** | Checks non-empty MP4, calls `/api/media/admit`, uploads directly to GCS. | Fast failure on client if file > 2GB before initiating network upload. | **LOW** | Add proactive client-side `MAX_MEDIA_BYTES` check in `lib/client/durableMediaAdmission.ts`. | Engineering |
| **Upload Security** | Validates 2GB, `video/mp4`, origin, owner, and storage key format. | Multi-tenant isolation and strict bounds. | **NONE (PASS)** | Maintained by server route guards and DB constraints. | Security / Infra |
| **Database Migration V000009** | Script `V000009__expand_asset_import_platform.sql` authored and verified locally. | Applied to live Cloud SQL production database. | **MEDIUM (BLOCKED on deploy)** | Run migration via Flyway during scheduled deployment window. | DevOps / DBA |
| **Cloud Storage** | Terraform provisions `production_media` bucket with lifecycle rules. | Bucket provisioned and accessible via WIF in production environment. | **MEDIUM (External Config)** | Verify GCS bucket IAM and CORS settings in production project. | DevOps / Infra |
| **Cloud SQL Connections** | Connects via WIF and IAM authentication. | Connection pooling sized for peak concurrent jobs. | **LOW (Monitoring)** | Configure Cloud SQL connection pool metrics and alerts. | DevOps / SRE |
| **Speech-to-Text Provider** | Synthetic transcripts supported; durable transcript endpoints implemented. | Live Whisper API or speech model credentials configured. | **MEDIUM (External Dependency)** | Verify OpenAI / Whisper API credentials in production secrets. | Product / Infra |
| **Packaged FFmpeg in Production** | Packaged binary in `.nexcut-runtime/ffmpeg/bin/ffmpeg` verified locally. | Materialized properly inside production container / serverless bundle. | **LOW** | Ensure `npm run prebuild` executes during production build pipeline. | DevOps |
