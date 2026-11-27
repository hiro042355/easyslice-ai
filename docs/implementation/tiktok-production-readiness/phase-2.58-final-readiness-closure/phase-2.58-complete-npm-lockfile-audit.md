# Phase 2.58: Complete npm Lockfile Dependency Graph Audit

**Execution Mode:** STRICT READ-ONLY FORENSIC INVESTIGATION
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Safety)

---

## 1. Complete Lockfile Overview (WP-02)

- **Package Manager:** `npm` (Lockfile format v3).
- **Total Package Entries in Lockfile:** **1033**.
- **Packages with `hasInstallScript: true` or Lifecycle Hooks:** **35**.

---

## 2. Classification of All 35 Install-Script Packages

| Package Name | Exact Version | Dependency Category | Lifecycle Hook Declared | Native / Binary Behavior | Impact of `npm ci --ignore-scripts` | Impact on WP-03 Tests | Risk Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `@firebase/util` (26 occurrences across compat/sub-modules) | `1.13.0` & `1.15.2` | Transitive production | `hasInstallScript: true` (scripts empty) | Pure JavaScript | Script hook is a no-op shim; no action taken | Zero impact (WP-03 tests do not use Firebase) | **LOW / SAFE** |
| `core-js` | `3.49.0` | Transitive production | `postinstall: node -e "try{...}"` | Pure JavaScript | Suppresses sponsor message in terminal | Zero impact | **LOW / SAFE** |
| `cpu-features` | `0.0.10` | Transitive dev (via `ssh2`) | `install: node-gyp rebuild` | Optional C++ binding | Build skipped; `ssh2` falls back to pure JS | Zero impact | **LOW / SAFE** |
| `esbuild` | `0.28.1` | Transitive dev (via `tsx`) | `postinstall: node install.js` | Native executable | Binary is installed via optionalDependencies (`@esbuild/linux-x64`) directly | Zero impact (`tsx` finds binary in node_modules) | **LOW / SAFE** |
| `ffmpeg-static` | `5.3.0` | Direct production | `install: node install.js` | Binary downloader | Pre-compiled ffmpeg binary not downloaded | Zero impact (WP-03 tests migration schema, not ffmpeg) | **LIMITATION** (Requires prebuild for video processing) |
| `fsevents` | `2.3.3` | Optional dev | `install: node-gyp rebuild` | macOS native event binding | Skipped on Linux (`ubuntu-latest`) | Zero impact on Linux | **LOW / SAFE** |
| `protobufjs` | `7.6.5` | Transitive dev (via `dockerode`) | `postinstall: node scripts/postinstall` | Pure JavaScript | Script file is absent in production release tarball | Zero impact | **LOW / SAFE** |
| `sharp` | `0.34.5` | Transitive production | `install: node install.js` | Native image library | Pre-compiled libvips binary not extracted | Zero impact (WP-03 does not process images) | **LIMITATION** (Requires install for frontend image optimization) |
| `ssh2` | `1.17.0` | Transitive dev (via `testcontainers`) | `install: node install.js` | Optional C++ binding | Build skipped; pure JS implementation used | Zero impact (Testcontainers uses Docker socket, not SSH) | **LOW / SAFE** |
| `unrs-resolver` | `1.12.2` | Transitive dev | `install: node install.js` | Rust binary wrapper | Binary distributed in platform package | Zero impact | **LOW / SAFE** |

---

## 3. Audit Determination

### Final Classification:
## `FULL_LOCKFILE_SAFE_WITH_LIMITATIONS`

**Justification:**
1. For the entire scope of the **WP-03 database migration and rollback test pipeline**, `--ignore-scripts` is 100% safe. Every tool (`tsx`, `node:test`, `testcontainers`, `@testcontainers/postgresql`, `pg`) operates with complete functional fidelity.
2. The limitation is explicitly documented: repository features involving video encoding (`ffmpeg-static`) or image processing (`sharp`) require their respective materialization or lifecycle scripts during full application builds, but these are decoupled from the WP-03 CI workflow.
