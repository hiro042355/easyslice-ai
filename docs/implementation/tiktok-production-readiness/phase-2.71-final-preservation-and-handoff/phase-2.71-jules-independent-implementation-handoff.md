# Phase 2.71: Jules-Independent Implementation Handoff Guide

## 1. Executive Notice for Future Engineers & Autonomous Agents (Codex / Others)
As of November 11, 2026, Jules has transitioned to read-only status. This document is the definitive, standalone instruction manual for any subsequent software engineer or AI agent continuing the NEXCUT AI TikTok publisher integration.

**CRITICAL INSTRUCTION:** Before modifying any file, independently inspect the Git repository baseline, check existing branches, and confirm you do not overwrite existing work or violate safety boundaries.

---

## 2. Repository Ground Truth
- **Repository:** `hiro042355/easyslice-ai`
- **Baseline SHA:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
- **WP-03 Commit:** `98c3102c85f5bf78eccdcab73a1346ffa8486b16`
- **Feature Branch:** `tiktok-staging-readiness-plan-3110607620436353703`

---

## 3. Ordered Implementation Backlog

### Step 1: Resolve CI Test Expectation (Pending PO Approval PO-DEC-01)
- **Objective:** Fix the failing assertion in `tests/postgresqlTestEnvironment/reconciliationMigration.test.ts`.
- **Target File:** `tests/postgresqlTestEnvironment/reconciliationMigration.test.ts`
- **Edits:**
  1. Update `history.rows` deepEqual expectation to include versions `000001` through `000009`.
  2. Update `history.rows.length === 3` to `=== 9`.
- **Validation:** Trigger GitHub Actions workflow `.github/workflows/test-postgresql-wp03.yml`. Expect all checks green.

### Step 2: Push Isolated Branch to Remote (Pending PO Approval PO-DEC-04)
- **Objective:** Push commit `98c3102c85f5bf78eccdcab73a1346ffa8486b16` to `origin/feature/wp03-migration-safety-harness`.
- **Validation:** Confirm GitHub Actions workflow triggers automatically on push.

### Step 3: Staging Migration Execution (Pending PO Approval PO-DEC-02)
- **Objective:** Apply `V000009` to staging Cloud SQL database.
- **Runbook:** See `docs/implementation/tiktok-production-readiness/staging-readiness-plan/migration-and-rollback-plan.md`.
- **Validation:** Verify schema history at version `9`.

---

## 4. Absolute Operational Safeguards
1. **Never** connect local test runners to live Cloud SQL instances. The connection guard `localConnectionGuard.ts` will intentionally abort if a non-localhost host is targeted.
2. **Never** delete rows from `workflow.asset_import_requests` without the compound synthetic predicate `((owner_uid LIKE 'test-run.%') IS TRUE)`.
3. **Never** enable paid external AI APIs without explicit PO sign-off.
