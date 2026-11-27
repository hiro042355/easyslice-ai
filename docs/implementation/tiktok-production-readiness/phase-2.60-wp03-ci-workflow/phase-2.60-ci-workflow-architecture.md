# Phase 2.60: CI Workflow Architecture and Design

**Execution Mode:** AUTHORIZED IMPLEMENTATION + SPECIFICATION DEPLOYMENT
**Target:** `.github/workflows/test-postgresql-wp03.yml`

---

## 1. Architectural Highlights

1. **Trigger Configuration:**
   Supports manual execution via `workflow_dispatch`, as well as automated branch testing on pushes to `jules/wp03-**` or `feature/wp03-**` and pull requests targeting `main`.
2. **Explicit Target Ref Checkout:**
   Uses `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2) with `ref: ${{ github.ref }}` and `persist-credentials: false`.
3. **Five-Factor Baseline Verification:**
   Evaluates `ACTUAL_HEAD` against `APPROVED_BASELINE_SHA` (`e8338e8b7dcd731dc9b494204e16749fc4918869`) and `DISPATCHED_SHA` (`${{ github.sha }}`), logging full diagnostics to `test-results/baseline-sha-verification.log`.
4. **Supply Chain Pinning:**
   - `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683`
   - `actions/setup-node@39370e3970a6d050c480ffad4ff0ed4d3fdee5af`
   - `actions/upload-artifact@b4b15b8c7c6ac21ea08fcf65892d2ee8f75cf882`
5. **Digest-Pinned Ephemeral Images:**
   Pre-pulls `postgres:18.4@sha256:c2d42a104eb6b37b286a2d9c5cf83f349de4d6516d513d00a2bd9610e2c2e5e4` and `flyway/flyway:12.6.1@sha256:876479697e6f272e7897f9cebc5d43090e4e7ba164de9eb11e07767bff075011`.
6. **Diagnostics & Artifact Retention:**
   Collects `docker ps -a`, `image ls --digests`, and `network ls` under `if: always()`, packaging `test-results/` into `wp03-postgresql-integration-logs` with 7-day retention.
