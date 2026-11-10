# Freebuff Implementation Execution Guide

## 1. Environment Setup
```bash
# Verify environment
git status
npm run prebuild  # Materializes ffmpeg and yt-dlp binaries
npm run typecheck # Check baseline diffs
```

## 2. Implementation Workflow (Step-by-Step)
1. **Apply Migration Foundation**:
   - Create `scripts/pre_migration_exports_unique_index.sql` and run `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ix_exports_id_job_uq ON workflow.exports (id, job_id);`.
   - Create `db/workflow/migrations/V000010__add_publication_management_foundation.sql` containing the DDL from `REPOSITORY_ARCHITECTURE.md`.
2. **Implement Cryptographic Modules**:
   - Add `canonical-json` package.
   - Implement `lib/server/publication/jcsCanonicalize.ts` and `lib/server/publication/hmacAuth.ts`.
   - Run unit tests: `npx tsx --test tests/publication/cryptoConformance.test.ts`.
3. **Implement Canonical Event Sequencer**:
   - Create `lib/server/publication/canonicalSequencer.ts`.
   - Enforce lock order: `pg_advisory_xact_lock(hashtext('event:' || eventId))` FIRST, then publication row lock `FOR UPDATE`.
   - Drain contiguous events and advance `last_applied_sequence`.
4. **Implement Fenced Outbox Daemon**:
   - Create `lib/server/publication/outboxDaemon.ts`.
   - Claim using CTE with `FOR UPDATE SKIP LOCKED`.
   - Issue 15-minute JIT signed GCS URLs via `lib/server/publication/jitMediaToken.ts`.
5. **Implement Isolated Platform Adapters**:
   - Build YouTube adapter with HTTP 308 offset recovery.
   - Build TikTok adapter with Creator Info preflight checks.
   - Quarantine unverified Bilibili Web API parameters.
