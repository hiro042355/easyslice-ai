# Phase 2.52: Final WP-03 GitHub Actions Workflow Specification

**Execution Mode:** STRICT READ-ONLY SPECIFICATION CORRECTION
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Safety)

---

## 1. Specification Corrections & Architectural Hardening

### WP-01: Immutable Baseline SHA Hardening
- **Removal of Overridable Input:** The user-overridable `expected_commit_sha` workflow input from Phase 2.51 is **completely removed**.
- **Fixed Workflow Constant:** The verified PR #8 merge baseline commit (`e8338e8b7dcd731dc9b494204e16749fc4918869`) is defined as an immutable environment constant (`APPROVED_BASELINE_SHA`).
- **Safe Shell Assertion:** Prevents untrusted expression injection by using standard POSIX shell variable comparison in an isolated step, failing immediately with `exit 1` before any runtime setup or dependency installation.
- **Controlled Baseline Updates:** To advance the baseline in the future, the Product Owner must explicitly approve a PR updating the hardcoded constant in the workflow file.

### WP-02: Failure-Proof Artifact & Log Collection Strategy
- **Pre-Execution Directory Creation:** `mkdir -p test-results` is executed in the earliest step so that failure diagnostics never fail due to missing output paths.
- **Exit Code Preservation (`set -o pipefail`):** When piping commands through `tee` (`npx tsx ... 2>&1 | tee ...`), bash default behavior returns the exit code of `tee` (0). Enforcing `set -eo pipefail` guarantees that if any test assertion fails, the step immediately fails with the test runner's exact non-zero exit code.
- **Fail-Safe Diagnostics Collection:** Docker container state (`docker ps -a`) and image listings (`docker image ls --digests`) are collected with `if: always()` and `|| true` guards so diagnostic steps cannot themselves cause secondary workflow errors.
- **Artifact Retention:** Uploads `test-results/` with `retention-days: 7` and `if-no-files-found: warn` ensuring artifact upload succeeds even if an early failure occurred before logs were written.

---

## 2. Complete Revised Workflow YAML Specification (Design Only)

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
      - name: "Step 1: Initialize Diagnostic Directories"
        run: mkdir -p test-results

      - name: "Step 2: Checkout Repository at Dispatched Ref"
        uses: actions/checkout@v4
        with:
          persist-credentials: false

      - name: "Step 3: Deterministic Immutable Baseline Commit Verification"
        run: |
          set -euo pipefail
          echo "=== Git Ref and Baseline SHA Audit ==="
          echo "github.ref: ${{ github.ref }}"
          echo "github.sha: ${{ github.sha }}"
          ACTUAL_HEAD=$(git rev-parse HEAD)
          echo "git rev-parse HEAD: ${ACTUAL_HEAD}"
          echo "APPROVED_BASELINE_SHA: ${APPROVED_BASELINE_SHA}"

          # Validate SHA-1 format (40 hexadecimal characters)
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

## 3. Final Approval and Execution Sequence

The complete operational execution sequence requiring Product Owner sign-off is established:

1. **Gatekeeper Review:** Gatekeeper audits and accepts Phase 2.52 specification.
2. **PO Approval for Workflow Creation:** Product Owner approves authoring `.github/workflows/test-postgresql-wp03.yml`.
3. **Workflow Creation on Verification Branch:** The file is committed to branch `jules-3110607620436353703-ca56d790`.
4. **Pull Request Creation:** A controlled PR is opened to merge the workflow file into `main`.
5. **PO Approval for Merge:** Product Owner approves and merges the workflow into `main` (satisfying GitHub's `workflow_dispatch` default-branch registration requirement).
6. **Verification Branch Push:** Verification branch `jules-3110607620436353703-ca56d790` is pushed to remote `origin`.
7. **Manual Workflow Dispatch:** Workflow is dispatched targeting `ref: jules-3110607620436353703-ca56d790`.
8. **Gatekeeper Evidence Review:** Gatekeeper inspects GitHub Actions execution logs and artifact downloads before declaring WP-03 integration accepted.

---

## 4. Final Security Revalidation

- **Permissions:** Strictly limited to `contents: read`.
- **Zero Secrets / Tokens:** Requires no repository secrets, GCP service account credentials, Firebase admin tokens, or TikTok OAuth keys.
- **Local Isolation:** Runs solely against ephemeral container networks; connects to zero remote, staging, or production databases.
- **Image Pin Preservation:** Exact digests `postgres:18.4@sha256:c2d4...` and `flyway:12.6.1@sha256:8764...` remain unchanged.

---

## 5. Final Status Decision

## `FINAL_WORKFLOW_SPECIFICATION_READY_FOR_GATEKEEPER_REVIEW`
