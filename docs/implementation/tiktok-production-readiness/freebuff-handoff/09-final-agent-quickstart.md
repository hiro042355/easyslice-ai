# Deliverable 09: Final Agent Quickstart Manual

## Welcome to the NEXCUT AI TikTok Production Readiness Project

This quickstart is written for Freebuff, Codex, or human software engineers taking over as Jules transitions off active duty.

---

## 1. Environment and State Inspection (First 60 Seconds)
Run these commands immediately upon starting a session:
```bash
git rev-parse HEAD
git status --short
git branch --show-current
```
- Confirm the current commit includes PR #9 merge (`c150f329e317b3c48fda04669423947a5fe4690d`).
- Ensure the working tree is clean.

---

## 2. Immediate Safe Verification Commands (Zero Cost, Offline)
Run the offline test suites to confirm local integrity:
```bash
npx tsx --test tests/workflowMigration/localConnectionGuard.test.ts
npx tsx --test tests/workflowMigration/rollbackIsolationHarness.test.ts
npx tsx --test tests/workflowMigration/stagingMigrationScriptIntegrity.test.ts
npx tsx --test tests/productionMediaRuntime/gcsEnvironmentAuthority.test.ts
npx tsx --test tests/productionMediaRuntime/productionMediaRuntimeAdapters.test.ts
npx tsx --test tests/urlAcquisition/classifyTikTokUrl.test.ts
npx tsx --test tests/urlAcquisition/durableMediaAdmissionValidation.test.ts
```
Expected output: **ALL PASS** (0 failures).

---

## 3. Documents to Read in Order
1. `docs/implementation/tiktok-production-readiness/freebuff-handoff/01-final-staging-architecture.md` (System overview)
2. `docs/implementation/tiktok-production-readiness/freebuff-handoff/03-product-owner-decision-guide.md` (PO-01 through PO-05)
3. `docs/implementation/tiktok-production-readiness/freebuff-handoff/05-file-level-freebuff-roadmap.md` (Implementation tasks)
4. `docs/implementation/tiktok-production-readiness/freebuff-handoff/07-ci-cd-completion-plan.md` (CI fix details)

---

## 4. The Very Next Actionable Task
1. Check if Product Owner approved **PO-DEC-01**.
2. If approved, apply the fix to `tests/postgresqlTestEnvironment/reconciliationMigration.test.ts` (update history row expectation from 3 to 9).
3. Push to branch and watch GitHub Actions workflow `.github/workflows/test-postgresql-wp03.yml`.
