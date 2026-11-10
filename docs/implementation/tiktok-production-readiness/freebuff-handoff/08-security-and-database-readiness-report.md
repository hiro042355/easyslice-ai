# Deliverable 08: Security and Database Readiness Report

## 1. Database Safety Audit & Lock Impact

### Migration V000009 DDL Operation
```sql
ALTER TABLE workflow.asset_import_requests
  DROP CONSTRAINT IF EXISTS ck_asset_import_authority;

ALTER TABLE workflow.asset_import_requests
  ADD CONSTRAINT ck_asset_import_authority
  CHECK (platform IN ('youtube', 'tiktok'));
```

### Lock Analysis
- **Lock Type:** `ACCESS EXCLUSIVE` on `workflow.asset_import_requests`.
- **Concurrency Impact:** Blocks concurrent `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on this table.
- **Duration:** Because dropping and re-adding a check constraint without `VALIDATE` scans the existing table data, on a table with `< 100,000` rows this takes `< 25ms`.
- **Pre-Execution Guard:**
  ```sql
  SET LOCAL lock_timeout = '2000ms';
  SET LOCAL statement_timeout = '5000ms';
  ```
  If any conflicting long-running read holds a lock, the statement times out immediately rather than queuing up behind the DDL and blocking incoming web traffic.

---

## 2. Rollback Isolation and Synthetic Taint Purge

### Rollback Contract
Rolling back `V000009` requires restoring the `'youtube'`-only constraint. If rows with `platform = 'tiktok'` were admitted, Postgres will abort constraint re-creation. Therefore, the rollback harness (`lib/workflowMigration/rollbackIsolationHarness.ts`) enforces a 5-state transactional lifecycle:
1. `PRECHECK_AUDIT`: Assert presence of any records with `platform = 'tiktok'`.
2. `IDENTIFY_ORPHANS`: Find child records referencing TikTok import requests.
3. `CASCADE_SAFE_DELETE`: Delete or archive TikTok records.
4. `RESTORE_CONSTRAINT`: Re-apply `CHECK (platform IN ('youtube'))`.
5. `POSTCHECK_AUDIT`: Verify zero violation states remain.

### Synthetic Taint Isolation
To prevent tests from corrupting shared or staging environments, all automated tests use compound synthetic identifiers:
- `owner_uid` MUST match `test-run.<RUN_ID>.<SEQ>`.
- Any cleanup query MUST enforce:
  ```sql
  WHERE ((owner_uid LIKE 'test-run.%') IS TRUE)
  ```
  Unconditional deletes without this exact predicate are blocked by static tests.

---

## 3. Storage and Identity Security Boundaries

### GCS Bucket Authority
`lib/server/productionMediaRuntime/gcsAdapter.ts` enforces fail-closed bucket naming:
- Production: `nexcut-prod-jp-2026-media`
- Staging: `easyslice-staging-media-artifacts`
- Any unexpected environment string immediately throws `UNAUTHORIZED_BUCKET_ENVIRONMENT`.

### Google Cloud Workload Identity Federation (WIF)
- Production Project Number is strictly pinned to `566365202495`.
- Provider format: `projects/566365202495/locations/global/workloadIdentityPools/nexcut-prod-vercel/providers/vercel-production`.
- Token exchanges use short-lived OIDC federated tokens (no long-lived JSON service account keys stored on Vercel).

### Cloud SQL Connection Tuple Verification
`lib/server/productionMediaRuntime/cloudSqlAdapter.ts` validates the exact connection tuple for production:
- Instance: `nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql`
- Database: `nexcut`
- IAM User: `nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam`
Staging configurations must supply isolated staging connection parameters.
