# Phase 2.50: WP-03 GitHub Actions Integration Feasibility Audit Report

**Execution Mode:** STRICT READ-ONLY INVESTIGATION AND SPECIFICATION
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Safety)

---

## 1. Executive Summary

In Phase 2.49, GitHub-hosted Actions runners (`ubuntu-latest`) were identified as the most viable, isolated, and reproducible environment to execute the physical PostgreSQL 18 Testcontainers integration test suite, bypassing the local devbox overlayfs whiteout limitation without host taint.

In this phase, we performed an exhaustive read-only audit of the existing test harness architecture to determine whether:
1. GitHub-hosted runners satisfy all physical Docker daemon, Node.js 24, and Testcontainers requirements.
2. A GitHub Actions service container (`services.postgres`) can be used directly or whether Testcontainers is mandatory.
3. The exact cryptographic image pins (`postgres:18.4@sha256:...` and `flyway:12.6.1@sha256:...`) are preserved.

**Core Audit Finding:**
The repository's database integration harness (`lib/postgresqlTestEnvironment/foundation.ts:39-68`) is architecturally hardcoded to start an internal `PostgreSqlContainer` and invoke Flyway via a Testcontainers `GenericContainer(FLYWAY_COMMUNITY_IMAGE)`. It does **not** connect to an external static PostgreSQL service container unless rewritten. Therefore, **Docker daemon access via Testcontainers on `ubuntu-latest` is mandatory**, and GitHub Actions service containers alone are insufficient. Standard GitHub-hosted `ubuntu-latest` runners provide full root Docker daemon access with support for overlayfs whiteouts, perfectly satisfying this requirement.

---

## 2. Existing WP-03 Test Harness Architecture & Requirements

### 2.1 Hardcoded Testcontainers Dependencies (`lib/postgresqlTestEnvironment/foundation.ts:39-72`)
- The harness imports `PostgreSqlContainer` from `@testcontainers/postgresql` and `Network`, `GenericContainer` from `testcontainers`.
- It programmatically launches:
  ```typescript
  network = await new Network().start();
  postgres = await new PostgreSqlContainer(POSTGRESQL_TEST_IMAGE)...start();
  ```
- Flyway migrations are subsequently invoked inside `runFlywayCommand` (`lib/postgresqlTestEnvironment/flywayRunner.ts:16-35`), which launches `GenericContainer(FLYWAY_COMMUNITY_IMAGE)` connected to the same container network.
- **Service Container Incompatibility:** Because `foundation.ts` encapsulates both PostgreSQL container lifecycle and Flyway container orchestration through the Docker socket, passing a standard static GitHub Actions `services: postgres` host/port would require refactoring the foundation harness. Running Testcontainers directly against the GitHub runner's native Docker daemon requires **zero code modifications**.

### 2.2 Exact Runtime Requirements
- **Node.js:** Requires `nodeMajor >= 24` (enforced by `lib/postgresqlTestEnvironment/environmentValidator.ts:20`).
- **NPM & Lockfile:** npm `v11.x` with immutable `package-lock.json` (`npm ci`).
- **Docker Daemon:** Requires `/var/run/docker.sock` with capability to extract OCI whiteouts (standard on GitHub-hosted Ubuntu runners).
- **Parallelism:** Tests use ephemeral database names and randomized credentials (`ephemeralIdentifier("foundation")`), making them parallel-safe across separate jobs.

---

## 3. GitHub Actions Workflow Design (`.github/workflows/test-postgresql-wp03.yml`)

The complete proposed workflow specification is designed below (strictly for planning/approval; **not created on disk**):

```yaml
name: "WP-03: PostgreSQL 18 & Flyway Integration Test"

on:
  workflow_dispatch:
    inputs:
      run_rollback_tests:
        description: "Execute conservative rollback verification"
        required: true
        default: "true"
        type: boolean

permissions:
  contents: read

jobs:
  postgresql-integration:
    name: "PostgreSQL 18.4 & V000009 Migration Test"
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: "Checkout Repository at Verified Baseline"
        uses: actions/checkout@v4
        with:
          persist-credentials: false

      - name: "Set up Node.js 24 Runtime"
        uses: actions/setup-node@v4
        with:
          node-version: "24.x"
          cache: "npm"

      - name: "Install Frozen Dependencies"
        run: npm ci --ignore-scripts

      - name: "Pre-Pull Exact Pinned Docker Images"
        run: |
          docker pull postgres:18.4@sha256:c2d42a104eb6b37b286a2d9c5cf83f349de4d6516d513d00a2bd9610e2c2e5e4
          docker pull flyway/flyway:12.6.1@sha256:876479697e6f272e7897f9cebc5d43090e4e7ba164de9eb11e07767bff075011

      - name: "Execute Staging Migration Script Integrity Tests"
        run: npx tsx --test tests/workflowMigration/stagingMigrationScriptIntegrity.test.ts

      - name: "Execute Local Connection Guard Authority Tests"
        run: npx tsx --test tests/workflowMigration/localConnectionGuard.test.ts

      - name: "Execute Rollback Isolation & Transaction Mock Harness Tests"
        run: npx tsx --test tests/workflowMigration/rollbackIsolationHarness.test.ts

      - name: "Execute Full PostgreSQL 18 Testcontainers Reconciliation Suite"
        run: npx tsx --test --test-concurrency=1 tests/postgresqlTestEnvironment/reconciliationMigration.test.ts
        env:
          NODE_ENV: test
          DEBUG: testcontainers*

      - name: "Upload Test Execution Logs"
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: postgresql-test-logs
          path: |
            *.log
          retention-days: 7
```

---

## 4. Cost, Billing, & Security Boundaries

1. **Repository Visibility & Billing:**
   - If `hiro042355/easyslice-ai` is a **public repository**, GitHub Actions standard Linux runners (`ubuntu-latest`) are **100% free with unlimited minutes**.
   - If the repository is **private**, execution consumes included free plan minutes (2,000 min/month on Free tier). A 15-minute run consumes 15 minutes (multiplier 1.0x).
   - Artifact storage: Storing execution logs for 7 days consumes negligible storage (< 5 MB), well within the 500 MB free allowance.
2. **Zero Secrets or Credentials Required:**
   - The workflow uses only synthetic local database containers.
   - Requires **ZERO repository secrets**, zero Firebase keys, zero GCP service account keys, and zero TikTok tokens.
   - Permissions are restricted to `contents: read`.

---

## 5. Required Product Owner Approvals

To execute this plan in a subsequent phase, the following explicit PO approvals are required:
1. **Approval to Create Workflow File:** Authorize placing `.github/workflows/test-postgresql-wp03.yml` in the repository.
2. **Approval to Push Verification Branch:** Authorize pushing `jules-3110607620436353703-ca56d790` to remote `origin` to allow GitHub Actions to trigger.
3. **Approval to Dispatch Workflow:** Authorize executing the workflow via GitHub UI or API.

*(Note: PO-01 through PO-05 remain strictly unapproved; this CI verification applies exclusively to local/ephemeral test containers).*

---

## 6. Deliverables & Safety Confirmations

- **Deliverables Created (Untracked `??`):**
  - `docs/implementation/tiktok-production-readiness/phase-2.50-github-actions-feasibility/github-actions-feasibility-report.md`
  - `docs/implementation/tiktok-production-readiness/phase-2.50-github-actions-feasibility/evidence-manifest.json`
- **Safety Boundary Statement:**
  - Zero workflow files were created in `.github/workflows/`.
  - Zero GitHub Actions runs were triggered.
  - Zero branches were pushed.
  - Zero external resources were provisioned.
  - Git index state and baseline HEAD (`e8338e8...`) are 100% preserved.

---

## 7. Final Decision

### Exact Decision:
## `WORKFLOW_DESIGN_READY_FOR_APPROVAL`

*(Justification: The existing test harness dependencies, Docker socket requirements, and Node.js 24 constraints have been fully mapped to an idiomatic GitHub Actions workflow specification that preserves exact image digests and requires zero repository secrets or code changes. The specification is ready for Product Owner review and approval).*
