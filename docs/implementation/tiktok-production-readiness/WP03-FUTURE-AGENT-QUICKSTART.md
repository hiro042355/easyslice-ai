# WP-03 Future Agent Quickstart

## 1. Quickstart Overview
This guide provides direct, step-by-step instructions for future autonomous agents (e.g., Codex) or software engineers picking up Work Package 3 (WP-03).

---

## 2. Immediate Initial Inspection
Before performing any modification:
```bash
git rev-parse HEAD
git status --short
git branch --show-current
```
- Confirm the commit baseline includes PR #8 merge (`e8338e8b7dcd731dc9b494204e16749fc4918869`).
- Ensure the tree is clean before starting new changes.

---

## 3. Documents to Read First
1. `docs/implementation/tiktok-production-readiness/WP03-FINAL-ARCHITECTURE-ARCHIVE.md` (Master index)
2. `docs/implementation/tiktok-production-readiness/phase-2.71-final-preservation-and-handoff/phase-2.71-jules-independent-implementation-handoff.md` (Actionable backlog)
3. `docs/implementation/tiktok-production-readiness/phase-2.70-final-design-preservation/phase-2.70-ci-failure-forensic-report.md` (CI root cause)

---

## 4. How to Run Safe Offline Tests
Run the offline unit and contract suites without Docker:
```bash
npx tsx --test tests/workflowMigration/localConnectionGuard.test.ts
npx tsx --test tests/workflowMigration/rollbackIsolationHarness.test.ts
npx tsx --test tests/workflowMigration/stagingMigrationScriptIntegrity.test.ts
```

---

## 5. First Implementation Task
- **Under PO Approval `PO-DEC-01`:** Update `tests/postgresqlTestEnvironment/reconciliationMigration.test.ts` lines 89-94 to expect all 9 migrations, and line 127 from `length === 3` to `length === 9`.
- **Validation:** Trigger `.github/workflows/test-postgresql-wp03.yml` via GitHub Actions.
