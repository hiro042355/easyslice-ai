# Phase 2.54: Final WP-03 CI Workflow Specification

**Execution Mode:** STRICT READ-ONLY SPECIFICATION CORRECTION
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Safety)

---

## 1. Specification Corrections & Architectural Hardening

### WP-01: Workflow Registration vs Verification Branch Separation
In Phase 2.53, committing the workflow file directly onto the verification branch was proposed.
- **Critical Flaw:** Adding a commit to the verification branch changes its HEAD SHA from `e8338e8...` to a new commit hash. Consequently, when Step 3 asserts `git rev-parse HEAD == APPROVED_BASELINE_SHA`, the assertion fails immediately!
- **Preferred Architecture (Clean Branch Separation):**
  1. **Workflow Registration Branch:** Create a dedicated, isolated branch (`feature/wp03-ci-workflow`) containing only `.github/workflows/test-postgresql-wp03.yml`.
  2. **PR to Default Branch (`main`):** Open a PR to merge `feature/wp03-ci-workflow` into `main`.
  3. **Product Owner Merge Approval:** Product Owner reviews and merges the PR into `main`. This registers the workflow definition on GitHub's default branch as required by GitHub's `workflow_dispatch` API.
  4. **Pristine Verification Branch:** The WP-03 verification branch (`jules-3110607620436353703-ca56d790`) remains **completely untouched**, with HEAD strictly preserved at `e8338e8b7dcd731dc9b494204e16749fc4918869`.
  5. **Verification Branch Push:** Push `jules-3110607620436353703-ca56d790` to remote `origin` without adding any new commits.
  6. **Dispatched Ref:** The workflow is dispatched with target ref set explicitly to `refs/heads/jules-3110607620436353703-ca56d790`.
  7. **Deterministic Execution:** The runner checks out `jules-3110607620436353703-ca56d790`, and Step 3 asserts `git rev-parse HEAD == e8338e8b7dcd731dc9b494204e16749fc4918869`, which passes cleanly!

---

## 2. Complete Validated Workflow Specification (Design-Only Code Block)

*(The specification is presented purely as design documentation; zero files were created in `.github/workflows/`)*:

```yaml
name: "WP-03: PostgreSQL 18 & Flyway Integration Test"

on:
  workflow_dispatch:

permissions:
  contents: read

env:
  APPROVED_BASELINE_SHA: "e8338e8b7dcd731dc9b494204e16749fc4918869"

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

      - name: "Step 2: Initialize Diagnostic Output Directory"
        run: mkdir -p test-results

      - name: "Step 3: Deterministic Immutable Baseline Commit Verification"
        env:
          DISPATCHED_REF: ${{ github.ref }}
          DISPATCHED_SHA: ${{ github.sha }}
        run: |
          set -euo pipefail
          echo "=== Git Ref and Baseline SHA Audit ===" | tee test-results/baseline-sha-verification.log
          echo "Dispatched Ref: ${DISPATCHED_REF}" | tee -a test-results/baseline-sha-verification.log
          echo "Dispatched SHA: ${DISPATCHED_SHA}" | tee -a test-results/baseline-sha-verification.log
          ACTUAL_HEAD=$(git rev-parse HEAD)
          echo "Actual Checked-Out HEAD: ${ACTUAL_HEAD}" | tee -a test-results/baseline-sha-verification.log
          echo "Approved Baseline SHA:   ${APPROVED_BASELINE_SHA}" | tee -a test-results/baseline-sha-verification.log

          # Validate SHA-1 format (40 lowercase hex characters)
          if ! [[ "${ACTUAL_HEAD}" =~ ^[0-9a-f]{40}$ ]]; then
            echo "::error::Invalid HEAD SHA format: ${ACTUAL_HEAD}" | tee -a test-results/baseline-sha-verification.log
            exit 1
          fi

          if [ "${ACTUAL_HEAD}" != "${APPROVED_BASELINE_SHA}" ]; then
            echo "::error::Baseline SHA mismatch! Approved baseline is ${APPROVED_BASELINE_SHA}, but checked out ${ACTUAL_HEAD}. Execution halted." | tee -a test-results/baseline-sha-verification.log
            exit 1
          fi
          echo "Verified checked-out HEAD strictly matches approved baseline: ${ACTUAL_HEAD}" | tee -a test-results/baseline-sha-verification.log

      - name: "Step 4: Set up Node.js 24 Runtime"
        uses: actions/setup-node@v4
        with:
          node-version: "24.x"
          cache: "npm"

      - name: "Step 5: Runtime Environment Inspection"
        run: |
          set -euo pipefail
          echo "=== Runtime Environment Audit ===" | tee test-results/runtime-environment.log
          node -v | tee -a test-results/runtime-environment.log
          npm -v | tee -a test-results/runtime-environment.log
          docker --version | tee -a test-results/runtime-environment.log
          docker info | tee -a test-results/runtime-environment.log

      - name: "Step 6: Install Frozen Dependencies"
        run: |
          set -euo pipefail
          npm ci --ignore-scripts 2>&1 | tee test-results/npm-ci.log

      - name: "Step 7: Pre-Pull Exact Digest-Pinned Docker Images"
        run: |
          set -euo pipefail
          echo "=== Pulling Pinned PostgreSQL 18.4 Image ===" | tee test-results/docker-prepull.log
          docker pull postgres:18.4@sha256:c2d42a104eb6b37b286a2d9c5cf83f349de4d6516d513d00a2bd9610e2c2e5e4 2>&1 | tee -a test-results/docker-prepull.log

          echo "=== Pulling Pinned Flyway Community 12.6.1 Image ===" | tee -a test-results/docker-prepull.log
          docker pull flyway/flyway:12.6.1@sha256:876479697e6f272e7897f9cebc5d43090e4e7ba164de9eb11e07767bff075011 2>&1 | tee -a test-results/docker-prepull.log

      - name: "Step 8: Execute Static Migration Script Integrity Tests"
        run: |
          set -eo pipefail
          npx tsx --test tests/workflowMigration/stagingMigrationScriptIntegrity.test.ts 2>&1 | tee test-results/staging-migration-script-integrity.log

      - name: "Step 9: Execute Local Connection Guard Authority Tests"
        run: |
          set -eo pipefail
          npx tsx --test tests/workflowMigration/localConnectionGuard.test.ts 2>&1 | tee test-results/local-connection-guard.log

      - name: "Step 10: Execute Unconditional Rollback Isolation & Transaction Mock Tests"
        run: |
          set -eo pipefail
          npx tsx --test tests/workflowMigration/rollbackIsolationHarness.test.ts 2>&1 | tee test-results/rollback-isolation-harness.log

      - name: "Step 11: Execute Full PostgreSQL 18 Testcontainers Integration Suite"
        run: |
          set -eo pipefail
          npx tsx --test --test-concurrency=1 tests/postgresqlTestEnvironment/reconciliationMigration.test.ts 2>&1 | tee test-results/postgresql-reconciliation-migration.log
        env:
          NODE_ENV: test
          DEBUG: testcontainers*

      - name: "Step 12: Collect Comprehensive Docker Diagnostics"
        if: always()
        run: |
          echo "=== Docker Diagnostic Logs ===" > test-results/docker-diagnostics.log
          docker ps -a >> test-results/docker-diagnostics.log 2>&1 || true
          docker image ls --digests >> test-results/docker-diagnostics.log 2>&1 || true
          docker network ls >> test-results/docker-diagnostics.log 2>&1 || true

      - name: "Step 13: Upload Diagnostic Artifacts"
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: wp03-postgresql-integration-logs
          path: test-results/
          retention-days: 7
          if-no-files-found: warn
```

---

## 3. Distinction Between Source, Target Ref, and Checked-Out Commit

| Dimension | Role in GitHub Actions | Exact Concrete Value |
| :--- | :--- | :--- |
| **Workflow Definition Source** | The branch where GitHub Actions reads the YAML file to register the workflow in the UI/API | `refs/heads/main` (Default Branch) |
| **Dispatched Target Ref** | The explicit Git reference selected by the operator when clicking "Run workflow" | `refs/heads/jules-3110607620436353703-ca56d790` |
| **Checked-Out Commit** | The physical commit checked out into the runner workspace by `actions/checkout@v4` | `e8338e8b7dcd731dc9b494204e16749fc4918869` |

---

## 4. Final Status Decision

## `FINAL_BASELINE_AND_WORKFLOW_SPECIFICATION_READY_FOR_GATEKEEPER_REVIEW`
