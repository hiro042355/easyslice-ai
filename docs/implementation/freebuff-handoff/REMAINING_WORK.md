# Outstanding Work & Blockers for Freebuff

## 1. Concrete Implementation Tasks
- [ ] **Task 1: Pre-Migration & Migration V000010**:
  - Run `scripts/pre_migration_exports_unique_index.sql` to execute `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ix_exports_id_job_uq ON workflow.exports (id, job_id);`.
  - Create and commit `db/workflow/migrations/V000010__add_publication_management_foundation.sql`.
- [ ] **Task 2: Cryptographic Infrastructure & JCS**:
  - Implement `lib/server/publication/jcsCanonicalize.ts` with pinned `canonical-json` package.
  - Implement `lib/server/publication/hmacAuth.ts` with lowercase regex `/^[0-9a-f]{64}$/` and `crypto.timingSafeEqual`.
- [ ] **Task 3: Ingress Logging & Event Sequencer**:
  - Implement autonomous connection logging in `lib/server/publication/ingressLedger.ts`.
  - Implement `lib/server/publication/canonicalSequencer.ts` with advisory locks and contiguous watermark drainage.
- [ ] **Task 4: Outbox Daemon & Fencing**:
  - Implement `lib/server/publication/outboxDaemon.ts` using CTE with `FOR UPDATE SKIP LOCKED`.
  - Implement JIT signed URL generation (15-min lease) in `lib/server/publication/jitMediaToken.ts`.
- [ ] **Task 5: Publisher Microservice Ledger**:
  - Implement `publisher.durable_ledger` and HTTP 308 resumable offset query handlers.

## 2. Upstream Platform Dependencies & Blockers
- **Google Cloud Console**: YouTube Data API default upload quota is 100 uploads/project/day. Production deployment requires applying for an enterprise quota increase.
- **TikTok Developer Portal**: Direct Post API requires TikTok Developer App approval with `video.publish` permissions; test accounts operate in sandbox mode.
- **Bilibili Open Platform**: Access requires an approved Enterprise Partner AppID and secret. Unofficial Web API scripts must remain quarantined.
