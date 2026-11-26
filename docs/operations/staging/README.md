# Staging operations: TikTok publisher readiness

This directory contains the executable runbooks for BLK-02 through BLK-07 of
`docs/implementation/tiktok-production-readiness/freebuff-handoff/10-remaining-blocker-register.md`.
Every runbook separates work that is already implemented (code, SQL, Terraform,
scripts, tests) from work that requires an explicit Product Owner approval
before a real staging resource is touched.

## Environment authority

The single source of truth for staging identifiers is
`lib/staging/stagingEnvironment.ts`. It is imported by runtime code, tests, and
the scripts below, so a value cannot drift between Terraform, the application,
and the smoke test.

| Item | Value |
| :--- | :--- |
| GCP project | `nexcut-staging` |
| Region | `asia-northeast1` |
| Cloud SQL instance (expected) | `nexcut-staging:asia-northeast1:<staging instance id>` |
| Database | `easyslice_staging` |
| Database IAM user | `easyslice-staging-sa@nexcut-staging.iam` |
| Media service account | `easyslice-staging-sa@nexcut-staging.iam.gserviceaccount.com` |
| Media bucket | `easyslice-staging-media-artifacts` |
| Workload Identity pool / provider | `vercel-staging` / `vercel-staging` |
| Application origin | `https://staging.nexcut.app` |

Production identifiers are rejected by the runtime validators and by the
staging scripts. In particular, `nexcut-prod-jp-2026`, `nexcut`,
`nexcut-prod-jp-2026-media`, and the production WIF provider are never accepted
as staging configuration.

## Work already implemented (no approval needed)

| Area | Implementation | Verification |
| :--- | :--- | :--- |
| BLK-02 | `lib/workflowMigration/stagingMigrationPreflight.ts`, `scripts/staging/preflightStagingCloudSql.ts`, `db/staging/preflight/*.sql` | `tests/staging/stagingMigrationPreflight.test.ts` (15 tests) |
| BLK-03 | `infra/staging/gcp/media-storage.tf` | `terraform fmt`; CI `terraform validate` |
| BLK-04 | `infra/staging/gcp/vercel-wif.tf`, `variables.tf`, `services.tf`, `outputs.tf` | CI `terraform validate`; runtime authority tests |
| BLK-05 | `lib/staging/stagingSmoke.ts`, `scripts/staging/verifyTikTokStagingFlow.ts` | `tests/staging/stagingSmoke.test.ts` (9 tests) |
| BLK-06 | `.github/workflows/test-postgresql-wp03.yml` (PostgreSQL 18.4 + Flyway 12.6.1 on hosted runners) | GitHub Actions |
| BLK-07 | Lock documented in `blk-07-production-gate.md` | Review only |

## Approval gates

The following operations are intentionally **not** performed by this branch and
must not be executed without written PO approval of the corresponding change
ticket:

1. Applying `V000009` to `easyslice_staging` (BLK-02).
2. Creating or changing the `easyslice-staging-media-artifacts` bucket (BLK-03).
3. Creating or changing staging IAM, the service account, or Workload Identity
   Federation (BLK-04).
4. Running the smoke test with `STAGING_SMOKE_APPROVED=YES` against staging
   (BLK-05).
5. Any production database, production bucket, production deployment, real
   OAuth consent, real token issuance, or real TikTok publication (BLK-07).

## Verification commands (offline)

```bash
npx tsx --test --test-concurrency=1 tests/staging/stagingMigrationPreflight.test.ts
npx tsx --test --test-concurrency=1 tests/staging/stagingSmoke.test.ts
npx tsx scripts/staging/preflightStagingCloudSql.ts
npx tsx scripts/staging/verifyTikTokStagingFlow.ts
terraform -chdir=infra/staging/gcp fmt -check
```

Both scripts default to a dry run: no database connection is opened and no
HTTP request is sent unless the runbook's approval gate is satisfied.
