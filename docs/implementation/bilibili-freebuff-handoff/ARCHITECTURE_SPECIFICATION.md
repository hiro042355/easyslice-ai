# Technical Architecture Specification: Resolution of Phase 3.5-A Outstanding Issues

This document provides definitive technical and mathematical resolutions to the five architectural tensions identified in Phase 3.5-A.

---

## 1. WP-01: Event ID and Sequence Concurrency

### Root Problem
When concurrent webhook callbacks or worker threads report state transitions for the same publication, naive integer sequence allocation or uncontrolled timestamp ordering results in:
1. Race conditions generating duplicate sequence numbers.
2. Sequence gaps causing outbox sequence consumers to stall waiting for missing sequence numbers.
3. Transactional deadlocks when multiple workers lock rows in arbitrary orders.

### Definitive Technical Resolution
1. **Event ID Generation**:
   - Every publication event MUST use a globally unique, time-ordered identifier (`UUIDv7` or RFC 4122 v4 with monotonic millisecond prefix).
   - Database column: `event_id UUID NOT NULL`.
2. **Transaction Boundary & Lock Hierarchy**:
   - Strict lock hierarchy is enforced:
     ```sql
     -- 1. Advisory Transaction Lock on Publication ID (64-bit integer hash):
     PERFORM pg_advisory_xact_lock(('x' || substr(md5(p_publication_id::text), 1, 16))::bit(64)::bigint);
     -- 2. Publication Row Lock:
     SELECT last_applied_sequence FROM workflow.publications WHERE id = p_publication_id FOR UPDATE;
     ```
   - Advisory locks are automatically released at transaction commit or rollback (`_xact_` scope).
   - **Hash Collision Handling**: In the extremely improbable case of a 64-bit hash collision ($P \approx 10^{-19}$), concurrent transactions experience benign, temporary lock serialization. Correctness is 100% preserved because internal updates filter strictly on `WHERE id = p_publication_id`.
3. **Monotonic Sequence Allocation**:
   - Sequence numbers per publication are allocated within the advisory lock boundary using `COALESCE(MAX(sequence_number), 0) + 1`.
   - Table constraint: `UNIQUE (publication_id, sequence_number)` and `UNIQUE (publication_id, event_id)`.
4. **Watermark Progression & Contiguous Drainage**:
   - `workflow.publications` maintains `last_applied_sequence integer NOT NULL DEFAULT 0`.
   - The event sequencer processes events only in strictly contiguous ascending order: `sequence_number = last_applied_sequence + 1`.
   - If a gap is detected, subsequent events remain staged in `workflow.publication_events` with status `STAGED_UNAPPLIED`.
   - When missing sequences commit, contiguous events are drained in a single CTE loop:
     ```sql
     WITH contiguous_events AS (
       SELECT id, sequence_number, event_type, payload
       FROM workflow.publication_events
       WHERE publication_id = $1
         AND sequence_number = $2 + 1
       FOR UPDATE
     )
     UPDATE workflow.publications
     SET last_applied_sequence = contiguous_events.sequence_number,
         status = contiguous_events.event_type,
         updated_at = transaction_timestamp()
     FROM contiguous_events
     WHERE workflow.publications.id = $1;
     ```

---

## 2. WP-02: Audit Data Integrity & Deletion Isolation

### Root Problem
In naive schema designs, foreign keys configured with `ON DELETE CASCADE` or `ON DELETE SET NULL` cause historical audit logs and forensic trace records to be silently deleted or corrupted whenever an operational business entity is purged.

### Definitive Technical Resolution
1. **Zero Cascade Policy (`ON DELETE RESTRICT`)**:
   - All relational foreign keys from active operational tables to parent business entities MUST specify `ON DELETE RESTRICT`. Business entities cannot be deleted while child records exist.
2. **Decoupled Autonomous Audit Log**:
   - Audit trail records (`workflow.publication_audit_ledger`) MUST NOT contain enforceable foreign keys to business tables. Instead, business entity IDs (`job_id`, `publication_id`, `owner_uid`) are stored as immutable scalar values (`UUID` or `text`).
   - Audit records commit independently of business transaction rollbacks.
3. **Immutability Enforcement & Limitations**:
   - Database-level trigger preventing `UPDATE` or `DELETE` on the audit ledger:
     ```sql
     CREATE OR REPLACE FUNCTION workflow.fn_enforce_immutable_audit()
     RETURNS trigger AS $$
     BEGIN
       RAISE EXCEPTION 'Audit ledger records are immutable and cannot be updated or deleted.';
     END;
     $$ LANGUAGE plpgsql;

     CREATE TRIGGER trg_audit_ledger_immutable
     BEFORE UPDATE OR DELETE ON workflow.publication_audit_ledger
     FOR EACH ROW EXECUTE FUNCTION workflow.fn_enforce_immutable_audit();
     ```
   - **Privilege Separation**: Application roles have `UPDATE, DELETE` privileges revoked. Only superusers or table owners could alter triggers; operational security relies on privilege separation.
4. **Administrative Corrections**:
   - Corrections to audit events are recorded as new append-only compensation events referencing the previous `audit_id` with `event_type = 'ADMINISTRATIVE_CORRECTION'`.

---

## 3. WP-03: Ingress Composite Foreign Keys & Partitioned Deduplication

### Root Problem
Webhook callbacks delivered by external platforms arrive without prior knowledge of the internal publication primary key, and range-partitioned tables cannot enforce cross-partition global uniqueness on non-partition keys.

### Definitive Technical Resolution
1. **Two-Tier Raw Ingress Decoupling**:
   - **Tier 1 (Raw Transport Ingress)**: `workflow.publication_callback_ingress_ledger` receives raw bytes without foreign key constraints.
     - Captures: `delivery_id UUID`, `platform text`, `received_at timestamptz`, `raw_payload text`, `payload_sha256 bytea`.
     - Primary Key: `(delivery_id, received_at)`.
   - **Cross-Partition Deduplication**: Because `PRIMARY KEY (delivery_id, received_at)` enforces uniqueness only per partition, cross-partition deduplication is handled at the application level via an in-memory/Redis deduplication window or a global unpartitioned ingress registry (`workflow.publication_ingress_registry(delivery_id)`).
   - **Tier 2 (Parsed Business Dispatch)**: Dispatches verified events to `workflow.publications` using composite tenant keys `(publication_id, tenant_id)`.
2. **Composite Tenant Isolation**:
   - Queries and mutations join on composite keys: `(publication_id, owner_uid)` or `(publication_id, tenant_id)`.
   - Constraints enforce `UNIQUE (id, tenant_id)` on `workflow.publications` and foreign keys with `ON DELETE RESTRICT`.

---

## 4. WP-04: Database Partitioning Strategy

### Root Problem
Premature table partitioning introduces unnecessary operational complexity and breaks foreign key integrity into partitioned tables.

### Definitive Technical Resolution
1. **Operational Tables (Unpartitioned)**:
   - `workflow.publications`, `workflow.publication_outbox`, `workflow.publication_attempts`, and `workflow.publication_events` remain unpartitioned B-tree indexed relations.
2. **High-Volume Raw Ingress Ledger (Partitioned by Range)**:
   - `workflow.publication_callback_ingress_ledger` is range-partitioned by `received_at` monthly (`PARTITION BY RANGE (received_at)`).
   - Partitions older than 90 days are detached and archived to cold object storage via `ALTER TABLE ... DETACH PARTITION`.

---

## 5. WP-05: Append-Only Guarantees and Mutable Boundaries

### Definitive Policy & Table Classification

| Classification | Tables Included | Allowed Operations | Enforcement Mechanism |
| :--- | :--- | :--- | :--- |
| **Strictly Append-Only (Immutable)** | `workflow.publication_events`<br>`workflow.publication_callback_ingress_ledger`<br>`workflow.publication_audit_ledger`<br>`publisher.durable_ledger` | `INSERT` only.<br>Zero `UPDATE`.<br>Zero `DELETE`. | PostgreSQL triggers raising exceptions on `UPDATE` or `DELETE`; database user role revoking `UPDATE, DELETE` grants. |
| **State Machine Operational (Bounded Mutable)** | `workflow.publications`<br>`workflow.publication_outbox`<br>`workflow.publication_attempts` | `INSERT`, `UPDATE` (constrained columns only).<br>Zero `DELETE`. | Explicit column whitelist in updates; optimistic locking via monotonic `revision` or `fencing_token`. |
