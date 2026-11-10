# Deliverable 10: Remaining Blocker Register

This register details all unresolved blockers, their severity, technical nature, and exact unblocking procedures.

---

| Blocker ID | Category | Severity | Description | Action Required to Unblock | Owner |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BLK-01** | CI / Test | High | CI workflow `.github/workflows/test-postgresql-wp03.yml` fails on Step 11 because `reconciliationMigration.test.ts` expects 3 migrations instead of 9. | PO sign-off on PO-01, then apply 6-line edit in `tests/postgresqlTestEnvironment/reconciliationMigration.test.ts`. | Freebuff / PO |
| **BLK-02** | Staging DB | High | Staging Cloud SQL `easyslice_staging` cannot store TikTok import requests until `V000009` is applied. | PO sign-off on PO-02, then execute Flyway migration against staging Cloud SQL. | Infrastructure / Staging Admin |
| **BLK-03** | Staging Storage | Medium | Staging uploads cannot stream until `easyslice-staging-media-artifacts` GCS bucket is provisioned. | PO sign-off on PO-03, then create bucket with 3-day deletion lifecycle and CORS. | Infrastructure / GCP Admin |
| **BLK-04** | Staging IAM | Medium | Vercel staging deployment cannot acquire credentials without staging WIF and service account bindings. | PO sign-off on PO-04, then configure GCP IAM binding for `easyslice-staging-sa`. | Infrastructure / GCP Admin |
| **BLK-05** | Staging Testing | Medium | End-to-end smoke test on staging cannot run until maintenance window is authorized. | PO sign-off on PO-05, then execute smoke test runbook. | Freebuff / QA |
| **BLK-06** | Sandbox Environment | Low (Environment Constraint) | Nested Docker container extraction fails on devbox sandbox (`failed to convert whiteout file`). | Local container integration tests are delegated to GitHub Actions hosted runners (`ubuntu-latest`). Local dev uses offline unit/mock tests. | Architectural Constraint |
| **BLK-07** | Production Gate | Low (By Design) | Production database, GCS bucket, and TikTok publishing endpoints are strictly locked down. | Remains locked until staging validation gates 1 through 4 are verified green. | Product Owner |
