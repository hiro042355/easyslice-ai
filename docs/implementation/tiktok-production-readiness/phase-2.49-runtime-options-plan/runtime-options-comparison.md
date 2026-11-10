# Phase 2.49: Authorized PostgreSQL 18 Runtime Options & Execution Plan Report

**Execution Mode:** STRICT READ-ONLY INVESTIGATION AND PLANNING
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Safety)

---

## 1. Executive Summary

Phase 2.48 authoritatively concluded that no existing authorized local runtime can execute the physical PostgreSQL 18 Testcontainers suite inside the devbox environment due to nested overlayfs whiteout restrictions (`operation not permitted` on `.wh.pager.1.gz`).

In Phase 2.49, we conducted a comprehensive investigation of candidate runtime options capable of preserving the exact pinned image digests (`postgres:18.4@sha256:c2d42...` and `flyway:12.6.1@sha256:87647...`) and Node.js >= 24 requirements. We evaluated four primary alternatives:
1. User-Controlled Windows Host (with Docker Desktop / native PostgreSQL).
2. GitHub-Hosted Actions Runner (with separate workflow implementation).
3. Authorized Remote Development Environments.
4. Local alternative container runtimes.

The findings demonstrate that while **Option 1 (User-Controlled Host)** and **Option 2 (GitHub Actions CI)** represent technically sound execution models that preserve 100% of the repository's cryptographic image pins and test constraints without modifying application code, **both options require explicit Product Owner approval and out-of-container setup**.

---

## 2. Phase 2.48 Findings Carried Forward

1. **Node.js 24 Runtime:** Successfully downloaded to `/tmp/node24_acquisition/` and verified against official Node.js distribution SHA-256 (`59b8af617d...`). Preserved intact.
2. **Docker Boundary Restriction:** The local Docker daemon runs on `overlayfs` via `containerd` inside an unprivileged sandbox container. Pulling the pinned PostgreSQL 18.4 image fails during tar extraction because nested overlayfs whiteout character devices cannot be converted without Linux kernel capability escalation.
3. **Absence of Local PostgreSQL:** Zero local PostgreSQL or Flyway binaries exist in the container.
4. **Zero Billing Impact:** Cumulative external service and cloud charges from this workstream remain strictly **$0.00**.

---

## 3. Runtime Alternatives Evaluated

### Option A: User-Controlled Windows Host Environment
- **Description:** The user executes the test suite directly on their physical Windows host machine (e.g., in PowerShell or WSL2) where Docker Desktop or a native PostgreSQL 18 instance operates without nested overlayfs restrictions.
- **Node.js 24 Support:** Yes (User installs or selects Node 24 on host/WSL2).
- **PostgreSQL 18 Image Digest Preservation:** **100% Preserved**. Docker Desktop on Windows handles standard OCI whiteout files cleanly.
- **Flyway Image Digest Preservation:** **100% Preserved**.
- **Network / Billing:** Local execution; zero cloud billing.
- **Authorization Required:** User-side verification and execution outside Jules sandbox.

### Option B: GitHub-Hosted Actions Runner (`ubuntu-latest`)
- **Description:** Implement a dedicated GitHub Actions workflow (`.github/workflows/postgresql-integration.yml`) triggered on manual dispatch (`workflow_dispatch`).
- **Runner Specs:** Standard GitHub-hosted `ubuntu-latest` runner provides root Docker daemon access and `actions/setup-node` (Node 24).
- **PostgreSQL 18 Image Digest Preservation:** **100% Preserved**. Standard GitHub Actions VMs run Docker with full overlayfs capability.
- **Flyway Image Digest Preservation:** **100% Preserved**.
- **Network / Billing:** Consumes standard GitHub Actions minutes (free tier for public repositories, standard billing for private).
- **Authorization Required:** Explicit Product Owner approval to create workflow file and commit/push branch.

### Option C: Authorized Remote Development Environment (Cloud Workstations / VM)
- **Description:** Dedicated GCP Compute Engine VM or Cloud Workstation running Docker with full KVM/daemon privileges.
- **Assessment:** **NOT AVAILABLE**. No remote workstation is provisioned, and provisioning creates billable cloud infrastructure.

### Option D: Local Alternative PostgreSQL-Compatible Runtime
- **Description:** In-memory or alternative local database.
- **Assessment:** **PROHIBITED / INFEASIBLE**. Directives strictly forbid substituting SQLite or mocks for real PostgreSQL constraint behavior.

---

## 4. Candidate Options Comparison Table

| Evaluation Criterion | Option A: User Windows Host | Option B: GitHub Actions Runner | Option C: Remote Cloud VM | Option D: In-Memory / SQLite |
| :--- | :--- | :--- | :--- | :--- |
| **Availability Classification** | `UNKNOWN_REQUIRES_USER_VERIFICATION` | `AVAILABLE_BUT_REQUIRES_APPROVAL` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| **Current Authorization** | Not authorized inside container | Requires PO approval to add workflow | Not authorized | Prohibited |
| **PostgreSQL 18 Compatible** | Yes | Yes | Yes | No |
| **Preserves Exact Image Pins** | **YES** (`postgres:18.4@...`) | **YES** (`postgres:18.4@...`) | **YES** | No |
| **Node.js 24 Compatible** | Yes | Yes (`actions/setup-node@v4`) | Yes | N/A |
| **Runs Existing Harness** | Yes | Yes | Yes | No |
| **Network Access Required** | Pulling image from Docker Hub | Pulling image in CI VM | Network required | No |
| **Billing Potential** | **$0.00** (Local hardware) | Standard GitHub Actions minutes | Billable GCP compute | $0.00 |
| **Host System Mutation** | Modifies user's local host | None (Disposable GitHub VM) | None (Cloud VM) | N/A |
| **Security & Isolation** | High (User machine) | **Maximum** (Ephemeral clean VM) | High | Low |

---

## 5. Exact PostgreSQL & Flyway Image Requirements

The execution plan strictly preserves the exact physical digests defined in `lib/postgresqlTestEnvironment/constants.ts`:
- **PostgreSQL 18.4 Image:**
  `postgres:18.4@sha256:c2d42a104eb6b37b286a2d9c5cf83f349de4d6516d513d00a2bd9610e2c2e5e4`
- **Flyway Community 12.6.1 Image:**
  `flyway/flyway:12.6.1@sha256:876479697e6f272e7897f9cebc5d43090e4e7ba164de9eb11e07767bff075011`

Zero substitutions or floating tags (`:latest`, `:18`) are permitted.

---

## 6. Cost and Billing Boundaries

- **Current Cumulative Charges:** **$0.00**.
- **Option A Cost:** **$0.00** (Runs on already-owned local developer hardware).
- **Option B Cost:** Free tier on GitHub public repository (or minimal standard Actions minutes on private).
- **Strict Boundary:** No paid external AI APIs, Cloud SQL instances, or paid GCP VMs may be provisioned.

---

## 7. Recommended Next Execution Path

### Recommended Model: **Option B (Controlled GitHub Actions Workflow)** followed by or parallel to **Option A**
1. **Why Option B is Superior:**
   - **Zero Sandbox Capability Escalation:** Does not require modifying the agent container or changing Docker security settings.
   - **Zero User Machine Taint:** Does not require the user to manually install Node 24 or configure PostgreSQL on their personal Windows host.
   - **Independent Audit Trail:** Produces a public, tamper-evident GitHub Actions execution log and test artifact showing exact PostgreSQL 18 container launch and Flyway migration results.
2. **Required Product Owner Approvals:**
   - Approval to author `.github/workflows/test-postgresql-wp03.yml`.
   - Approval to push the verification branch to GitHub to trigger the workflow.

---

## 8. WP-03 Safety Constraints Reaffirmed

The execution plan strictly maintains all core safety boundaries:
1. Zero Staging or Production database connections.
2. Zero deletion of `workflow.jobs` or `workflow.media`.
3. Rollback removes strictly eligible synthetic rows (`owner_uid = approvedUid`, matching `RUN_ID`, `SEQ`, `job_id IS NULL`, `media_id IS NULL`).
4. Decisions PO-01 through PO-05 remain completely unapproved (`REQUIRES_PO_APPROVAL`).
5. TP-WIF and TP-VIDEO remain separate unapproved technical prerequisites.
6. Zero TikTok publication or real OAuth calls.

---

## 9. Git Working Tree & Index Observations

- **Baseline HEAD:** `e8338e8b7dcd731dc9b494204e16749fc4918869` (Preserved).
- **Branch:** `jules-3110607620436353703-ca56d790`.
- **Working Tree Cleanliness:** `git diff --quiet` (Exit code: 0).
- **Index State:** `git diff --cached --quiet` (Exit code: 1).
- **Staged File Observation:** The Git index currently contains 82 staged files (including historical phase reports through 2.48). In accordance with Section 7 instructions, zero attempt was made to reset or alter the index.
- **Deliverables Created:** Placed strictly as untracked files (`??`):
  - `docs/implementation/tiktok-production-readiness/phase-2.49-runtime-options-plan/runtime-options-comparison.md`
  - `docs/implementation/tiktok-production-readiness/phase-2.49-runtime-options-plan/evidence-manifest.json`

---

## 10. Final Decision

### Exact Decision:
## `AUTHORIZED_RUNTIME_REQUIRES_USER_APPROVAL`

*(Justification: While two feasible and reproducible runtime execution paths [GitHub Actions Runner and User-Controlled Host] have been identified that completely preserve exact image pins and Node 24 requirements, both paths require explicit Product Owner approval to author workflow files, push branches, or run host-level operations outside the devbox container).*

---

`PHASE_2_49_RUNTIME_OPTIONS_PLAN_SUBMITTED_FOR_GATEKEEPER_REVIEW`
