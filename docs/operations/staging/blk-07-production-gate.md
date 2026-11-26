# BLK-07: production gate

Status: **locked by design.** This branch performs no production change, no
production deployment, no real OAuth consent, no real token issuance, and no
real TikTok publication.

## Locked resources

| Resource | Identifier | State |
| :--- | :--- | :--- |
| Production project | `nexcut-prod-jp-2026` | Untouched |
| Production Cloud SQL | `nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql`, database `nexcut` | Untouched |
| Production bucket | `nexcut-prod-jp-2026-media` | Untouched |
| Production WIF | `projects/566365202495/…/workloadIdentityPools/nexcut-prod-vercel/providers/vercel-production` | Untouched |
| Production runtime SA | `nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam` | Untouched |
| TikTok production publishing | Outbound publication API | Not implemented in this repository (see below) |

## What keeps the gate closed

1. **Runtime authority.** `lib/staging/stagingEnvironment.ts` and the media
   runtime validators accept staging values only under `APP_ENVIRONMENT=staging`
   and reject production identifiers in staging configuration. A staging
   deployment cannot silently target `nexcut-prod-jp-2026`.
2. **Bucket/project mapping.** `gcsAdapter.ts` maps each environment to its own
   project; there is no fallback to a hard-coded production bucket.
3. **Scripts.** `scripts/staging/preflightStagingCloudSql.ts` refuses any
   instance outside the staging project, requires a PO approval reference for an
   apply plan, and never opens a database connection in dry-run.
   `scripts/staging/verifyTikTokStagingFlow.ts` refuses the production origin
   and preview hostnames, and requires `STAGING_SMOKE_APPROVED=YES`.
4. **No production deployment automation** exists in this branch: no workflow
   deploys to Vercel production or applies `infra/` to production.
5. **Publication domain.** The approved design for this repository covers
   URL acquisition → authorized MP4 admission → clip → export. The outbound
   publication foundation (V000010 and the publisher adapter) is owned by a
   separate repository (`docs/implementation/bilibili-freebuff-handoff/DATABASE_IMPLEMENTATION_SPEC.md`,
   line 10). No V000010 DDL exists here, so no production publication path can
   be enabled from this codebase.

## Entry conditions for production

All of the following must be evidenced before the production gate is opened.
None is satisfied by code alone.

| # | Condition | Current state |
| :--- | :--- | :--- |
| 1 | BLK-02: V000009 applied to `easyslice_staging` and preflight reports `CURRENT`/`ready` | Prepared, not applied (approval) |
| 2 | BLK-03: staging bucket created with lifecycle, CORS, UBLA, PAP and bucket-scoped IAM verified | Prepared, not applied (approval) |
| 3 | BLK-04: staging WIF provider, SA, and least-privilege bindings verified; no SA keys | Prepared, not applied (approval) |
| 4 | BLK-05: staging smoke test PASS on `https://staging.nexcut.app` | NOT_TESTED (approval) |
| 5 | Authenticated staging acceptance: OAuth sign-in, token storage, import, upload admission, and a real TikTok upload to a staging-owned test account | NOT_TESTED |
| 6 | Live OAuth verification with the TikTok application's review status and redirect URIs registered for the production origin | NOT_TESTED |
| 7 | Production database migration dry run (schema diff against staging) and backup/restore rehearsal | Not started (out of scope) |
| 8 | Production observability: error-rate, latency, queue-age, and upload-failure alerts with on-call routing | Not started |
| 9 | Security review sign-off: token encryption/KMS, least privilege, log redaction, CSRF/same-origin checks, rate limits | Partially evidenced by tests; formal sign-off outstanding |
| 10 | Rollback plan for production deployment and for a failed TikTok upload batch | Not started |

## Required approvals

- PO approval for each of BLK-02, BLK-03, BLK-04, BLK-05 with a change ticket id.
- Security review approval for production credentials and token handling.
- Explicit production deployment authorization, separate from this branch's PR.
- Explicit authorization for any real TikTok publication, including the target
  account and video content.

## How the gate is opened (future work, not this branch)

1. Complete conditions 1–10 with evidence attached to the change ticket.
2. Add production infrastructure as code in a dedicated, reviewed change; do not
   reuse staging Terraform with production variables.
3. Add the publication foundation (V000010) and publisher adapter in the owning
   repository, with its own tests and migrations.
4. Deploy to a production canary with publication disabled, verify health and
   observability, then enable publication for a single internal account.

## Unlock is not implied by this PR

Merging this branch changes no cloud resource and no production behavior. It
adds staging configuration code, offline tests, CI checks, and runbooks. The
production gate remains closed until the approvals above are recorded.
