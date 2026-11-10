# NEXCUT AI Core & Publication Layer Architecture

## 1. System Context & Microservice Topology
The NEXCUT AI ecosystem is designed around an asset-centric, decoupled architecture:
- **NEXCUT AI Core (`easyslice-ai`)**:
  - Next.js 16 (App Router), React 19, TypeScript, PostgreSQL (Flyway migrations), Google Cloud Storage.
  - Core domain: Source URL acquisition (YouTube via yt-dlp, TikTok via URL classification & direct MP4 admission), AI clip selection (Gemini API & ebur128 audio energy), packaged FFmpeg video cutting/exporting.
  - Publication domain: Authoritative publication intent, two-tier relational ownership verification, transactional outbox with monotonic lease fencing, JIT 15-minute signed GCS media access, two-tier append-only callback ingress, and canonical event sequence drainage.
- **Platform Publisher Services (External Microservices)**:
  - **YouTube Publisher (`nexcut-youtube-publisher`)**: Dedicated Video Uploads bucket tracking (100 uploads/project/day), official resumable upload protocol (HTTP 308 offset recovery), Google OAuth2 session management.
  - **TikTok Publisher**: Direct Post API v2 (`/v2/post/publish/video/init/`), dynamic Creator Info permission preflight (`/v2/post/publish/creator_info/query/`), `publish_id` polling.
  - **Bilibili Publisher (`nexcut-bilibili-publisher`)**: Partner Open Platform archive submission (`tid`, `copyright`). Community Web API parameters (Wbi signatures, SESSDATA cookies) are strictly quarantined.

## 2. Relational Ownership Chain
Database-enforced relational chain preventing cross-user or cross-job asset contamination:
```
workflow.jobs (id, owner_uid)
  ▲
  │ (job_id, owner_uid) REFERENCES workflow.jobs(id, owner_uid) ON DELETE RESTRICT
  │
workflow.publications (id, owner_uid, job_id, export_id)
  │
  │ (export_id, job_id) REFERENCES workflow.exports(id, job_id) ON DELETE RESTRICT
  ▼
workflow.exports (id, job_id)
```
- `workflow.jobs(id, owner_uid)` has unique constraint `uq_jobs_id_owner` (verified in `V000008`).
- `workflow.exports(id, job_id)` has composite uniqueness `uq_exports_id_job UNIQUE (id, job_id)` (to be attached in `V000010` via pre-migration index).
