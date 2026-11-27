# Phase 2.71: Final Product Owner Decision Register

This consolidated register separates decisions into established technical decisions, pending Product Owner decisions, and external infrastructure requirements.

---

## 1. Category A: Established Technical Decisions (Ground Truth)
- **TECH-01:** Flyway migration naming format follows `V00000X__description.sql` under schema `workflow`.
- **TECH-02:** Migration `V000009` modifies check constraint `ck_asset_import_authority` to allow `('youtube', 'tiktok')`.
- **TECH-03:** Local connection guard (`localConnectionGuard.ts`) strictly rejects remote database connections.
- **TECH-04:** GCS bucket authority resolver (`resolveAuthorizedBucketName`) maps `production` to `nexcut-prod-jp-2026-media` and `staging` to `easyslice-staging-media-artifacts`.
- **TECH-05:** Workload Identity Federation provider pin is strictly project number `566365202495`.
- **TECH-06:** Synthetic test rows strictly require compound identifier `test-run.<RUN_ID>.<SEQ>`.

---

## 2. Category B: Pending Product Owner Decisions
| Decision ID | Description | Impact & Scope | Options | Recommended Option |
| :--- | :--- | :--- | :--- | :--- |
| **PO-DEC-01** | Approve update to `reconciliationMigration.test.ts` | Resolves CI check `PostgreSQL 18.4 & V000009 Migration Test` by updating expected migration rows from 3 to 9. | A. Update test expectation to 9.<br>B. Target test to version 3. | **Option A** |
| **PO-DEC-02** | Staging Cloud SQL Migration Execution | Authorizes applying `V000009` to staging Cloud SQL database. | A. Authorize execution.<br>B. Defer. | **Option A** during staging window |
| **PO-DEC-03** | Staging GCS Bucket Provisioning | Authorizes creation of `easyslice-staging-media-artifacts` in Google Cloud. | A. Authorize bucket creation.<br>B. Use local emulator. | **Option A** |
| **PO-DEC-04** | Remote Branch Push Authorization | Authorizes developer host to push branch `jules-3110607620436353703-ca56d790` to origin. | A. Authorize push.<br>B. Keep local. | **Option A** |
| **PO-DEC-05** | Production Rollout Authorization | Authorizes production migration and rollout of TikTok import capabilities. | A. Authorize production.<br>B. Hold. | **Option B (Hold)** until staging completes |

---

## 3. Category C: External Infrastructure Dependencies
- **INFRA-01:** GitHub-hosted runners (`ubuntu-latest`) with Docker for container-based PostgreSQL integration tests.
- **INFRA-02:** Google Cloud Platform IAM bindings for staging Workload Identity Pool.
- **INFRA-03:** Staging Cloud SQL instance (`asia-northeast1`) connectivity via authorized proxy.
