# Phase 2.53: Final WP-03 CI Workflow Specification

**Execution Mode:** STRICT READ-ONLY SPECIFICATION VALIDATION
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Safety)

---

## 1. Specification Revisions & Architectural Hardening

### WP-01: Correct Workflow Step Ordering (Checkout Precedes Diagnostic Directory)
In Phase 2.52, `mkdir -p test-results` was placed before `actions/checkout@v4`.
- **Defect in Prior Ordering:** `actions/checkout@v4` by default cleans or resets the workspace. Creating `test-results` before checkout creates the risk that checkout removes, overwrites, or alters directory permissions.
- **Corrected Sequence:**
  1. `actions/checkout@v4` (Checks out repository root).
  2. `mkdir -p test-results` (Initializes diagnostic directory inside clean checked-out workspace).
  3. Immutable approved SHA assertion.
  4. Node.js 24 setup.
  5. Runtime inspection.
  6. Frozen dependency installation (`npm ci --ignore-scripts`).
  7. Exact digest-pinned Docker image pre-pulls.
  8. Static migration script integrity tests.
  9. Local connection guard authority tests.
  10. Unconditional rollback isolation & transaction mock tests.
  11. Full PostgreSQL 18 Testcontainers integration suite.
  12. Docker diagnostics collection (`if: always()`).
  13. Diagnostic artifact upload (`if: always()`).

### WP-02: Safe GitHub Context Passing via Environment Variables
- **Elimination of Inline Expressions:** Direct GitHub expression interpolation inside shell scripts (e.g. `echo "${{ github.ref }}"`) is completely eliminated.
- **Environment Variable Mapping:** All context values are mapped to explicit step environment variables:
  ```yaml
  env:
    EVENT_REF: ${{ github.ref }}
    EVENT_SHA: ${{ github.sha }}
  ```
  Inside the shell script, values are accessed strictly via standard POSIX parameter expansion (`"${EVENT_REF}"`, `"${EVENT_SHA}"`), preventing code injection from arbitrary Git ref names.
- **Fail-Closed Baseline Assertion:**
  The script strictly validates that `git rev-parse HEAD` equals the immutable environment constant `APPROVED_BASELINE_SHA` (`e8338e8b7dcd731dc9b494204e16749fc4918869`). Any mismatch exits immediately with `exit 1` before any runtime setup or tests run.

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
          echo "=== Git Ref and Baseline SHA Audit ==="
          echo "Dispatched Ref: ${DISPATCHED_REF}"
          echo "Dispatched SHA: ${DISPATCHED_SHA}"
          ACTUAL_HEAD=$(git rev-parse HEAD)
          echo "Actual Checked-Out HEAD: ${ACTUAL_HEAD}"
          echo "Approved Baseline SHA:   ${APPROVED_BASELINE_SHA}"

          # Validate SHA-1 format (40 lowercase hex characters)
          if ! [[ "${ACTUAL_HEAD}" =~ ^[0-9a-f]{40}$ ]]; then
            echo "::error::Invalid HEAD SHA format: ${ACTUAL_HEAD}"
            exit 1
          fi

          if [ "${ACTUAL_HEAD}" != "${APPROVED_BASELINE_SHA}" ]; then
            echo "::error::Baseline SHA mismatch! Approved baseline is ${APPROVED_BASELINE_SHA}, but checked out ${ACTUAL_HEAD}. Execution halted."
            exit 1
          fi
          echo "Verified checked-out HEAD strictly matches approved baseline: ${ACTUAL_HEAD}"

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

      - name: "Step 12: Collect Docker Diagnostics"
        if: always()
        run: |
          echo "=== Docker Diagnostic Logs ===" > test-results/docker-diagnostics.log
          docker ps -a >> test-results/docker-diagnostics.log 2>&1 || true
          docker image ls --digests >> test-results/docker-diagnostics.log 2>&1 || true

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

## 3. Failure Handling & Diagnostic Integrity

- **`set -eo pipefail`:** Enforced across all test execution steps (Steps 8–11). Even though output is piped through `tee` to write durable files, a non-zero exit code from `npx tsx` immediately aborts the step with that exact failure code.
- **Fail-Safe Diagnostics Collection:** Step 12 runs with `if: always()` and uses `|| true` on diagnostic sub-commands, ensuring that container log collection never masks the real test failure or introduces secondary errors.
- **Safe Artifact Upload:** Step 13 uses `if: always()` and `if-no-files-found: warn`, guaranteeing that logs generated up to the failure point are archived for 7 days.

---

## 4. Final Security Revalidation & Constraints

- **Permissions:** Strictly `contents: read`.
- **Zero Secrets / Tokens:** Requires no repository secrets, GCP service account credentials, Firebase admin tokens, or TikTok OAuth keys.
- **Local Isolation:** Runs solely against ephemeral container networks; connects to zero remote, staging, or production databases.
- **Image Pin Preservation:** Exact digests `postgres:18.4@sha256:c2d4...` and `flyway:12.6.1@sha256:8764...` remain unchanged.

---

## 5. Final Status Decision

## `FINAL_WORKFLOW_SPECIFICATION_READY_FOR_GATEKEEPER_APPROVAL`
