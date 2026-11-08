# Production Risk Register

**Audit Timestamp:** `2026-11-07T23:31:09Z` (Updated: `2026-11-08T00:35:00Z`)
**Evaluator:** Jules (Software Engineer)

---

| Risk ID | Category | Description | Likelihood | Impact | Severity | Mitigation Strategy |
|---|---|---|---|---|---|---|
| **RSK-01** | Platform / Legal | Users expecting automated TikTok downloading complain about manual MP4 upload requirement. | High | Low | Low | Prominent UI guidance in `app/workspace-flow/page.tsx` explaining platform API constraints and Terms of Service Section 5. |
| **RSK-02** | Infrastructure | Migration V000009 not applied to production database prior to release, causing asset import check constraint violations. | Medium | High | High | Gate `DATABASE_MIGRATION_READY` marked `NOT_VERIFIED`. Enforce mandatory Flyway migration step in deployment checklist before enabling TikTok import endpoints. |
| **RSK-03** | Runtime / Timeout | Long video cuts or high-resolution vertical MP4 processing exceeding Vercel 300s serverless limit. | Medium | Medium | Medium | Direct upload to GCS avoids upload timeout. For long videos, monitor multi-cut execution times or offload to Cloud Run acquisition worker. |
| **RSK-04** | Security | Malicious user attempting to upload non-MP4 payload disguised as MP4. | Medium | Medium | Medium | Client proactively validates format; server independently enforces `video/mp4` MIME, GCS resumable upload enforces `contentType`, and FFmpeg fails safely if binary stream is corrupt. |
| **RSK-05** | Storage / Cost | Abandoned or failed GCS uploads accumulating storage costs. | High | Low | Low | GCS bucket lifecycle policy in `infra/production/gcp/media-storage.tf` automatically deletes objects older than 7 days. Failed admissions trigger compensation `object.delete()`. |
| **RSK-06** | Network / SSRF | TikTok short link redirect resolution exploited to probe internal network. | Low | Critical | Low (Mitigated) | `resolveSafeTikTokRedirect` enforces HTTPS-only, maximum 3 hops, and strict hostname allowlist (`ALLOWED_REDIRECT_HOSTS`). Blocks private IP ranges and lookalike domains. |
| **RSK-07** | Client Bypass | Client circumvents client-side file checks to upload oversized payloads. | Low | Medium | Low (Mitigated) | Server route `app/api/media/admit/route.ts` remains authoritative, rejecting sizes > 2GB and validating GCS uploaded size before database registration. |
