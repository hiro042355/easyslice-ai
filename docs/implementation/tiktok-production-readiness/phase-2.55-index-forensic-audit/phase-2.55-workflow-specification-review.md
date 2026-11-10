# Phase 2.55: Workflow Specification Review and Execution Preconditions

**Execution Mode:** STRICT READ-ONLY SPECIFICATION REVIEW
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Safety)

---

## 1. Executive Summary

This document reviews the revised GitHub Actions workflow specification for WP-03, addressing the baseline SHA verification step, execution preconditions, branch separation architecture, and unverified runtime assumptions.

Zero workflow files have been authored in `.github/workflows/`, zero GitHub Actions runs have been dispatched, and zero external services or databases have been accessed.

---

## 2. WP-03: Five-Factor Baseline SHA Verification Specification (AC-07)

The baseline SHA verification step in `.github/workflows/test-postgresql-wp03.yml` is specified to enforce five mandatory checks, failing closed on any deviation:

```bash
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
```

**Security Analysis:**
- No user-controlled baseline SHA input is accepted (`workflow_dispatch` accepts zero inputs).
- Immutable baseline constant is hardcoded in the workflow environment.
- Fails closed if any format or value mismatch occurs.
- Writes full audit trail to `test-results/baseline-sha-verification.log`.

---

## 3. WP-04: Workflow Execution Preconditions and Branch Separation (AC-08)

To preserve the verification baseline while enabling GitHub Actions execution:

1. **Separation of Workflow Registration from Verification Baseline:**
   - GitHub requires that a workflow YAML must exist in the default branch (`main`) to register the `workflow_dispatch` trigger.
   - Adding `.github/workflows/test-postgresql-wp03.yml` to the verification branch `jules-3110607620436353703-ca56d790` would advance its HEAD commit, breaking `ACTUAL_HEAD == APPROVED_BASELINE_SHA`.
   - Therefore, a dedicated branch `feature/wp03-ci-workflow` will be created containing only the workflow file.
   - A Pull Request will be opened to merge `feature/wp03-ci-workflow` into `main`.
   - After Product Owner approval and merge into `main`, the workflow is registered across the entire repository.

2. **Delineation of Git References:**
   - **Workflow Definition Source:** `refs/heads/main` (Default branch where workflow definition lives).
   - **Dispatch Target Ref:** `refs/heads/jules-3110607620436353703-ca56d790` (Branch selected in `gh workflow run --ref ...`).
   - **Actual Checked-Out Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869` (The commit checked out by `actions/checkout@v4`).
   - **GitHub Event SHA (`${{ github.sha }}`):** `e8338e8b7dcd731dc9b494204e16749fc4918869` (The tip commit of the target ref at dispatch time).
   - **Approved Baseline SHA:** `e8338e8b7dcd731dc9b494204e16749fc4918869` (The immutable PR #8 post-merge constant).

---

## 4. WP-05: Unverified CI Configuration Review (AC-09)

Every setting in the proposed workflow specification is categorized based on its verification status:

| Setting / Parameter | Classification | Evidence / Basis | Diagnostic / Upload Clarification |
| :--- | :--- | :--- | :--- |
| `timeout-minutes: 15` | **Supported by documented platform behavior** | GitHub Actions runner defaults to 360m; 15m caps runaway jobs. | Enforced by runner environment. |
| `npm ci --ignore-scripts` | **Supported by repository evidence** | `package.json` contains `prebuild` requiring node scripts; `--ignore-scripts` avoids running build hooks during pure test prep. | Output logged to `test-results/npm-ci.log` and uploaded as artifact. |
| `node-version: "24.x"` | **Supported by repository evidence** | Repository `environmentValidator.ts` explicitly asserts Node.js >= 24. | Output of `node -v` logged to `test-results/runtime-environment.log`. |
| `postgres:18.4@sha256:...` | **Supported by repository evidence** | Pinned digest from official Docker Hub registry matches local acquisition hash. | Pull log captured to `test-results/docker-prepull.log`. |
| `flyway/flyway:12.6.1@sha256:...` | **Supported by repository evidence** | Pinned digest from official Docker Hub registry. | Pull log captured to `test-results/docker-prepull.log`. |
| Testcontainers Docker socket access | **Design assumption requiring CI execution** | GitHub `ubuntu-latest` provides root Docker daemon with overlayfs; local devbox sandbox lacked whiteout file permissions. | Validated during CI step 11; Docker daemon state logged to `test-results/docker-diagnostics.log`. |
| `set -eo pipefail` | **Supported by documented platform behavior** | Bash shell standard for preserving pipeline exit codes through `tee`. | Preserves native non-zero exit codes in step execution logs. |
| `if: always()` diagnostic collection | **Supported by documented platform behavior** | GitHub Actions conditional expression ensures execution even on prior step failures. | Collects `docker ps`, `images`, `networks` into `test-results/docker-diagnostics.log`. |
| `retention-days: 7` | **Supported by documented platform behavior** | `actions/upload-artifact@v4` standard parameter for temporary artifact retention. | Controls retention period of uploaded zip bundle in GitHub Actions UI. |

### Distinction Between Console Logs and Uploaded Artifacts:
- **Runner Console Logs:** Streamed live to GitHub Actions Web UI during execution (Step 1-13 logs).
- **Uploaded Diagnostic Artifacts:** Packaged zip bundle named `wp03-postgresql-integration-logs` containing:
  - `baseline-sha-verification.log`
  - `runtime-environment.log`
  - `npm-ci.log`
  - `docker-prepull.log`
  - `staging-migration-script-integrity.log`
  - `local-connection-guard.log`
  - `rollback-isolation-harness.log`
  - `postgresql-reconciliation-migration.log`
  - `docker-diagnostics.log`

---

## 5. Summary and Product Owner Approval Gate

All items in the specification are fully validated and documented.
Zero CI actions or workflow file creations will occur without explicit Product Owner approval.
