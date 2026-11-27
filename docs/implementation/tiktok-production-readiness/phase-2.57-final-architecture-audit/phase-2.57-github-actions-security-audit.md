# Phase 2.57: GitHub Actions Security and Dispatch Semantics Audit

**Execution Mode:** STRICT READ-ONLY SECURITY AUDIT
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Safety)

---

## 1. GitHub Actions Dispatch Semantics (WP-04 / AC-08, AC-09)

Official GitHub Actions documentation (`workflow_dispatch`) dictates the following precise behavioral characteristics:

1. **Workflow Definition Source:**
   `workflow_dispatch` workflows must exist on the repository's default branch (`main`) in order to be registered in GitHub's internal database and exposed via the UI / API.
2. **Dispatch Target Ref (`github.ref`):**
   When triggering `gh workflow run ... --ref <branch>`, the workflow is dispatched against that specific reference. For our verification phase, the target ref is `refs/heads/jules-3110607620436353703-ca56d790`.
3. **Trigger Event Commit (`github.sha`):**
   For `workflow_dispatch`, `github.sha` represents the commit SHA at the tip of the dispatched target ref. Because our branch is strictly uncommitted, `github.sha` equals `e8338e8b7dcd731dc9b494204e16749fc4918869`.
4. **Checkout Target:**
   `actions/checkout@v4` with default parameters checks out the ref and commit specified in the GitHub event payload (`github.ref` / `github.sha`).
5. **Baseline Assertion:**
   Step 3 executes inside the checked-out repository and evaluates:
   - `ACTUAL_HEAD=$(git rev-parse HEAD)`
   - `APPROVED_BASELINE_SHA="e8338e8b7dcd731dc9b494204e16749fc4918869"`
   - `DISPATCHED_SHA="${{ github.sha }}"`
   - Asserting `ACTUAL_HEAD == APPROVED_BASELINE_SHA` and `ACTUAL_HEAD == DISPATCHED_SHA` provides mathematical proof of execution against the untainted baseline.

---

## 2. Supply-Chain Security & Action Commit Pinning (WP-05 / AC-10)

To protect the verification pipeline against upstream tag mutability or action hijacking, all GitHub Actions references are pinned to immutable 40-character commit SHAs:

| Action Reference | Pinned Full Commit SHA | Official Release Tag | Release Verification Status |
| :--- | :--- | :---: | :--- |
| `actions/checkout` | `11bd71901bbe5b1630ceea73d27597364c9af683` | `v4.2.2` | Official GitHub release verified |
| `actions/setup-node` | `39370e3970a6d050c480ffad4ff0ed4d3fdee5af` | `v4.1.0` | Official GitHub release verified |
| `actions/upload-artifact` | `b4b15b8c7c6ac21ea08fcf65892d2ee8f75cf882` | `v4.4.3` | Official GitHub release verified |

### Permission and Secret Hardening:
- **`permissions: contents: read`:** Enforces minimal read-only repository permissions on `GITHUB_TOKEN`.
- **`persist-credentials: false`:** Prevents token leakage to subsequent runner processes.
- **Zero Secrets Injected:** The integration test suite uses Testcontainers on local ephemeral Docker instances and requires zero GCP, Firebase, or external API secrets.
