# Phase 2.71: CI Status and Failure Reconciliation

## 1. Overview of GitHub Actions Checks

On GitHub Actions, the workflow `.github/workflows/test-postgresql-wp03.yml` was triggered for the WP-03 verification suite:
- **Job Name:** `PostgreSQL 18.4 & V000009 Migration Test`
- **Execution Target:** GitHub-hosted runner (`ubuntu-latest`) using Docker Testcontainers.
- **Components Verified:**
  - Node.js 24 runtime setup.
  - Frozen `npm ci --ignore-scripts` installation.
  - Pinned Docker pull of `postgres:18.4@sha256:c2d4...` and `flyway/flyway:12.6.1@sha256:8764...`.
  - Static migration script integrity (`stagingMigrationScriptIntegrity.test.ts`).
  - Local connection guard enforcement (`localConnectionGuard.test.ts`).
  - Offline rollback isolation harness (`rollbackIsolationHarness.test.ts`).
  - Ephemeral PostgreSQL integration (`reconciliationMigration.test.ts`).

---

## 2. Reconciling the Failure in `reconciliationMigration.test.ts`

### 2.1 The Observed Failure
In both workflow run `42818055598` and `42822248009`, Steps 1 through 10 succeeded completely.
In Step 11 (`reconciliationMigration.test.ts`), Testcontainers started PostgreSQL 18.4, and Flyway executed against `db/workflow/migrations/`.
Flyway reported:
```
Successfully applied 9 migrations to schema "public", now at version v000009
```
However, line 89 of `reconciliationMigration.test.ts` asserts:
```typescript
const history = await environment.pool.query<{ version: string; success: boolean }>(
  "SELECT version, success FROM public.flyway_schema_history WHERE type = 'SQL' ORDER BY installed_rank",
);
assert.deepEqual(history.rows, [
  { version: "000001", success: true },
  { version: "000002", success: true },
  { version: "000003", success: true },
]);
```
Because 9 migrations exist in the directory, `history.rows` contains 9 elements (`000001` through `000009`), causing `ERR_ASSERTION`.

### 2.2 Why This is an Historical Test Gap, Not a Migration DDL Failure
- The PostgreSQL database started successfully.
- Flyway validated and migrated every single SQL script (1 through 9) without SQL syntax or constraint errors.
- Migration V000009 itself succeeded completely in the database.
- The failure was strictly an assertion expectation mismatch in a pre-existing unit test created prior to migrations V000004 through V000009 being merged.

### 2.3 PO Approval Gate for Test Update (`PO-DEC-01`)
Because updating `tests/postgresqlTestEnvironment/reconciliationMigration.test.ts` alters a file committed to baseline `main`, it is governed strictly under **PO-DEC-01**. Once the Product Owner approves updating this test expectation from 3 rows to 9 rows, the check will run 100% green.
