# Phase 2.70: Synthetic Taint Purge Safety Review

## 1. Safety Objectives
Synthetic verification tests in staging generate rows in `workflow.asset_import_requests`. A synthetic purge mechanism must safely remove these records during rollback or post-test cleanup without risking real user assets, staging analytics, or production data.

---

## 2. Protected Data Assets (Strict Prohibition)
The purge process is strictly prohibited from touching or modifying:
1. Real user records (`owner_uid` corresponding to actual Firebase UIDs, e.g. alphanumeric 28-character strings).
2. Production media assets in GCS (`nexcut-prod-jp-2026-media`).
3. Publication records in Bilibili or other publication tables.
4. OAuth credentials and tokens.
5. Real workflow executions.
6. Staging data outside the explicitly authorized test run.

---

## 3. Positive Identification & Compound Identifiers
A broad `DELETE` query based on timestamps (e.g. `created_at > NOW() - interval '1 hour'`) or loose patterns is **strictly forbidden**.
Positive identification requires:
- **Compound Identifier Format:**
  ```
  test-run.<RUN_ID>.<SEQUENCE_NUMBER>
  ```
- **Example:** `owner_uid = 'test-run.e45307be4de3288b.001'`
- **Validation:** Every test execution generates a cryptographically random 16-hex `RUN_ID`. Synthetic records must match this exact prefix.

---

## 4. Safe Deletion Predicates & NULL-Safety
SQL queries must employ NULL-safe comparison operators to avoid dereferencing issues:
```sql
-- Safe synthetic purge query
DELETE FROM workflow.asset_import_requests
WHERE platform = 'tiktok'
  AND ((owner_uid LIKE 'test-run.%') IS TRUE)
  AND ((owner_uid LIKE ('test-run.' || $1 || '.%')) IS TRUE);
```
- By using `((...) IS TRUE)`, any `NULL` value evaluates to `FALSE` rather than propagating an unknown truth value.

---

## 5. Audit & Dry-Run Protocol
1. **Pre-flight Audit:** Prior to issuing any deletion, query the count of matching rows and assert that zero non-synthetic rows match.
2. **Dry-Run Output:** Log the exact primary keys (`request_id`) to be deleted.
3. **Transaction Isolation:** Execute within a serializable transaction block (`BEGIN ... COMMIT`).
4. **Post-check Audit:** Verify that matching count is exactly 0 and total table count decreased by exactly the dry-run count.
