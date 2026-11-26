# BLK-02: apply V000009 to `easyslice_staging`

Status: **prepared, not executed.** The staging database has not been modified.

## Why this is needed

`V000009__expand_asset_import_platform.sql` replaces the
`ck_asset_import_authority` check constraint so `workflow.asset_import_requests`
accepts `platform IN ('youtube', 'tiktok')`. Without it, the TikTok import API
cannot persist an import request on staging.

## Prerequisites

- Written PO approval for the staging change (PO-02) including the change ticket
  id. The preflight script requires it as `--po-approval`.
- `cloud-sql-proxy` authenticated with an identity that can reach the staging
  instance, and a database login that can read `flyway_schema_history`,
  `pg_constraint`, `pg_attribute`, `pg_roles`, and run `has_table_privilege`.
- A current automated backup of `easyslice_staging` (on-demand backup or PITR
  window confirmed) plus the output of the preflight snapshots stored with the
  change ticket.
- The application deployment that performs the migration must be the staging
  Flyway runner already used for V000001–V000008; no ad-hoc DDL is permitted.

## Step 1: capture read-only evidence

```bash
cloud-sql-proxy --port 9470 nexcut-staging:asia-northeast1:<staging instance id> &
PSQL='psql "host=127.0.0.1 port=9470 dbname=easyslice_staging user=<operator> sslmode=require"'
$PSQL -A -t -f db/staging/preflight/001_flyway_history.sql > staging-evidence/flyway-history.json
$PSQL -A -t --set=iam_user=easyslice-staging-sa@nexcut-staging.iam \
  -f db/staging/preflight/002_asset_import_authority.sql > staging-evidence/schema-authority.json
npx tsx scripts/staging/preflightStagingCloudSql.ts \
  --snapshot staging-evidence \
  --instance nexcut-staging:asia-northeast1:<staging instance id> \
  --plan --po-approval <change ticket id>
```

Both SQL files are single read-only `SELECT json_build_object(...)` statements;
`tests/staging/stagingMigrationPreflight.test.ts` fails if a mutating keyword is
added.

## Expected preflight results

| Condition | `evaluateStagingFlywayHistory` | Meaning |
| :--- | :--- | :--- |
| V000001–V000008 success | `PENDING_MIGRATION`, pending `["9"]` | Ready to apply V000009 |
| V000001–V000009 success | `CURRENT`, pending `[]` | Already applied; do not re-run |
| Any failed row | `BLOCKED` `failed-migration:<version>` | Stop; repair the failed migration |
| Gap, duplicate, unknown version | `BLOCKED` | Stop; reconcile history first |
| Fewer than V000008 | `BLOCKED` `staging-history-behind-approved-baseline-V000008` | Stop; baseline is not the approved one |

Schema readiness additionally requires:

- `current_database() = 'easyslice_staging'` (production `nexcut` is rejected).
- `ck_asset_import_authority` exists, references `platform`, and its definition
  contains `tiktok` and no platform outside `youtube`/`tiktok`.
- The IAM database user equals `easyslice-staging-sa@nexcut-staging.iam`, exists
  in `pg_roles`, and holds `SELECT/INSERT/UPDATE` on
  `workflow.asset_import_requests` plus `SELECT` on `workflow.jobs` and
  `workflow.media`.

`ready=true` and `plan.blocked=false` are the only acceptable states before
applying. Exit code 1 means not ready, 2 means the plan is blocked.

## Step 2: apply (approval required)

Apply through the existing staging migration path (Flyway) so that
`flyway_schema_history` records the checksum for V000009:

```bash
# In the approved staging deployment job, not from a developer machine:
flyway -url="jdbc:postgresql://<staging host>:5432/easyslice_staging" \
  -locations=filesystem:db/workflow/migrations migrate
```

## Expected post-apply state

- `flyway_schema_history` has one additional row: version `9`,
  `success = true`, type `SQL`.
- `scripts/staging/preflightStagingCloudSql.ts --snapshot ...` reports
  `flyway: CURRENT`, `ready: true`, and all checks `PASS`.
- Re-running the snapshot is safe: it is read-only.
- Flyway re-running `migrate` is a no-op (checksum recorded, no new row).

## Rollback and recovery

`V000009` is a constraint replacement and is intentionally **not** reversed by a
down-migration (the repository uses forward-only migrations). Recovery is:

1. Stop the staging deployment that writes asset import requests.
2. Restore the on-demand backup taken in the prerequisites, or perform PITR to
   the timestamp before the migration, following the Cloud SQL console runbook.
3. Verify the restored history with `001_flyway_history.sql` and confirm the
   constraint definition matches V000008.
4. Record the incident against the change ticket before retrying.

Do not hand-edit `flyway_schema_history` and do not delete rows to "reset" the
migration.

## Post-apply verification (staging integration)

After the migration and the staging deployment:

```bash
STAGING_SMOKE_APPROVED=YES npx tsx scripts/staging/verifyTikTokStagingFlow.ts --execute
```

See `blk-05-smoke-test-runbook.md`. The smoke test does not create import
requests, so it neither proves nor requires TikTok upload success; upload
verification needs an authenticated staging session and is part of the
approval-gated staging acceptance.
