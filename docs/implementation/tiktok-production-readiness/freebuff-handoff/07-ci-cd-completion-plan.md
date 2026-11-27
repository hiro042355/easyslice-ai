# Deliverable 07: CI/CD Completion Plan

## 1. CI Workflow Forensics and Root Cause Analysis

### Workflow File Under Inspection
`.github/workflows/test-postgresql-wp03.yml`

### Forensic Diagnosis
1. **GitHub Runner Environment:**
   GitHub Actions hosted runner (`ubuntu-latest`) provides a standard Linux VM with full Docker daemon support, permitting rootless and standard container lifecycles needed by Testcontainers.
2. **Local Sandbox Limitation:**
   The devbox container environment used by development agents runs inside a nested container with restricted overlayfs mounts, causing whiteout file conversion failures (`failed to convert whiteout file ... operation not permitted`) when Docker attempts image layer extraction.
3. **The CI Test Assertion Failure (The Single Code Blocker):**
   Step 11 executes:
   ```bash
   npx tsx --test --test-concurrency=1 tests/postgresqlTestEnvironment/reconciliationMigration.test.ts
   ```
   In this integration test, Flyway applies all migrations present in `db/workflow/migrations/` (`V000001` through `V000009`).
   However, `reconciliationMigration.test.ts` lines 89–94 strictly assert:
   ```typescript
   assert.deepEqual(history.rows, [
     { version: "000001", success: true },
     { version: "000002", success: true },
     { version: "000003", success: true },
   ]);
   ```
   And line 127 asserts `history.rows.length === 3`.
   Because 9 migrations are actually applied, the test throws an `AssertionError: Expected values to be strictly deep-equal` and halts with exit code 1.

---

## 2. Actionable CI Resolution Steps

### Step 1: Obtain PO Approval PO-DEC-01
Confirm sign-off to update the test assertion in `tests/postgresqlTestEnvironment/reconciliationMigration.test.ts`.

### Step 2: Apply the 6-Line Code Change
In `tests/postgresqlTestEnvironment/reconciliationMigration.test.ts`:
Replace:
```typescript
    assert.deepEqual(history.rows, [
      { version: "000001", success: true },
      { version: "000002", success: true },
      { version: "000003", success: true },
    ]);
```
With:
```typescript
    assert.deepEqual(history.rows, [
      { version: "000001", success: true },
      { version: "000002", success: true },
      { version: "000003", success: true },
      { version: "000004", success: true },
      { version: "000005", success: true },
      { version: "000006", success: true },
      { version: "000007", success: true },
      { version: "000008", success: true },
      { version: "000009", success: true },
    ]);
```
And replace:
```typescript
    const facts = [tables.rowCount === 5, foreignKeys.rowCount === 4,
      foreignKeys.rows.every(({ delete_rule }) => delete_rule === "RESTRICT"),
      history.rows.length === 3, metadata.rows[0].migration_head_identifier === "V000002"];
```
With:
```typescript
    const facts = [tables.rowCount === 5, foreignKeys.rowCount === 4,
      foreignKeys.rows.every(({ delete_rule }) => delete_rule === "RESTRICT"),
      history.rows.length === 9, metadata.rows[0].migration_head_identifier === "V000002"];
```

### Step 3: Trigger GitHub Actions Workflow
From the authenticated GitHub repository interface or an authorized local git terminal:
```bash
git add tests/postgresqlTestEnvironment/reconciliationMigration.test.ts
git commit -m "fix(test): align reconciliation migration test history expectation to V000009"
git push origin <branch-name>
```
Or dispatch manually via:
`gh workflow run test-postgresql-wp03.yml --ref <branch-name>`

### Step 4: Verify CI Artifacts and Pass Status
- Check Step 11 execution logs.
- Verify Testcontainers starts `postgres:18.4` and `flyway/flyway:12.6.1`.
- Verify all assertions succeed.
- Download `wp03-postgresql-integration-logs` artifact for archival.
