# Phase 2.51: WP-03 Revised GitHub Actions Workflow Specification

**Execution Mode:** STRICT READ-ONLY SPECIFICATION REVISION
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Safety)

---

## 1. Executive Summary & Specification Purpose

This document provides the revised, production-grade specification for the proposed GitHub Actions workflow `.github/workflows/test-postgresql-wp03.yml`.

In accordance with Phase 2.51 directives, this workflow:
1. **Requires Zero Worktree Mutations:** Presented purely as a Markdown specification; **not created on disk or in Git**.
2. **Executes Rollback Tests Unconditionally:** Removed optional/conditional inputs (`run_rollback_tests`); rollback safety tests execute on every dispatch.
3. **Enforces Deterministic SHA Verification:** Compares the checked-out commit HEAD against the expected verification commit (`e8338e8...`) and halts fail-closed on mismatch.
4. **Captures Comprehensive Diagnostic Logs:** Pipes Node and Testcontainers output directly to dedicated log files for artifact archiving.
5. **Preserves Exact Pinned Image Digests:** Guarantees exact byte-for-byte fidelity with `postgres:18.4@sha256:...` and `flyway:12.6.1@sha256:...`.
6. **Eliminates Secrets & External Connectivity:** Uses strictly synthetic test data and isolated ephemeral Docker containers on standard `ubuntu-latest` runners.

---

## 2. Revised Workflow Specification (Design-Only Code Block)

```yaml
name: "WP-03: PostgreSQL 18 & Flyway Integration Test"

on:
  workflow_dispatch:
    inputs:
      expected_commit_sha:
        description: "Expected verified Git commit SHA (fail-closed if mismatched)"
        required: true
        default: "e8338e8b7dcd731dc9b494204e16749fc4918869"
        type: string

permissions:
  contents: read

jobs:
  postgresql-integration:
    name: "PostgreSQL 18.4 & V000009 Migration Test"
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: "Step 1: Checkout Repository at Dispatched Ref"
        uses: actions/checkout@v4
        with:
          persist-credentials: false

      - name: "Step 2: Deterministic Baseline Commit Verification"
        run: |
          echo "=== Git Ref and Commit Audit ==="
          echo "github.ref: ${{ github.ref }}"
          echo "github.sha: ${{ github.sha }}"
          ACTUAL_HEAD=$(git rev-parse HEAD)
          echo "git rev-parse HEAD: ${ACTUAL_HEAD}"
          EXPECTED_SHA="${{ inputs.expected_commit_sha }}"
          echo "expected_commit_sha input: ${EXPECTED_SHA}"

          if [ "${ACTUAL_HEAD}" != "${EXPECTED_SHA}" ]; then
            echo "::error::Baseline SHA mismatch! Expected ${EXPECTED_SHA}, but checked out ${ACTUAL_HEAD}. Aborting."
            exit 1
          fi
          echo "Baseline commit verified successfully: ${ACTUAL_HEAD}"

      - name: "Step 3: Set up Node.js 24 Runtime"
        uses: actions/setup-node@v4
        with:
          node-version: "24.x"
          cache: "npm"

      - name: "Step 4: Runtime Environment Inspection"
        run: |
          echo "=== Node & NPM Runtime Audit ==="
          node -v
          npm -v
          docker --version
          docker info

      - name: "Step 5: Install Frozen Dependencies"
        run: npm ci --ignore-scripts

      - name: "Step 6: Pre-Pull Exact Digest-Pinned Docker Images"
        run: |
          echo "=== Pulling Pinned PostgreSQL 18.4 Image ==="
          docker pull postgres:18.4@sha256:c2d42a104eb6b37b286a2d9c5cf83f349de4d6516d513d00a2bd9610e2c2e5e4

          echo "=== Pulling Pinned Flyway Community 12.6.1 Image ==="
          docker pull flyway/flyway:12.6.1@sha256:876479697e6f272e7897f9cebc5d43090e4e7ba164de9eb11e07767bff075011

      - name: "Step 7: Execute Static Migration Script Integrity Tests"
        run: |
          mkdir -p test-results
          npx tsx --test tests/workflowMigration/stagingMigrationScriptIntegrity.test.ts 2>&1 | tee test-results/staging-migration-script-integrity.log

      - name: "Step 8: Execute Local Connection Guard Authority Tests"
        run: |
          npx tsx --test tests/workflowMigration/localConnectionGuard.test.ts 2>&1 | tee test-results/local-connection-guard.log

      - name: "Step 9: Execute Unconditional Rollback Isolation & Transaction Mock Tests"
        run: |
          npx tsx --test tests/workflowMigration/rollbackIsolationHarness.test.ts 2>&1 | tee test-results/rollback-isolation-harness.log

      - name: "Step 10: Execute Full PostgreSQL 18 Testcontainers Integration Suite"
        run: |
          npx tsx --test --test-concurrency=1 tests/postgresqlTestEnvironment/reconciliationMigration.test.ts 2>&1 | tee test-results/postgresql-reconciliation-migration.log
        env:
          NODE_ENV: test
          DEBUG: testcontainers*

      - name: "Step 11: Collect Docker Daemon & Container Diagnostics"
        if: always()
        run: |
          docker ps -a > test-results/docker-containers-post-test.log 2>&1 || true
          docker image ls --digests > test-results/docker-images-post-test.log 2>&1 || true

      - name: "Step 12: Upload Execution Logs & Diagnostic Artifacts"
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: wp03-postgresql-integration-logs
          path: test-results/
          retention-days: 7
          if-no-files-found: error
```

---

## 3. Technical Resolution of Gatekeeper Issues

### WP-01: `workflow_dispatch` Default-Branch Feasibility & Recommended Sequence
- **GitHub Requirement:** In GitHub Actions, a workflow file triggered by `workflow_dispatch` **must exist on the repository's default branch (`main`)** for GitHub's UI and API to recognize it as a valid dispatchable workflow.
- **Targeting Non-Default Branches:** Once present on the default branch, `workflow_dispatch` allows the user to explicitly select any branch (e.g. `jules-3110607620436353703-ca56d790`) as the execution target. The runner will then check out the files from that specified branch.
- **Recommended Execution Sequence:**
  1. Product Owner authorizes creating `.github/workflows/test-postgresql-wp03.yml`.
  2. The workflow file is committed and merged into `main` via PR, or the verification branch is pushed and evaluated.
  3. The workflow is dispatched via GitHub Actions UI selecting `ref: jules-3110607620436353703-ca56d790`.

### WP-02: Unconditional Rollback Test Execution Policy
- The input `run_rollback_tests` has been completely eliminated.
- In WP-03 CI, all rollback isolation tests, eligibility predicates, and transaction failure simulations execute **unconditionally** in Step 9.
- All rollback tests use ephemeral mock clients and synthetic local fixtures; zero remote or persistent database connections can be made.

### WP-03: Deterministic Checkout SHA Verification
- **Architecture:** The workflow accepts `expected_commit_sha` as a required input with default `e8338e8b7dcd731dc9b494204e16749fc4918869`.
- In Step 2, the workflow asserts `git rev-parse HEAD == expected_commit_sha`.
- If a developer or runner checks out an outdated, stale, or tampered branch, the step fails immediately with an error annotation, aborting the job before any dependencies are installed or containers launched.

### WP-04: Test Log & Diagnostic Artifact Strategy
- In Steps 7–10, all test runner invocations pipe stdout and stderr through `tee` to individual log files in `test-results/`.
- Step 11 captures Docker container status and image digests.
- Step 12 uses `actions/upload-artifact@v4` with `if: always()` to guarantee that diagnostic logs are preserved for 7 days even if a test assertion fails.

### WP-05: Security, Permissions & Billing Revalidation
- **Permissions:** Strict least-privilege `contents: read`.
- **Secrets:** Zero repository secrets or external credentials required.
- **Network Boundaries:** Testcontainers binds ports to internal bridge networks only.
- **Billing:** Zero incremental cloud billing; standard public repository execution is 100% free.

---

## 4. Status Conclusion

## `WORKFLOW_SPECIFICATION_READY_FOR_GATEKEEPER_REVIEW`
