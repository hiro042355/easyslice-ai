# Phase 2.58: GitHub Actions Workflow Dispatch and Checkout Semantics

**Execution Mode:** STRICT READ-ONLY ARCHITECTURAL VALIDATION
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Safety)

---

## 1. Official Dispatch Semantics Analysis (WP-05)

Based on official GitHub Actions documentation (`workflow_dispatch`), the proposed execution architecture operates under the following precise semantics:

1. **Default-Branch Registration Requirement:**
   A workflow YAML file must exist in the default branch (`main`) before GitHub Actions will register it for `workflow_dispatch`. Once registered on `main`, the workflow can be triggered against any Git branch or tag in the repository.
2. **Workflow Definition Source:**
   When triggered against a target ref (`refs/heads/jules-...`), GitHub Actions uses the workflow definition from `main` (or the target ref if present). Because our verification branch deliberately does NOT contain the workflow file, GitHub Actions executes the workflow definition registered on `main`.
3. **Dispatch Target Ref (`github.ref`):**
   The context variable `github.ref` evaluates to `refs/heads/jules-3110607620436353703-ca56d790`.
4. **Trigger Event Commit (`github.sha`):**
   The context variable `github.sha` evaluates to the tip commit of the target ref at the moment of dispatch: `e8338e8b7dcd731dc9b494204e16749fc4918869`.
5. **Checkout Behavior:**
   By default, `actions/checkout` checks out `github.ref` and `github.sha`. To maximize clarity and eliminate ambiguity across runner versions, adding the explicit parameter:
   ```yaml
   with:
     ref: ${{ github.ref }}
     persist-credentials: false
   ```
   guarantees that the runner unconditionally checks out the target verification ref.
6. **Integrity Boundary of the 5-Factor SHA Assertion:**
   The 5 SHA checks in Step 3 prove source checkout consistency:
   - `ACTUAL_HEAD == APPROVED_BASELINE_SHA`
   - `ACTUAL_HEAD == DISPATCHED_SHA`
   - Valid 40-character hexadecimal formatting
   - Immutability of the approved baseline constant
   These checks mathematically prove that the code being tested is the untainted PR #8 merge baseline commit, completely unpolluted by subsequent workflow registration commits.
