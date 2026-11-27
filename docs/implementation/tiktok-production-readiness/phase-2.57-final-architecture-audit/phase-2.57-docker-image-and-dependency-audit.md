# Phase 2.57: Docker Image Digest and Dependency Lifecycle Audit

**Execution Mode:** STRICT READ-ONLY FORENSIC INVESTIGATION
**Repository Working Copy:** `/app`
**Current Git Branch:** `jules-3110607620436353703-ca56d790`
**Baseline HEAD Commit:** `e8338e8b7dcd731dc9b494204e16749fc4918869`
**Target Domain:** Work Package 3 (Schema Migration V000009 and Rollback Safety)

---

## 1. Testcontainers Docker Image Digest Enforcement (WP-02 / AC-04, AC-05)

### 1.1 Source-Level Image Construction Inspection
- **PostgreSQL Container (`lib/postgresqlTestEnvironment/foundation.ts` line 43):**
  ```typescript
  postgres = await new PostgreSqlContainer(POSTGRESQL_TEST_IMAGE)
    .withNetwork(network)
    .withNetworkAliases(POSTGRESQL_NETWORK_ALIAS)
    ...
  ```
- **Flyway GenericContainer (`lib/postgresqlTestEnvironment/flywayRunner.ts` line 37):**
  ```typescript
  const container = await new GenericContainer(FLYWAY_COMMUNITY_IMAGE)
    .withNetwork(network)
    ...
  ```
- **Constant Definitions (`lib/postgresqlTestEnvironment/constants.ts` lines 1–5):**
  ```typescript
  export const POSTGRESQL_TEST_IMAGE =
    "postgres:18.4@sha256:c2d42a104eb6b37b286a2d9c5cf83f349de4d6516d513d00a2bd9610e2c2e5e4" as const;

  export const FLYWAY_COMMUNITY_IMAGE =
    "flyway/flyway:12.6.1@sha256:876479697e6f272e7897f9cebc5d43090e4e7ba164de9eb11e07767bff075011" as const;
  ```
- **Runtime Version Assertions (`lib/postgresqlTestEnvironment/readiness.ts` lines 25–35):**
  Asserts that `server_version` begins strictly with `18.4` and `server_version_num` begins with `18`.

### 1.2 Determination:
- **Classification:** **`DIGEST_PINNED_AND_ENFORCED`**
- **Conclusion:** The application code directly specifies the full SHA-256 digest in the container factory constructor. It does NOT use mutable tags (like `:latest` or `:18.4` alone). Pre-pulling the exact digest in Step 7 ensures that Testcontainers finds the exact immutable image in the local Docker daemon cache.

---

## 2. Complete npm Dependency Lifecycle Audit (WP-03 / AC-06, AC-07)

### 2.1 Transitive Subgraph Analysis
- Total packages in `package-lock.json`: **1033**.
- Total packages across the 4 WP-03 test dependency subgraphs (`tsx`, `testcontainers`, `@testcontainers/postgresql`, `pg`, `typescript`): **143**.
- Packages in the WP-03 test subgraph with `hasInstallScript: true`: **3** (`node_modules/ssh2`, `node_modules/esbuild`, `node_modules/protobufjs`).

### 2.2 Individual Package Analysis:
1. **`esbuild`:** In npm v7+, platform-specific binary tarballs (`@esbuild/linux-x64`) are resolved via `optionalDependencies`. The binary executable exists directly at `node_modules/@esbuild/linux-x64/bin/esbuild`. Its `postinstall: node install.js` is merely a fallback downloader for unlisted platforms. In GitHub Actions `ubuntu-latest`, the binary is fully present without script execution.
2. **`ssh2`:** The `install: node install.js` script attempts to compile optional native bindings. If it fails or is skipped, `ssh2` falls back seamlessly to its built-in pure JavaScript implementation.
3. **`protobufjs`:** The `postinstall` script referenced in its source metadata does not exist in the published npm release tarball (`os.path.exists` returns `False`).

### 2.3 Classification:
- **Result:** **`SAFE_WITH_EVIDENCE`**
- **Conclusion:** All 4 WP-03 test commands execute cleanly and deterministically under `npm ci --ignore-scripts`.
