# Production Risk Register

**Audit Timestamp:** `2026-11-07T23:31:09Z`
**Evaluator:** Jules (Software Engineer)

---

| Risk ID | Category | Description | Likelihood | Impact | Severity | Mitigation Strategy |
|---|---|---|---|---|---|---|
| **RSK-01** | Platform / Legal | Users expecting automated TikTok downloading complain about manual MP4 upload requirement. | High | Low | Low | Prominent UI guidance explaining platform API constraints and Terms of Service Section 5. |
| **RSK-02** | Infrastructure | Migration V000009 not applied to production database prior to release, causing asset import check constraint violations. | Medium | High | High | Enforce mandatory Flyway migration step in deployment checklist before enabling TikTok import endpoints. |
| **RSK-03** | Runtime / Timeout | Long video cuts or high-resolution vertical MP4 processing exceeding Vercel 300s serverless limit. | Medium | Medium | Medium | Direct upload to GCS already avoids upload timeout. For long videos, monitor multi-cut execution times or offload to Cloud Run acquisition worker. |
| **RSK-04** | Security | Malicious user attempting to upload non-MP4 payload disguised as MP4. | Medium | Medium | Medium | File extension and MIME type validated on client and server. Direct GCS upload requires signed session with strict `contentType: "video/mp4"` metadata. FFmpeg decoder fails safely if binary stream is not valid media. |
| **RSK-05** | Storage / Cost | Abandoned or failed GCS uploads accumulating storage costs. | High | Low | Low | GCS bucket lifecycle policy automatically deletes objects older than 7 days and acquisition handoff files after 7 days. |
| **RSK-06** | Network / SSRF | TikTok short link redirect resolution exploited to probe internal network. | Low | Critical | Low (Mitigated) | `resolveSafeTikTokRedirect` enforces HTTPS-only, maximum 3 hops, and strict hostname allowlist (`ALLOWED_REDIRECT_HOSTS`). Blocks private IP ranges and lookalike domains. |
