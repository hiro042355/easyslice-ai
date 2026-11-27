# Phase 2.46: WP-03 Runtime Evidence Supplement & Test Coverage Mapping Report

**Execution Mode:** STRICT READ-ONLY INVESTIGATION
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Safety)

---

## 1. Baseline Git State & Exit Code Differentiation

The authoritative baseline and Git state were verified via read-only inspection commands:
- **`git rev-parse HEAD`:** `e8338e8b7dcd731dc9b494204e16749fc4918869` (Baseline HEAD unchanged).
- **`git branch --show-current`:** `jules-3110607620436353703-ca56d790`.
- **`git diff --cached --name-only | wc -l`:** Exactly **74 files** staged in the Git index.
- **`git diff --quiet` (exit code: 0):** Zero unstaged modifications in working tree.
- **`git diff --cached --quiet` (exit code: 1):** Staged changes exist relative to HEAD.
- **State Preservation:** All 74 staged files are preserved intact; zero Git mutations were executed.

---

## 2. Raw Runtime Evidence

Exact commands and unedited outputs captured from the runtime environment:

### 2.1 Node.js and NPM Discovery
- **`node -v`:**
  ```text
  v22.22.1
  ```
- **`npm -v`:**
  ```text
  11.11.0
  ```
- **`which node`:**
  ```text
  /home/jules/.nvm/versions/node/v22.22.1/bin/node
  ```
- **`which npm`:**
  ```text
  /home/jules/.nvm/versions/node/v22.22.1/bin/npm
  ```
- **Installed Node.js Version Discovery (`nvm ls`):**
  - `v18.20.8`
  - `v20.20.1`
  - `v22.22.1` (active)
  - Node.js 24.x is **NOT installed locally**.
- **Actual Source Lines Enforcing Node.js >= 24 (`lib/postgresqlTestEnvironment/environmentValidator.ts:18-22`):**
  ```typescript
  const nodeMajor = Number.parseInt(environment.nodeVersion.split(".")[0] ?? "", 10);

  if (!Number.isInteger(nodeMajor) || nodeMajor < 24) {
    throw new Error("postgresql-foundation-node-version-unsupported");
  }
  ```

### 2.2 Docker & Daemon Status
- **`docker --version`:**
  ```text
  Docker version 29.2.1, build a5c7197
  ```
- **`docker image ls --digests`:**
  ```text
  REPOSITORY   TAG       DIGEST    IMAGE ID   CREATED   SIZE
  ```
  *(Output is empty header: 0 images present in local cache).*
- **Docker Socket Existence and Permissions:**
  ```text
  $ ls -la /var/run/docker.sock
  srw-rw---- 1 root docker 0 Mar  6  2026 /var/run/docker.sock
  ```
  Docker daemon is reachable and running, but the local image cache contains zero images.

---

## 3. Package Manager & Future Test Commands

- **Package Manager:** npm `v11.11.0`.
- **Lockfile Support:** `package-lock.json` present (version 3). Immutable frozen installation supported via `npm ci`.
- **Future Test Commands Sequence:**
  1. Unit and static script verification:
     `npx tsx --test tests/workflowMigration/stagingMigrationScriptIntegrity.test.ts` (Requires Node.js >= 18; works on Node 22).
  2. Rollback harness logic & mock state tests:
     `npx tsx --test tests/workflowMigration/rollbackIsolationHarness.test.ts` (Requires Node.js >= 18; works on Node 22).
  3. Local connection guard validation:
     `npx tsx --test tests/workflowMigration/localConnectionGuard.test.ts` (Requires Node.js >= 18; works on Node 22).
  4. Full PostgreSQL 18 Testcontainers integration tests:
     `npx tsx --test tests/postgresqlTestEnvironment/reconciliationMigration.test.ts` (Requires Node.js >= 24 and Testcontainers image pulls).
- **Network / Pull Prevention:**
  In Testcontainers, image pulls cannot be prevented if the local image cache is empty. Pulling the pinned images requires network egress and explicit authorization.

---

## 4. Test Coverage Mapping Across All 12 Verification Steps

| Step # | Verification Step | Source File | Existing Test File | Test Type | Current Evidence | Missing Verification | Required Future Runtime |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | Environment Validation | `environmentValidator.ts` | `environmentValidator.test.ts` | Unit | Assertions pass for Node 24 | Real execution under Node 24 | Node.js >= 24 |
| **2** | PostgreSQL 18 Container Startup | `foundation.ts` | `reconciliationMigration.test.ts` | Testcontainers | Harness implemented | Live container launch log | Docker daemon + Node 24 |
| **3** | Apply V000008 Migration | `V000008` migration file | `stagingMigrationScriptIntegrity.test.ts` | Static analysis | Schema tokens matched | Live DB table creation | PostgreSQL 18 + Flyway |
| **4** | Apply V000009 Migration | `V000009` migration file | `stagingMigrationScriptIntegrity.test.ts` | Static analysis | DDL tokens matched | Live DB DDL execution | PostgreSQL 18 + Flyway |
| **5** | Verify CHECK Constraints | `information_schema.check_constraints` | N/A | None | File assertions only | Live catalog query result | PostgreSQL 18 |
| **6** | Synthetic Fixture Ingestion | Fixture generator in test | N/A | None | Code specifications | Live DB INSERT rows | PostgreSQL 18 |
| **7** | Rollback Precheck Audit | `rollbackIsolationHarness.ts` | `rollbackIsolationHarness.test.ts` | Mock client | 12 mock scenarios pass | Real SQL audit on table | PostgreSQL 18 |
| **8** | Controlled Rollback Deletion | `executeConservativeRollback` | `rollbackIsolationHarness.test.ts` | Mock client | Mock deletion passes | Real DELETE on table | PostgreSQL 18 |
| **9** | Postcheck Audit | `POSTCHECK_AUDIT` query | `rollbackIsolationHarness.test.ts` | Mock client | Mock zero-count passes | Real table zero-row log | PostgreSQL 18 |
| **10** | Constraint Restoration | Atomic DDL DROP & ADD | `stagingMigrationScriptIntegrity.test.ts` | Static analysis | DDL strings verified | Live DDL constraint restore | PostgreSQL 18 |
| **11** | Transaction Failure Tests | Error injection harness | `rollbackIsolationHarness.test.ts` | Mock client | 5 transaction states pass | Live socket abort proof | PostgreSQL 18 |
| **12** | Connection Cleanup & Taint Disposal | `client.release(true)` | `rollbackIsolationHarness.test.ts` | Mock client | Mock disposal verified | Live pool release proof | PostgreSQL 18 |

---

## 5. Node.js 24 Runtime Options Analysis

1. **Local Node.js 24 Runtime:**
   - *Status:* **UNAVAILABLE**. Sandbox has Node `v22.22.1`. System search across `/` confirmed zero Node 24 binaries.
2. **Authorized CI Runtime:**
   - *Status:* **UNAVAILABLE**. No `.github/workflows` or CI runners configured in repository.
3. **Authorized Remote Dev Environment:**
   - *Status:* **UNAVAILABLE**. No remote dev environment provisioned or authorized.
4. **Docker-Based Node.js 24 Container Runtime:**
   - *Status:* **NOT AVAILABLE LOCALLY** (Image cache is empty).
   - *Technical Viability:* Running an ephemeral container with an approved pinned Node 24 image (`node:24-bookworm@sha256:...`) mounting the repo is technically sound, but **requires explicit approval** to pull the image.

---

## 6. Image Pin Verification

Reconfirmed from physical source in `lib/postgresqlTestEnvironment/constants.ts`:

- **`POSTGRESQL_TEST_IMAGE` (Line 1–2):**
  `postgres:18.4@sha256:c2d42a104eb6b37b286a2d9c5cf83f349de4d6516d513d00a2bd9610e2c2e5e4`
  - Digest Pinned: **YES**
  - Locally Cached: **NO** (`docker image ls` is empty)
- **`FLYWAY_COMMUNITY_IMAGE` (Line 4–5):**
  `flyway/flyway:12.6.1@sha256:876479697e6f272e7897f9cebc5d43090e4e7ba164de9eb11e07767bff075011`
  - Digest Pinned: **YES**
  - Locally Cached: **NO** (`docker image ls` is empty)

---

## 7. Authorization Boundary Matrix

All approval states remain strictly unapproved:

| Approval Item | Current State | Required Authority | Scope |
| :--- | :--- | :--- | :--- |
| **PO-01** | `REQUIRES_PO_APPROVAL` | Product Owner | Staging Cloud SQL Migration `V000009` |
| **PO-02** | `REQUIRES_PO_APPROVAL` | Product Owner | Staging GCS Bucket Provisioning |
| **PO-03** | `REQUIRES_PO_APPROVAL` | Product Owner | Staging GCS IAM `roles/storage.objectAdmin` Binding |
| **PO-04** | `REQUIRES_PO_APPROVAL` | Product Owner | Firebase Staging QA Test User & Identity |
| **PO-05** | `REQUIRES_PO_APPROVAL` | Product Owner | 2-Hour Controlled Staging Smoke Test |
| **TP-WIF** | Separate Prerequisite | Tech Lead / PO | Staging WIF Pool & Provider Configuration |
| **TP-VIDEO** | Separate Prerequisite | Tech Lead / PO | Authorized TikTok Test Video Selection |
| **Node 24 / Docker Pull** | Separate Authorization | Gatekeeper / PO | Pulling pinned images to run local test harness |

---

## 8. Git Preservation Confirmation

- **Baseline HEAD:** `e8338e8b7dcd731dc9b494204e16749fc4918869` (Preserved).
- **Current Branch:** `jules-3110607620436353703-ca56d790`.
- **Actual Staged File Count:** Exactly **74 files** preserved in index.
- **Working Tree Cleanliness:** `git diff --quiet` (Exit code: 0).
- **Index State:** `git diff --cached --quiet` (Exit code: 1).
- **Deliverables:** Only the two intended Phase 2.46 deliverables were created as untracked files (`??`).

---

## 9. Final Decision

### Exact Decision:
## `NO_VERIFIED_NODE24_AND_POSTGRESQL_TEST_RUNTIME`

*(Justification: The local environment runs Node v22.22.1 while `environmentValidator.ts` requires Node.js >= 24. No local Node 24 binary exists, no CI runner is configured, and the Docker image cache is empty. Therefore, no verified runtime capable of executing the pinned Testcontainers harness is currently available without external pulls or modifications).*
