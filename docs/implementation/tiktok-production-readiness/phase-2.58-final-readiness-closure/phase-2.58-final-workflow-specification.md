# Phase 2.58: Final Consolidated Workflow Specification (Closed)

**Execution Mode:** SPECIFICATION DOCUMENTATION ONLY (ZERO FILES CREATED IN `.github/workflows/`)
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Safety)

---

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
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with:
          ref: ${{ github.ref }}
          persist-credentials: false

      - name: "Step 2: Initialize Diagnostic Output Directory"
        run: mkdir -p test-results

      - name: "Step 3: Five-Factor Deterministic Baseline SHA Verification"
        env:
          DISPATCHED_REF: ${{ github.ref }}
          DISPATCHED_SHA: ${{ github.sha }}
        run: |
          set -euo pipefail
          echo "=== Git Ref and Baseline SHA Audit ===" | tee test-results/baseline-sha-verification.log
          echo "Dispatched Ref:        ${DISPATCHED_REF}" | tee -a test-results/baseline-sha-verification.log
          echo "Dispatched SHA:        ${DISPATCHED_SHA}" | tee -a test-results/baseline-sha-verification.log
          ACTUAL_HEAD=$(git rev-parse HEAD)
          echo "Actual Checked-Out HEAD: ${ACTUAL_HEAD}" | tee -a test-results/baseline-sha-verification.log
          echo "Approved Baseline SHA:   ${APPROVED_BASELINE_SHA}" | tee -a test-results/baseline-sha-verification.log

          # Check 1: ACTUAL_HEAD is a valid 40-character lowercase hexadecimal SHA
          if ! [[ "${ACTUAL_HEAD}" =~ ^[0-9a-f]{40}$ ]]; then
            echo "::error::Invalid HEAD SHA format: ${ACTUAL_HEAD}" | tee -a test-results/baseline-sha-verification.log
            exit 1
          fi
          echo "Check 1 PASSED: ACTUAL_HEAD is valid 40-character lowercase hex." | tee -a test-results/baseline-sha-verification.log

          # Check 2: APPROVED_BASELINE_SHA is the immutable approved constant
          if [ "${APPROVED_BASELINE_SHA}" != "e8338e8b7dcd731dc9b494204e16749fc4918869" ]; then
            echo "::error::APPROVED_BASELINE_SHA constant altered: ${APPROVED_BASELINE_SHA}" | tee -a test-results/baseline-sha-verification.log
            exit 1
          fi
          echo "Check 2 PASSED: APPROVED_BASELINE_SHA strictly matches immutable approved constant." | tee -a test-results/baseline-sha-verification.log

          # Check 3: ACTUAL_HEAD == APPROVED_BASELINE_SHA
          if [ "${ACTUAL_HEAD}" != "${APPROVED_BASELINE_SHA}" ]; then
            echo "::error::Baseline SHA mismatch! Approved baseline is ${APPROVED_BASELINE_SHA}, but checked out ${ACTUAL_HEAD}. Execution halted." | tee -a test-results/baseline-sha-verification.log
            exit 1
          fi
          echo "Check 3 PASSED: Checked-out HEAD strictly matches approved baseline: ${ACTUAL_HEAD}" | tee -a test-results/baseline-sha-verification.log

          # Check 4: DISPATCHED_SHA is a valid 40-character lowercase hexadecimal SHA
          if ! [[ "${DISPATCHED_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
            echo "::error::Invalid DISPATCHED_SHA format: ${DISPATCHED_SHA}" | tee -a test-results/baseline-sha-verification.log
            exit 1
          fi
          echo "Check 4 PASSED: DISPATCHED_SHA is valid 40-character lowercase hex." | tee -a test-results/baseline-sha-verification.log

          # Check 5: ACTUAL_HEAD == DISPATCHED_SHA
          if [ "${ACTUAL_HEAD}" != "${DISPATCHED_SHA}" ]; then
            echo "::error::Dispatched SHA mismatch! Triggered event SHA is ${DISPATCHED_SHA}, but checked out ${ACTUAL_HEAD}. Execution halted." | tee -a test-results/baseline-sha-verification.log
            exit 1
          fi
          echo "Check 5 PASSED: Checked-out HEAD strictly matches dispatched event SHA: ${DISPATCHED_SHA}" | tee -a test-results/baseline-sha-verification.log

          echo "ALL 5 SHA VERIFICATION CHECKS PASSED SUCCESSFULLY." | tee -a test-results/baseline-sha-verification.log

      - name: "Step 4: Set up Node.js 24 Runtime"
        uses: actions/setup-node@39370e3970a6d050c480ffad4ff0ed4d3fdee5af # v4.1.0
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
        uses: actions/upload-artifact@b4b15b8c7c6ac21ea08fcf65892d2ee8f75cf882 # v4.4.3
        with:
          name: wp03-postgresql-integration-logs
          path: test-results/
          retention-days: 7
          if-no-files-found: warn
```
