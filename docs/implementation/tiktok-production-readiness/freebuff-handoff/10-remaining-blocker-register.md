# Deliverable 10: Remaining Blocker Register

This register details all unresolved blockers, their severity, technical nature, and exact unblocking procedures.

Last updated: 2026-11-26, on branch `feature/tiktok-y75-staging-readiness`.

Status vocabulary:

- **RESOLVED** — code/config/test evidence exists in this branch or on `main`.
- **PREPARED (APPROVAL REQUIRED)** — implementation and runbook are complete; the
  real cloud/DB change has not been executed.
- **NOT_TESTED** — requires an approved staging or production environment.
- **LOCKED (BY DESIGN)** — intentionally gated until staging acceptance passes.

| Blocker ID | Category | Severity | Description | Action Required to Unblock | Owner | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BLK-01** | CI / Test | High | CI workflow `.github/workflows/test-postgresql-wp03.yml` fails on Step 11 because `reconciliationMigration.test.ts` expects 3 migrations instead of 9. | PO sign-off on PO-01, then apply 6-line edit in `tests/postgresqlTestEnvironment/reconciliationMigration.test.ts`. | Freebuff / PO | **RESOLVED** on `main` (PR #13 merge commit + Flyway fix). Verified locally: 3/3 reconciliation tests pass against PostgreSQL 18.4 / Flyway 12.6.1. |
| **BLK-02** | Staging DB | High | Staging Cloud SQL `easyslice_staging` cannot store TikTok import requests until `V000009` is applied. | PO sign-off on PO-02, then execute Flyway migration against staging Cloud SQL. | Infrastructure / Staging Admin | **PREPARED (APPROVAL REQUIRED)**. Preflight SQL, evaluator, CLI, and 15 tests added; runbook at `docs/operations/staging/blk-02-cloud-sql-migration-runbook.md`. Staging not modified. |
| **BLK-03** | Staging Storage | Medium | Staging uploads cannot stream until `easyslice-staging-media-artifacts` GCS bucket is provisioned. | PO sign-off on PO-03, then create bucket with 3-day deletion lifecycle and CORS. | Infrastructure / GCP Admin | **PREPARED (APPROVAL REQUIRED)**. `infra/staging/gcp/media-storage.tf` defines bucket, 3-day delete, 1-day abort, CORS for the staging origin, UBLA, PAP, bucket-scoped `objectAdmin`, `prevent_destroy`; runbook at `blk-03-gcs-bucket-runbook.md`. Not applied. |
| **BLK-04** | Staging IAM | Medium | Vercel staging deployment cannot acquire credentials without staging WIF and service account bindings. | PO sign-off on PO-04, then configure GCP IAM binding for `easyslice-staging-sa`. | Infrastructure / GCP Admin | **PREPARED (APPROVAL REQUIRED)**. `vercel-wif.tf` defines pool/provider `vercel-staging`, condition on team/project/`environment=preview`, `workloadIdentityUser` principalSet, and Cloud SQL client/instanceUser roles; runtime rejects production identifiers. Runbook at `blk-04-wif-iam-runbook.md`. Not applied. |
| **BLK-05** | Staging Testing | Medium | End-to-end smoke test on staging cannot run until maintenance window is authorized. | PO sign-off on PO-05, then execute smoke test runbook. | Freebuff / QA | **PREPARED (APPROVAL REQUIRED)**. `lib/staging/stagingSmoke.ts` + `scripts/staging/verifyTikTokStagingFlow.ts` implement six checks with origin pinning, approval gate, and token redaction; 9 tests pass. Staging execution is **NOT_TESTED**; runbook at `blk-05-smoke-test-runbook.md`. |
| **BLK-06** | Sandbox Environment | Low (Environment Constraint) | Nested Docker container extraction fails on devbox sandbox (`failed to convert whiteout file`). | Local container integration tests are delegated to GitHub Actions hosted runners (`ubuntu-latest`). Local dev uses offline unit/mock tests. | Architectural Constraint | **RESOLVED (CONSTRAINT DOCUMENTED)**. On the current development host Docker 29.9.3 is available and the pinned PostgreSQL/Flyway suites pass locally (5/5 foundation, 3/3 reconciliation); CI remains authoritative. See `blk-06-ci-and-local-test-limits.md`. |
| **BLK-07** | Production Gate | Low (By Design) | Production database, GCS bucket, and TikTok publishing endpoints are strictly locked down. | Remains locked until staging validation gates 1 through 4 are verified green. | Product Owner | **LOCKED (BY DESIGN)**. Ten entry conditions and required approvals listed in `blk-07-production-gate.md`. No production change in this branch. |

## Additional finding during BLK-06 verification

`tests/postgresqlTestEnvironment/sliceAMigration.test.ts` carried stale catalog
assertions (6 migrations, 14 tables, 8 foreign keys, 8 revision-bearing tables).
The real schema after V000001–V000009 contains 9 migrations, 16 tables, 10
foreign keys, and 10 revision-bearing tables, including `asset_import_requests`
and `production_workflow_api_csrf_tokens`. The assertions were corrected to the
actual catalog; nothing was weakened or skipped. Both PostgreSQL suites pass
locally after the correction.

## Approval-gated operations (not executed)

1. Applying `V000009` to `easyslice_staging`.
2. Creating/changing `easyslice-staging-media-artifacts`.
3. Creating/changing staging WIF, the service account, or IAM bindings.
4. Running the staging smoke test with `STAGING_SMOKE_APPROVED=YES`.
5. Any production database, bucket, deployment, OAuth, token, or TikTok
   publication action.
