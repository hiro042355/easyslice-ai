# Phase 2.70: Final Implementation Handoff for Future Agents (Codex / Engineering Team)

## 1. Context & Purpose
With Jules transitioning to read-only mode after November 11, 2026, this handoff package provides an implementation-agnostic guide for subsequent software engineers or automated agents (such as Codex) to execute Work Package 3 and staging validation without dependency on Jules.

---

## 2. Repository Baseline & Git State
- **Base Baseline SHA:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
- **WP-03 Implementation Commit:** `98c3102c85f5bf78eccdcab73a1346ffa8486b16`
- **Relevant Core Files:**
  1. `.github/workflows/test-postgresql-wp03.yml`: Ephemeral CI integration workflow.
  2. `lib/workflowMigration/localConnectionGuard.ts`: Prevents test connections to remote/cloud DBs.
  3. `lib/workflowMigration/rollbackIsolationHarness.ts`: Multi-stage rollback isolation test harness.
  4. `tests/workflowMigration/localConnectionGuard.test.ts`: Connection guard unit tests.
  5. `tests/workflowMigration/rollbackIsolationHarness.test.ts`: Transaction taint isolation mock tests.
  6. `tests/workflowMigration/stagingMigrationScriptIntegrity.test.ts`: Flyway static integrity tests.
  7. `db/workflow/migrations/V000009__expand_asset_import_platform.sql`: Migration DDL.

---

## 3. Immediate Implementation Tasks (Post-Handoff)

### Task 1: Resolve CI Assertion in `reconciliationMigration.test.ts`
- **Prerequisite:** PO Approval **PO-DEC-01**.
- **File:** `tests/postgresqlTestEnvironment/reconciliationMigration.test.ts`
- **Action:**
  - Update line 89 assertion array to include migrations `000001` through `000009`.
  - Update line 127 `history.rows.length === 3` to `=== 9`.
- **Validation:** Run GitHub Actions workflow `.github/workflows/test-postgresql-wp03.yml`. Expect 100% green check.

### Task 2: Remote Branch Push & CI Trigger
- **Prerequisite:** PO Approval **PO-DEC-04**.
- **Action:** From an authenticated developer machine, push branch `jules-3110607620436353703-ca56d790` to origin.
- **Validation:** Verify execution in GitHub Actions UI.

### Task 3: Staging Cloud SQL Migration Execution
- **Prerequisite:** PO Approval **PO-DEC-02**.
- **Runbook:** Follow `docs/implementation/tiktok-production-readiness/staging-readiness-plan/migration-and-rollback-plan.md`.
- **Validation:** Execute Flyway info and verify state `SUCCESS` for V000009.

---

## 4. Forbidden Operations
- Never execute tests directly against Cloud SQL instances.
- Never hardcode service account keys or bypass WIF credentials.
- Never perform unauthenticated deletes or omit `test-run.<RUN_ID>.<SEQ>` synthetic identifiers.
- Never alter production database schemas without separate PO approval.
