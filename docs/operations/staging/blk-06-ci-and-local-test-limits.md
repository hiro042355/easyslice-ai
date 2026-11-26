# BLK-06: Docker, Testcontainers, and CI test environment

Status: **resolved as a constraint, with measured local results.** No sandbox or
Docker configuration was modified.

## Current state

| Environment | Docker | PostgreSQL 18.4 + Flyway 12.6.1 Testcontainers | Notes |
| :--- | :--- | :--- | :--- |
| Current development host (Windows, Git Bash) | Docker 29.9.3, engine reachable | **PASS** (measured, see below) | Uses the repository's pinned image digests |
| Earlier devbox sandbox | Nested Docker extraction failed (`failed to convert whiteout file`) | NOT_TESTED | Historical constraint; the repository was never modified to work around it |
| GitHub Actions `ubuntu-latest` | Provided by the runner | PASS | Authoritative environment for DB integration |

## Measured local runs

```
NODE_ENV=test npx tsx --test --test-concurrency=1 \
  tests/postgresqlTestEnvironment/reconciliationMigration.test.ts
→ tests 3, pass 3, fail 0, duration 53.1s

NODE_ENV=test npx tsx --test --test-concurrency=1 \
  tests/postgresqlTestEnvironment/postgresqlFoundationSuite.test.ts
→ tests 5, pass 5, fail 0, duration 43.3s
```

The foundation suite starts PostgreSQL 18.4 from the digest-pinned image, runs
Flyway `migrate` on an empty database, validates the catalog, replays
migrations idempotently, and tears the container down. The reconciliation suite
runs the V000002 reconciliation catalog against the same pinned stack.

Both suites initially failed on stale history/catalog assertions in
`tests/postgresqlTestEnvironment/sliceAMigration.test.ts` (expected 6
migrations, 14 tables, 8 foreign keys, 8 revision tables). The assertions were
corrected to the migrations that actually exist (V000001–V000009, including
`asset_import_requests`, `production_workflow_api_csrf_tokens`, and their
constraints). No assertion was weakened and no test was removed.

## CI execution

`.github/workflows/test-postgresql-wp03.yml` (existing, unchanged):

- `ubuntu-latest`, Node 24, `npm ci --ignore-scripts`.
- Pre-pulls `postgres:18.4@sha256:c2d42a10…` and
  `flyway/flyway:12.6.1@sha256:87647969…`.
- Runs migration script integrity, local connection guard, rollback isolation,
  and the PostgreSQL reconciliation migration suite.
- Uploads `test-results/` on every outcome.

`.github/workflows/staging-readiness.yml` (new):

- Runs the staging preflight/smoke tests, the offline TikTok suites, and both
  staging CLI dry runs (asserting `DRY_RUN`).
- Runs `terraform fmt -check`, `terraform init -backend=false`, and
  `terraform validate` for `infra/staging/gcp`.

## Local vs CI differences

| Aspect | Local (current host) | CI |
| :--- | :--- | :--- |
| Image source | Same digest-pinned images | Same digest-pinned images |
| Node | Host Node (>= 24) | Pinned `24.x` |
| Docker daemon | Desktop engine, host networking | Runner service, no nested sandbox |
| Whole-repository `tsc --noEmit` | 31 pre-existing errors outside the changed files | Not run as a gate (would fail on pre-existing errors) |
| `terraform validate` | Blocked by Windows Application Control on the provider binary | **PASS** (run 45774338951) |
| Staging smoke (`--execute`) | Not permitted (no approval) | Not permitted (no staging secrets/approval in CI) |

## CI results for this branch

- Staging readiness workflow, run 45774338951: **PASS** — offline TikTok and
  staging suites, both CLI dry runs (`DRY_RUN`), `terraform fmt -check`,
  `init -backend=false`, `validate`.
- WP-03 PostgreSQL 18 + Flyway, run 45774339272: **PASS**.
- First run failed on `spawn …/node_modules/ffmpeg-static/ffmpeg ENOENT` because
  `npm ci --ignore-scripts` skips that package's install script. The workflow now
  runs `npm rebuild ffmpeg-static` and `scripts/materializeFfmpegBinary.mjs`
  before the media validation test. The test was not skipped or weakened.

## NOT_TESTED items

- Staging smoke test against `https://staging.nexcut.app` (approval-gated).
- Any test requiring real staging GCP credentials.
- `terraform apply` (approval-gated).

## Why the sandbox is not modified

The earlier failure was a nested-container extraction limitation of that
sandbox, not a repository defect. Changing Docker storage drivers, disabling
seccomp, or running privileged containers would weaken the environment and is
out of scope. The repository's CI runs the same pinned images on a hosted
runner, which is the supported path for container integration tests.
