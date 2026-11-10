# Phase 2.61: Real PostgreSQL Migration Verification

**Execution Mode:** STATIC DDL VERIFICATION & CONTAINER INTEGRATION SPECIFICATION
**Target:** `db/workflow/migrations/V000008__reconciliation_outbox.sql` & `V000009__asset_import_tiktok_authority.sql`

---

## 1. Migration Verification Analysis

1. **Local Container Boundary:**
   Attempting to run Testcontainers in this sandbox container fails during image layer extraction due to unprivileged overlayfs whiteout restrictions (`failed to convert whiteout file '...': operation not permitted`).
2. **GitHub Actions Environment:**
   GitHub Actions `ubuntu-latest` provides native root Docker daemon access without unprivileged overlayfs restrictions.
3. **Execution Pipeline on CI (Step 11):**
   - Starts pinned container: `postgres:18.4@sha256:c2d42a104eb6b37b286a2d9c5cf83f349de4d6516d513d00a2bd9610e2c2e5e4`.
   - Starts pinned Flyway container: `flyway/flyway:12.6.1@sha256:876479697e6f272e7897f9cebc5d43090e4e7ba164de9eb11e07767bff075011`.
   - Applies migrations `V000001` through `V000009` sequentially.
   - Asserts table schema, foreign keys, and check constraints (`ck_asset_import_authority`).
