# Test and Acceptance Matrix

This matrix establishes the required test scenarios, test types, and acceptance criteria across every subsystem.

---

## 1. Test Categorization & Verification Boundaries

| Test Suite Category | Execution Environment | External Network Access Required | Proof of Production Readiness? |
| :--- | :--- | :--- | :--- |
| **Unit Tests** | Node.js native test runner (`tsx --test`) | No | Code logic correctness only |
| **Database & Migration Tests** | Local PostgreSQL 18.4 Docker Testcontainer | No | Relational constraint enforcement |
| **Mock Contract Tests** | Local WireMock / in-memory HTTP server | No | API compatibility under protocol specs |
| **Partner Sandbox Tests** | Controlled staging environment | Yes (to Bilibili Sandbox) | Protocol handshake verification |
| **Production Live Upload** | Restricted production runner | Yes (Real creator account) | Real publication proof |

**Mandatory Directive**: A passing unit or mock integration test MUST NEVER be represented as evidence of a successful live Bilibili upload.

---

## 2. Test Scenarios & Acceptance Criteria

### TS-01: Event Sequence Ordering and Gap Recovery
- **Scenario**: Simulate out-of-order event delivery (Event 3 arrives before Event 2).
- **Assertion**: Event 3 is staged with status `STAGED_UNAPPLIED`. When Event 2 commits, sequence advances from 1 -> 2 -> 3 contiguously. `last_applied_sequence` equals 3.

### TS-02: Concurrent Transaction Advisory Lock Serialization
- **Scenario**: 10 concurrent threads attempt to append events for the same `publication_id`.
- **Assertion**: Advisory lock `pg_advisory_xact_lock` serializes execution without deadlock exceptions; sequence numbers 1 through 10 are allocated contiguously.

### TS-03: Zero Cascade Audit Immutability
- **Scenario**: Execute `DELETE` or `UPDATE` on `workflow.publication_audit_ledger` and `workflow.publication_events`.
- **Assertion**: Trigger `trg_audit_ledger_immutable` raises an exception; row is preserved unchanged.

### TS-04: Outbox Fencing Token Invalidation
- **Scenario**: Worker A claims outbox task with token 1. Worker A stalls beyond lease duration. Worker B claims task with token 2. Worker A wakes up and attempts mutation with token 1.
- **Assertion**: Worker A's mutation fails zero rows updated due to condition `fencing_token = 1 AND lease_expires_at > now()`.

### TS-05: RFC 8785 JCS HMAC Signature Conformance
- **Scenario**: Generate two JSON objects with identical key-value pairs but reversed key order.
- **Assertion**: JCS canonicalizer produces identical byte representations; computed HMAC digests are bit-for-bit identical.

### TS-06: SSRF Socket Level Rejection
- **Scenario**: Supply media URL targeting `http://169.254.169.254/latest/meta-data` and `http://10.0.0.1/private.mp4`.
- **Assertion**: Microservice socket filter aborts connection before HTTP handshake; returns `SSRF_BLOCKED` error code.

### TS-07: Chunked Upload Interruption & Resumption
- **Scenario**: Disconnect upload stream midway through chunk 3 of 5. Re-initiate upload.
- **Assertion**: Uploader queries remote offset, verifies chunks 1 and 2, resumes uploading starting at chunk 3 without repeating prior bytes.
