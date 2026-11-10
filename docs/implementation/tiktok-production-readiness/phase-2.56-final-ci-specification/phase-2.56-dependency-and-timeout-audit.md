# Phase 2.56: Dependency Safety and Timeout Audit Report

**Execution Mode:** STRICT READ-ONLY INVESTIGATION AND FINAL SPECIFICATION VALIDATION
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Safety)

---

## 1. Executive Summary

This audit validates two critical operational assumptions for the proposed GitHub Actions workflow specification for Work Package 3:
1. **Dependency Safety of `npm ci --ignore-scripts`:** Verifying whether suppressing npm lifecycle scripts prevents required binaries from installing or causes test runners (`tsx`, Testcontainers, `pg`) to fail.
2. **Timeout Defensibility of `timeout-minutes: 15`:** Rigorously auditing timeout layers against repository constants and classifying runtime assumptions.

---

## 2. WP-03: npm ci --ignore-scripts Dependency Safety Audit (AC-05, AC-06)

### 2.1 Manifest and Lifecycle Script Inspection
- **Root `package.json` Scripts:**
  - `preinstall`: None
  - `install`: None
  - `postinstall`: None
  - `prepare`: None
  - `prebuild`: `node scripts/materializeFfmpegBinary.mjs && node scripts/materializeYtDlpBinary.mjs`
  - `build`: `next build`
- **Lockfile Script Analysis (`package-lock.json`):**
  - Out of 1033 packages in the lockfile, 35 have `hasInstallScript: true` (predominantly Firebase compatibility shims and `esbuild`).
  - Core WP-03 testing dependencies:
    - `testcontainers`: `hasInstallScript: false`, `scripts: {}`
    - `@testcontainers/postgresql`: `hasInstallScript: false`, `scripts: {}`
    - `tsx`: `hasInstallScript: false`, `scripts: {}`
    - `pg`: `hasInstallScript: false`, `scripts: {}`
    - `typescript`: `hasInstallScript: false`, `scripts: {}`
- **Native Binary Strategy:**
  - `esbuild` (transitive dependency of `tsx`): In npm v7+, platform-specific binary packages (e.g., `@esbuild/linux-x64`) are installed as optional dependencies containing the pre-compiled binary executable (`@esbuild/linux-x64/bin/esbuild`). The `esbuild/install.js` postinstall script is a fallback mechanism for platforms lacking pre-built tarballs. On GitHub Actions `ubuntu-latest` (x64 Linux), the native binary is present directly in `node_modules/@esbuild/linux-x64/bin/esbuild`.
  - `scripts/materializeFfmpegBinary.mjs` and `scripts/materializeYtDlpBinary.mjs` are tied to `prebuild`, which is **not** invoked during `npm ci` or during unit/migration test execution. The WP-03 test suite does not perform video transcoding or YouTube downloads and therefore has zero dependency on materialized FFmpeg/yt-dlp binaries.

### 2.2 Classification
- **Result:** `SAFE_WITH_EVIDENCE`
- **Justification:** Suppressing install scripts via `--ignore-scripts` prevents untrusted third-party postinstall execution and eliminates redundant build hook runs without breaking `tsx`, `testcontainers`, or Node.js native test runner capabilities.

---

## 3. WP-04: Timeout Defensibility Audit (AC-07)

### 3.1 Four Distinct Timeout Layers
1. **GitHub Actions Job Timeout (`timeout-minutes: 15`):** Runner-level hard ceiling to abort hung workflows and prevent billing runaway.
2. **Docker Image Pre-Pull Layer:** Pulling `postgres:18.4` (~150MB compressed) and `flyway/flyway:12.6.1` (~300MB compressed). On GitHub-hosted runners with ~500Mbps-1Gbps connections, this typically takes 15–45 seconds.
3. **Testcontainers Startup Timeouts (from `lib/postgresqlTestEnvironment/constants.ts`):**
   - `POSTGRESQL_STARTUP_TIMEOUT_MS = 60_000` (60 seconds)
   - `POSTGRESQL_READINESS_TIMEOUT_MS = 20_000` (20 seconds)
4. **Test Runner Test-Level Timeouts:** Node.js native test runner defaults to no timeout unless specified per test; individual queries and migrations execute in <100ms once the container is ready.

### 3.2 Classification & Recommendation
- **Classification:** `NOT_VERIFIED` (Real runtime duration cannot be confirmed without live CI execution telemetry).
- **Justification:** Based on the sum of component bounds:
  - Step 1 (Checkout): ~5s
  - Step 4 (Setup Node): ~15s
  - Step 6 (`npm ci` cached): ~30s
  - Step 7 (Docker pull): ~45s
  - Step 8-10 (Static/mock tests): ~10s total
  - Step 11 (PostgreSQL Testcontainers suite): ~60s startup + ~30s execution = ~90s
  - Step 12-13 (Diagnostics & upload): ~10s
  - **Estimated Expected Duration:** ~3.5 to 5.0 minutes.
- **Defensibility of 15-Minute Ceiling:** Setting `timeout-minutes: 15` provides a 3x safety margin over expected duration (accommodating cold runner caches or transient network throttles) while strictly bounding total CI execution time. It is a defensible provisional setting.
