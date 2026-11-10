# Database Migration & Safe Rollback Plan

## 1. Migration Execution Sequencing
To prevent database locks on large tables in production, migrations must be executed in strict two-phase order:

### Phase 1: Pre-Migration Index Creation (`scripts/pre_migration_exports_unique_index.sql`)
Before applying table constraints, a unique index MUST be created concurrently to prevent write downtime on `workflow.exports`:
```sql
-- scripts/pre_migration_exports_unique_index.sql
-- Safe concurrent execution outside transaction block
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ix_exports_id_job_uq
  ON workflow.exports (id, job_id);
```

### Phase 2: Core Migration (`V000010__add_publication_management_foundation.sql`)
Executed via Flyway runner within a transaction block:
1. Validates that index `ix_exports_id_job_uq` exists.
2. Attaches constraint `ALTER TABLE workflow.exports ADD CONSTRAINT uq_exports_id_job UNIQUE USING INDEX ix_exports_id_job_uq;`.
3. Creates tables `workflow.publications`, `workflow.publication_outbox`, `workflow.publication_events`, and `workflow.publication_callback_ingress_ledger`.
4. Creates triggers and functions for audit immutability.

---

## 2. Reversible Rollback Procedures

### Rollback of Migration `V000010`
If rollback is triggered prior to external publication traffic, execute `U000010__rollback_publication_management.sql`:

```sql
-- Controlled Rollback Script
BEGIN;

-- 1. Drop Ingress Partition & Ledger
DROP TABLE IF EXISTS workflow.publication_callback_ingress_y2026m11;
DROP TABLE IF EXISTS workflow.publication_callback_ingress_ledger CASCADE;

-- 2. Drop Immutable Triggers & Events
DROP TRIGGER IF EXISTS trg_audit_ledger_immutable ON workflow.publication_audit_ledger;
DROP FUNCTION IF EXISTS workflow.fn_enforce_immutable_audit();
DROP TABLE IF EXISTS workflow.publication_events CASCADE;
DROP TABLE IF EXISTS workflow.publication_audit_ledger CASCADE;

-- 3. Drop Outbox & Publications
DROP TABLE IF EXISTS workflow.publication_outbox CASCADE;
DROP TABLE IF EXISTS workflow.publications CASCADE;

-- 4. Detach Exports Constraint (Leave index intact to avoid lock rebuild on retry)
ALTER TABLE workflow.exports DROP CONSTRAINT IF EXISTS uq_exports_id_job;

COMMIT;
```

### Data Safety Guarantee
Rollback of `V000010` affects ONLY the publication tables. Core video processing tables (`workflow.jobs`, `workflow.media`, `workflow.exports`, `workflow.asset_import_requests`) remain completely untouched.
