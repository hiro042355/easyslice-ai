# Production Relational Store Selection ADR V1

> Status: Accepted (engine) / Deferred (managed provider)
> Research date: 2026-07-15
> Scope: design and official-source research only

## Decision Summary

- Select **PostgreSQL** as the V1 relational engine.
- Prefer a **cloud-aligned managed PostgreSQL deployment** with regional HA, PITR, restore drills, private connectivity, encryption, monitoring, and compatible pooling.
- Defer the exact managed provider until cloud, home region, cost, support, version, extension, and pooling decisions are known.
- Use one home-region writer; do not require active-active distributed SQL.
- Begin the Concrete Adapter foundation with **Slice A: Final Result + protected Result Reference + Outbox** in one transaction.
- Keep production connection and production launch prohibited until all gates in this ADR pass.
## 1. Purpose

- This ADR selects the relational engine and deployment direction for the EXCUT durable workflow runtime.
- Research date: **2026-07-15**.
- Decision status: **Accepted for engine; managed provider deferred**.
- The document is a design and research artifact; it introduces no runtime code or dependencies.
- The decision preserves the existing Runtime Interface and Store Contract rather than adapting them to a product.
- All technical product claims are grounded in current official primary documentation.
## 2. Current Foundation

- The production runtime interface, durable-store architecture decision, and contract-test foundation are complete.
- The concrete durable store has not started; production connection and production launch remain prohibited.
- The fixed architecture is primary relational transaction domain plus transactional outbox, separate queue delivery, and optional cache.
- Final Result, protected Result Reference, and Outbox must commit in one transaction.
- Provider I/O remains outside database transactions; queue and cache are not sources of truth.
- The foundation requires a single-writer home region and database-authoritative durable time.
## 3. Selection Scope

- In scope: engine semantics, managed deployment direction, transactions, isolation, claims, clock, outbox, migrations, pooling, backup, restore, regions, and real-engine testing.
- Evaluated candidates: PostgreSQL, Aurora PostgreSQL-Compatible, Cloud SQL for PostgreSQL, AlloyDB, Azure Database for PostgreSQL, Neon, Supabase Postgres, CockroachDB, YugabyteDB, and PlanetScale Postgres.
- Engine selection and managed-service selection are deliberately separate decisions.
- The minimum engine decision must permit the Concrete Adapter foundation to start.
- Pricing is assessed structurally; exact cost needs workload, region, support, storage, and egress inputs.
- Cloud account creation and provider procurement are outside scope.
## 4. Non-goals

- No DB SDK, ORM, query builder, migration runner, schema, table, or Concrete Store Adapter is introduced.
- No production credential, connection string, cloud account, queue, KMS, or Auth provider is selected.
- No active-active multi-region requirement is added.
- No queue or cache is promoted into the durability boundary.
- No Reference fallback is introduced.
- No package or lockfile is changed.
## 5. Decision Drivers

- Correct multi-row atomicity is the first driver, ahead of branding or serverless convenience.
- Native unique constraints, conditional writes, expected-revision CAS, row locking, and fencing must be straightforward.
- The engine must support a transactional outbox in the same commit as authoritative records.
- Operational drivers are regional HA, PITR, tested restore, observable failover, and controlled maintenance.
- Portability, local real-engine tests, mature migration paths, and predictable worker connections reduce delivery risk.
- Single-writer V1 means globally distributed consensus is not a benefit by itself.
## 6. Required Database Semantics

- Required: atomic multi-row transaction and unique constraint enforcement.
- Required: conditional insert, expected-revision CAS, and terminal-overwrite prevention.
- Required: row-level claim, lease expiry, heartbeat, and stale-worker fencing.
- Required: database-authoritative UTC for durable records and leases.
- Required: transactional outbox and consistent Final / Reference / Outbox visibility.
- Required: commit-outcome lookup, safe migrations, fail-closed readiness, backup, restore, and PITR.
## 7. Required Operational Semantics

- The production topology must expose exactly one writable home-region authority per workflow.
- Regional failover may replace the writer, but stale-writer fencing and routing must prevent split authority.
- Backups must be automatic, encrypted, retained by policy, and regularly restored in drills.
- Connection management must support bursty APIs and stable background workers without hiding transaction boundaries.
- Schema changes use ordered, checksummed, expand/contract migrations with separate backfills.
- Readiness fails closed on incompatible schema, read-only endpoints, clock failure, or transaction-capability mismatch.
## 8. Candidate Set

- PostgreSQL is evaluated as the upstream engine and local/CI reference.
- Managed PostgreSQL services are evaluated as deployments, not new semantics.
- Aurora, Cloud SQL, AlloyDB, and Azure Flexible Server are cloud-aligned managed options.
- Neon, Supabase, and PlanetScale Postgres are managed platform/serverless options with distinct operational envelopes.
- CockroachDB and YugabyteDB are distributed SQL alternatives, not assumed drop-in PostgreSQL.
- No candidate is selected only because it exposes the PostgreSQL wire protocol.
## 9. Candidate Inclusion Criteria

- A candidate must support atomic writes across Final Result, Result Reference, and Outbox rows.
- It must offer enforceable unique identity and conditional mutation semantics.
- Claims must be durable row state with a monotonic fencing revision.
- A production deployment must provide backup, restore, PITR, encryption, monitoring, and an HA path.
- A credible local/CI strategy must exercise materially equivalent transaction and locking behavior.
- Any compatibility gap must be explicit and testable.
## 10. Candidate Exclusion Criteria

- Exclude a candidate if multi-row atomicity is absent or transaction semantics are materially ambiguous.
- Exclude if the durable clock cannot be sourced from the database.
- Exclude if correctness depends only on advisory locks, queue delivery, cache state, or client memory.
- Exclude if production backup/restore evidence or supported regional deployment is unavailable.
- Defer rather than reject when the engine fits but cloud, region, pricing, support, or pooling facts are undecided.
- Marketing labels such as serverless, distributed, or PostgreSQL-compatible are not inclusion evidence.
## 11. PostgreSQL Engine

- **Selected engine: upstream PostgreSQL semantics.**
- PostgreSQL supplies atomic transaction blocks, unique indexes, `ON CONFLICT`, conditional `UPDATE`, row locks, and `SKIP LOCKED`.
- Read Committed is the default; Repeatable Read and Serializable remain available for operations that need stronger guarantees.
- The database exposes transaction-, statement-, and wall-clock functions with distinct semantics.
- The ecosystem supports SQL-first migrations and containerized local/CI parity.
- The Concrete Adapter must target an explicitly supported PostgreSQL major version, still a blocking TBD.
## 12. Managed PostgreSQL

- Preferred production direction is cloud-aligned managed PostgreSQL with regional HA, automated backups, PITR, private networking, encryption, monitoring, and a supported pool/proxy.
- The exact managed provider is deferred until deployment cloud, home region, cost ceiling, support, and extension policy are fixed.
- Managed ownership must not weaken transaction or Store Contract semantics.
- The provider must permit direct or session-capable connections for migrations and worker features.
- A provider conformance run of the durable-store suite is mandatory.
- Self-managed PostgreSQL is a portability escape hatch, not the preferred production operating model.
## 13. Aurora PostgreSQL-Compatible

- Aurora PostgreSQL-Compatible is a conditional AWS-aligned option.
- Official documentation describes multi-AZ storage and promotion of an Aurora Replica to writer on failure.
- RDS Proxy can pool connections and reduce failover sensitivity, but proxy feature compatibility must be tested.
- Aurora PITR restores a new cluster within the retention window.
- Compatibility, extensions, engine-version cadence, pricing, and commit-unknown behavior need provider tests.
- Select only if AWS is the deployment cloud and the contract suite passes on the chosen Aurora version.
## 14. Cloud SQL for PostgreSQL

- Cloud SQL for PostgreSQL is a conditional Google Cloud option with regional HA.
- Official HA documentation states synchronous writes to primary and standby-zone disks before commit acknowledgement.
- Failover closes existing connections, so all consumers need reconnect and commit-outcome reconciliation.
- PITR and automated backup policy must be enabled and restore-drilled.
- Connection limits, private networking, maintenance, extensions, and pooling topology remain deployment inputs.
- It is a strong default if Google Cloud is selected and AlloyDB-specific benefits are unnecessary.
## 15. AlloyDB

- AlloyDB is a conditional Google Cloud PostgreSQL-compatible managed option.
- Official documentation provides continuous backup and recovery with configurable retention and same-region cluster restore.
- Its managed storage/compute architecture may improve performance but increases platform specificity.
- PostgreSQL compatibility, extensions, transaction edge cases, and pool behavior require contract tests.
- Cost and minimum topology may exceed V1 needs.
- Choose only from measured workload and operations evidence, not the premium product label.
## 16. Azure Database for PostgreSQL

- Azure Database for PostgreSQL Flexible Server is a conditional Azure-aligned option.
- Official HA documentation describes primary/standby configurations and synchronous commit persistence.
- PITR restores into a new server and logical errors require backup recovery rather than standby promotion.
- Failover connection behavior, pooling, extensions, maintenance, and regional availability need validation.
- It fits the selected engine direction if Azure is chosen.
- No Azure-specific feature becomes part of the Store Contract.
## 17. Neon

- Neon is a deferred serverless PostgreSQL candidate.
- Its separated compute/storage, pooled endpoints, branching, scale behavior, and restore features are operationally attractive.
- Suspension/cold-start behavior, long-running workers, scheduler cadence, transaction duration, private connectivity, and support tier require proof.
- All connections traversing a proxy makes proxy semantics and failure handling material.
- It may be valuable for preview and CI branches, but production equivalence cannot be assumed.
- Adopt only after a sustained-worker, burst, failover, PITR, and contract-test evaluation.
## 18. Supabase Postgres

- Supabase Postgres is a deferred hosted PostgreSQL platform candidate.
- The database engine can fit, while Auth, Storage, Realtime, and Edge Functions are separate platform features and are not selected here.
- Official docs describe direct, session, and transaction pooling through Supavisor plus daily backups and optional PITR.
- Transaction pooling compatibility must be evaluated per consumer; migrations must not depend on incompatible session behavior.
- Backup scope excludes some platform objects, reinforcing separation between workflow DB and platform services.
- Selection requires clear production ownership and a database-only operational plan.
## 19. CockroachDB

- CockroachDB is not selected for V1.
- It provides distributed ACID transactions and defaults to Serializable, but its transaction retries and ambiguous-result handling differ operationally from PostgreSQL.
- Its PostgreSQL compatibility is meaningful but not identity; SQL, locking, isolation, and migration behavior require a separate adapter profile.
- Geo-distributed consensus does not solve a V1 requirement because writes are intentionally single-home-region.
- Operational and test complexity would expand the first adapter slice.
- Revisit only if active multi-region write survivability becomes a real requirement.
## 20. YugabyteDB

- YugabyteDB is not selected for V1.
- It presents a PostgreSQL-compatible distributed SQL surface, but distributed transaction, retry, locality, operational, and upgrade semantics expand the proof burden.
- The current V1 contract does not require active-active or globally distributed writes.
- Local testing would need a materially different topology from a single PostgreSQL container.
- A separate conformance and failure-injection program would be required.
- Revisit only with a quantified geographic availability requirement that managed PostgreSQL cannot meet.
## 21. Other Current Candidates

- PlanetScale Postgres exists as a current managed PostgreSQL offering and is a deferred candidate.
- Official documentation describes single-region multi-AZ deployment, backups, WAL-based PITR, and branch-based restore.
- Its current service maturity, regional list, support, pooling, extensions, cost, and worker behavior must be assessed before production selection.
- It does not change the selected engine decision.
- Other PostgreSQL hosts may enter later if they meet the same conformance gate.
- New candidates cannot bypass the transaction, restore, and failure-injection matrices.
## 22. SQL Compatibility

- Decision: SQL Compatibility must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 23. Transaction Semantics

- Decision: Transaction Semantics must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Transaction Semantics Matrix

| Candidate | ACID transaction | Multi-row atomicity | Isolation options | Serialization conflict | Deadlock handling | Commit unknown behavior | Conditional insert | CAS support | Suitability |
|---|---|---|---|---|---|---|---|---|---|
| PostgreSQL | Yes | Yes | RC/RR/Serializable | SQLSTATE retry | Detect/abort one txn | Lookup protected identity; no blind retry | Unique + ON CONFLICT | Conditional UPDATE | Selected |
| Aurora PostgreSQL | Yes | Yes | PostgreSQL-compatible; verify version | Driver/provider test | PostgreSQL mapping; test failover | Reconnect then lookup | Supported; test | Supported; test | Conditional |
| Cloud SQL PostgreSQL | Yes | Yes | PostgreSQL engine | PostgreSQL mapping | PostgreSQL mapping | Failover closes connections; lookup | Supported | Supported | Conditional |
| AlloyDB | Yes | Yes | PostgreSQL-compatible; verify | Provider test | Provider test | Reconnect then lookup | Supported; test | Supported; test | Conditional |
| Azure PostgreSQL | Yes | Yes | PostgreSQL engine | PostgreSQL mapping | PostgreSQL mapping | Reconnect then lookup | Supported | Supported | Conditional |
| Neon | Yes | Yes | PostgreSQL; version-specific | PostgreSQL mapping | PostgreSQL mapping | Proxy loss then lookup | Supported | Supported | Deferred |
| Supabase Postgres | Yes | Yes | PostgreSQL; plan/version-specific | PostgreSQL mapping | PostgreSQL mapping | Pool/direct loss then lookup | Supported | Supported | Deferred |
| CockroachDB | Yes | Yes | Serializable/Read Committed | Explicit retry model | Retry/abort semantics differ | Documents ambiguous errors | Supported | Conditional UPDATE | Rejected V1 |
| YugabyteDB | Yes | Yes | Distributed PostgreSQL-compatible | Separate proof required | Separate proof required | Separate proof required | Likely; verify | Likely; verify | Rejected V1 |
| PlanetScale Postgres | Yes | Yes | PostgreSQL; service-specific | PostgreSQL mapping; test | PostgreSQL mapping; test | Proxy/failover lookup | Supported; test | Supported; test | Deferred |
## 24. Isolation

- Decision: Isolation must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Isolation Mapping

| Store operation | V1 isolation / primitive | Conflict outcome |
|---|---|---|
| createIfAbsent | Read Committed + UNIQUE + INSERT ON CONFLICT DO NOTHING | Existing authoritative row wins |
| expected revision CAS | Read Committed + conditional UPDATE predicate | Zero rows means CAS conflict |
| terminal overwrite prevention | Conditional UPDATE with lifecycle predicate | Zero rows; never overwrite terminal |
| claim / heartbeat / release | Short transaction + row lock or atomic conditional UPDATE | Loser observes no claim; fence increments |
| Final + Reference + Outbox | One short transaction; Read Committed plus constraints, elevate only if anomaly test requires | All commit or all roll back |
| cross-row invariant not encoded by constraints | Serializable or explicit deterministic locking | Retry boundedly, then surface typed conflict |
## 25. Conditional Insert

- Decision: Conditional Insert must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 26. CAS

- Decision: CAS must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 27. Row Locking

- Decision: Row Locking must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 28. Skip Locked

- Decision: Skip Locked must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 29. Advisory Locks

- Decision: Advisory Locks must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 30. Claim / Lease

- Decision: Claim / Lease must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Claim / Lease Mapping

- Candidate selection may use `SELECT ... FOR UPDATE SKIP LOCKED` to distribute eligible rows across workers.
- The correctness boundary is the durable conditional update, not the skipped-lock scan.
- Claim writes owner token/handle, lease deadline from database time, and increments fencing revision atomically.
- Heartbeat succeeds only when owner and expected fencing revision match and the record is still claimable.
- Lease expiry makes the row reclaimable; it does **not** authorize a duplicate provider submit.
- Every stale worker write includes the old fence and is rejected after a newer claim.
## 31. Fencing Revision

- Decision: Fencing Revision must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 32. Database Clock

- Decision: Database Clock must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Clock Function Mapping

| Need | PostgreSQL source | Rule |
|---|---|---|
| transaction-consistent created/updated time | `transaction_timestamp()` / `CURRENT_TIMESTAMP` | Stable within transaction |
| per-statement diagnostic time | `statement_timestamp()` | Use only when statement start is intended |
| lease decision at actual execution time | `clock_timestamp()` normalized to UTC | May advance within transaction; keep transaction short |
| persisted type | `timestamptz` | Store instant; display timezone is a session concern |
| in-process timeout | injected monotonic clock | Never persisted as durable authority |
| replica read | not authoritative for write/lease decisions | Route durable decisions to writer |
## 33. Transactional Outbox

- Decision: Transactional Outbox must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Final / Reference / Outbox Atomicity

1. Open one writer connection and begin one database transaction.
2. Insert the immutable Final Result or prove the existing compatible result.
3. Insert the protected Result Reference index under a unique protected identity.
4. Insert the unpublished Outbox event with a deterministic event identity.
5. Commit once; any statement failure rolls back all three writes.
6. If commit acknowledgement is lost, reconnect and look up by protected identities; never blindly repeat side effects.
## 34. Durable Inbox

- Decision: Durable Inbox must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 35. Unique Constraints

- Decision: Unique Constraints must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 36. Partial Indexes

- Decision: Partial Indexes must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 37. JSON

- Decision: JSON must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 38. Binary / Large Payload

- Decision: Binary / Large Payload must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Payload Boundary

- Large provider media remains object storage content; the relational store holds validated handles and bounded metadata.
- Restricted Input is stored as an encrypted payload handle plus schema version, key version, tenant, region, operation, and lifecycle metadata.
- Plaintext safety is not claimed merely because disk encryption exists.
- Application envelope encryption compatibility is required; KMS provider and ciphertext format remain Security ADR TBDs.
- Protected identity uses a versioned fixed-length binary digest or fixed-length encoded text under a unique index.
- Raw public tokens are never primary keys; hash algorithm, rotation, and collision response remain deferred.
## 39. Encryption

- Decision: Encryption must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 40. KMS Integration

- Decision: KMS Integration must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 41. Backup

- Decision: Backup must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 42. Point-in-time Recovery

- Decision: Point-in-time Recovery must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 43. Restore

- Decision: Restore must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 44. High Availability

- Decision: High Availability must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 45. Read Replicas

- Decision: Read Replicas must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 46. Failover

- Decision: Failover must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 47. Single Writer

- Decision: Single Writer must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 48. Multi-region

- Decision: Multi-region must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Home-region Writer Protocol

- Each workflow has one authoritative home region and one writable database endpoint at a time.
- API, worker, scheduler, and webhook mutations route to that writer authority.
- Read replicas may serve explicitly stale-tolerant reads only; never claims, CAS, lease, or reconciliation decisions.
- Promotion is an operator/provider action paired with routing convergence and stale-writer fencing.
- Cross-region active-active writes are outside V1.
- Residency policy can restrict home-region placement and backup destinations without changing transaction semantics.
## 49. Region Availability

- Decision: Region Availability must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 50. Residency

- Decision: Residency must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 51. Connection Pooling

- Decision: Connection Pooling must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Consumer Pooling Direction

| Consumer | Preferred connection mode | Constraint |
|---|---|---|
| API | managed proxy or transaction-aware application pool | Entire transaction must stay on one backend connection |
| Worker | bounded application pool or session-compatible managed pool | Stable long-running work; no lease transaction held during provider I/O |
| Scheduler | small bounded pool | Short claim batches; backpressure on exhaustion |
| Webhook | burst-capable pool/proxy | Idempotency and commit lookup survive disconnects |
| Migration runner | direct/session connection | Must support advisory migration lock if chosen and non-transactional DDL |
| Operator tool | direct/session, least privilege | Audited and separately limited |
## 52. Serverless Connection Model

- Decision: Serverless Connection Model must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 53. Long-running Worker Connections

- Decision: Long-running Worker Connections must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 54. Webhook Connections

- Decision: Webhook Connections must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 55. Migration Tooling

- Decision: Migration Tooling must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Migration Direction Decision

- Select **SQL-first, ordered, checksummed migrations** as the source of truth.
- Select a dedicated migration-tool direction, but defer the product until driver and deployment provider are chosen.
- ORM or query-builder models may consume schema types later; they do not own production schema truth.
- Use expand/contract changes, forward-fix rollback policy, explicit readiness versions, and separate resumable backfills.
- Online index creation is a migration phase because PostgreSQL `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block.
- CI applies every migration from empty and from the last supported release, detects checksum drift, and runs contract tests.
## 56. Schema Versioning

- Decision: Schema Versioning must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 57. Rolling Deployment

- Decision: Rolling Deployment must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 58. Backfill

- Decision: Backfill must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 59. Online Index Creation

- Decision: Online Index Creation must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 60. Observability

- Decision: Observability must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 61. Metrics

- Decision: Metrics must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 62. Audit

- Decision: Audit must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 63. Query Tracing

- Decision: Query Tracing must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 64. Performance

- Decision: Performance must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 65. Capacity

- Decision: Capacity must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 66. Rate Limits

- Decision: Rate Limits must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 67. Storage Limits

- Decision: Storage Limits must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 68. Connection Limits

- Decision: Connection Limits must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 69. Cost Model

- Decision: Cost Model must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 70. Development Environment

- Decision: Development Environment must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 71. CI Environment

- Decision: CI Environment must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 72. Contract Test Execution

- Decision: Contract Test Execution must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 73. Failure Injection

- Decision: Failure Injection must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Failure Injection Matrix

| Failure | Required environment | Assertion |
|---|---|---|
| unique conflict | local/CI PostgreSQL | one winner; typed existing/conflict result |
| CAS conflict | local/CI PostgreSQL | zero-row loser; no overwrite |
| deadlock | local/CI PostgreSQL | typed retryable error; bounded retry |
| serialization conflict | local/CI PostgreSQL | bounded whole-transaction retry |
| connection loss before commit | proxy/fault harness | rollback or unknown; no false success |
| connection loss after commit | proxy/fault harness | protected lookup reconciles outcome |
| pool exhaustion | integration | bounded wait and readiness signal |
| failover/read-only/stale writer | provider staging | reconnect, reject write, preserve fence |
| migration mismatch | CI/staging | readiness fails closed |
## 74. Local Emulation

- Decision: Local Emulation must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 75. Vendor Lock-in

- Decision: Vendor Lock-in must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 76. Portability

- Decision: Portability must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 77. Operational Complexity

- Decision: Operational Complexity must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 78. Security

- Decision: Security must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 79. Compliance

- Decision: Compliance must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 80. Data Deletion

- Decision: Data Deletion must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 81. Legal Hold

- Decision: Legal Hold must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 82. Disaster Recovery

- Decision: Disaster Recovery must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 83. Support

- Decision: Support must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 84. Candidate Comparison Matrix

- Decision: Candidate Comparison Matrix must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Candidate Comparison Matrix

| Candidate | Engine | Managed owner | Transaction fit | Claim/lease fit | Outbox fit | Migration fit | Single-writer region fit | Worker fit | Local test fit | Operational complexity | Vendor lock-in | Cost certainty | Blocking issue |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PostgreSQL | PostgreSQL | deployment-dependent | Excellent | Excellent | Excellent | Excellent | Excellent | Excellent | Exact container | Medium | Low | Deployment-dependent | major/version/provider |
| Aurora PostgreSQL | PostgreSQL-compatible | AWS | Strong/test | Strong/test | Strong/test | Strong | Excellent | Strong | Upstream approximation | Medium | Medium-high | Medium | cloud/region/version/cost |
| Cloud SQL PostgreSQL | PostgreSQL | Google | Strong | Strong | Strong | Strong | Excellent | Strong | Exact major locally | Medium | Medium | Medium | cloud/region/tier |
| AlloyDB | PostgreSQL-compatible | Google | Strong/test | Strong/test | Strong/test | Strong | Excellent | Strong/test | Upstream approximation | Medium-high | High | Low-medium | measured need/cost |
| Azure PostgreSQL | PostgreSQL | Microsoft | Strong | Strong | Strong | Strong | Excellent | Strong | Exact major locally | Medium | Medium | Medium | cloud/region/tier |
| Neon | PostgreSQL | Neon | Strong/test | Test cold/proxy | Strong/test | Strong | Good | Test sustained workload | Exact engine approximation | Low-medium | Medium | Medium | worker/support/private path |
| Supabase Postgres | PostgreSQL | Supabase | Strong/test | Strong/test | Strong/test | Strong | Good | Pool-mode test | Exact major locally | Medium | Medium-high platform | Medium | ownership/PITR/pool mode |
| CockroachDB | Distributed SQL | Cockroach Labs | Strong/different | Different | Strong/different | Different | Excess capability | Retry burden | Different engine | High | High | Medium | unnecessary semantic expansion |
| YugabyteDB | Distributed SQL | Yugabyte | Strong/different | Different | Strong/different | Different | Excess capability | Retry/topology proof | Different cluster | High | High | Medium | unnecessary semantic expansion |
| PlanetScale Postgres | PostgreSQL | PlanetScale | Strong/test | Strong/test | Strong/test | Strong | Strong | Test | Exact approximation | Low-medium | Medium | Medium | maturity/region/support |
## 85. Semantic Compliance Matrix

- Decision: Semantic Compliance Matrix must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Required Semantic Compliance

| Semantic | PostgreSQL decision | Proof gate |
|---|---|---|
| multi-row atomicity | native transaction | rollback and visibility tests |
| conditional insert | UNIQUE + ON CONFLICT | concurrent winner test |
| CAS / terminal guard | predicate UPDATE | concurrent revision test |
| claim / lease | row state + conditional update + fence | multi-worker race test |
| durable clock | writer DB UTC | clock boundary test |
| outbox | same transaction | three-row atomicity test |
| commit unknown | protected lookup | disconnect-before/after-commit test |
## 86. Operational Compliance Matrix

- Decision: Operational Compliance Matrix must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Operational Compliance

| Capability | Production minimum | Status |
|---|---|---|
| HA | same-region multi-zone writer failover | provider TBD |
| backup | automatic encrypted retained backups | provider TBD |
| PITR | documented recovery window | provider TBD |
| restore | tested into isolated target | mandatory gate |
| private networking | app/worker access without public trust dependency | provider TBD |
| observability | DB, pool, lock, transaction, storage, backup metrics | mandatory gate |
| region/residency | chosen home region and backup policy | blocking TBD |
## 87. Cost / Complexity Matrix

- Decision: Cost / Complexity Matrix must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Cost / Complexity Matrix

| Direction | Fixed cost | Variable uncertainty | Operations | V1 position |
|---|---|---|---|---|
| self-managed PostgreSQL | infrastructure lower/variable | staff/on-call high | High | fallback only |
| hyperscaler managed PostgreSQL | tier-dependent | storage/IO/backup/egress | Medium | preferred direction |
| premium compatible service | higher minimum possible | IO/topology/support | Medium | conditional |
| serverless PostgreSQL | lower idle possible | compute/egress/retention | Low-medium | deferred pending workers |
| distributed SQL | multi-node minimum | regions/consensus/support | High | rejected V1 |
## 88. Risks

- Decision: Risks must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 89. Selected Engine

- Decision: Selected Engine must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Engine Decision

- **Selected: PostgreSQL.**
- Evidence: native atomic transactions, mature constraints and locking, explicit isolation, durable time functions, SQL-first migration support, and exact local execution.
- Rejected as the V1 engine: CockroachDB and YugabyteDB because their distributed semantics add retry, compatibility, topology, and test obligations without a V1 requirement.
- Managed PostgreSQL-compatible variants remain deployments subject to conformance, not independent contract semantics.
- The selected abstraction is not the vague phrase “PostgreSQL-compatible”; the adapter baseline is a named PostgreSQL major and verified feature set.
- Major version remains blocking before schema and driver implementation.
## 90. Selected Deployment Direction

- Decision: Selected Deployment Direction must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Deployment Direction Decision

- Preferred: managed PostgreSQL aligned to the eventual application cloud and home region.
- Required features: regional multi-zone HA, automatic encrypted backups, PITR, restore-to-isolated-target, private network path, metrics, supported upgrades, and compatible pooling.
- Fallback: another managed PostgreSQL provider passing the same gates; self-managed production requires a separate operations ADR.
- Deferred choices: Aurora, Cloud SQL, AlloyDB, Azure Flexible Server, Neon, Supabase, and PlanetScale Postgres.
- Provider selection cannot be completed until deployment cloud, region/residency, RPO/RTO, cost ceiling, support, and workload targets are fixed.
- Provider-specific optimizations cannot leak into the Runtime Interface.
## 91. Rejected Candidates

- Decision: Rejected Candidates must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Rejection Record

- CockroachDB: rejected for V1 due to distributed retry/ambiguity semantics and unnecessary global-write complexity.
- YugabyteDB: rejected for V1 due to distributed topology, compatibility, migration, and operational proof burden.
- An embedded substitute is rejected as Concrete Adapter acceptance evidence.
- An in-memory mock is rejected as proof of locks, isolation, commit ambiguity, failover, or migration behavior.
- Queue-first and cache-first durability are rejected by the existing architecture decision.
- Self-managed PostgreSQL is not rejected technically, but is rejected as the preferred production operating direction.
## 92. Conditional Candidates

- Decision: Conditional Candidates must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Conditional / Deferred Record

- Aurora: conditional on AWS, version compatibility, contract suite, region, support, and cost.
- Cloud SQL: conditional on Google Cloud, region, tier, pooling, and restore drill.
- AlloyDB: conditional on Google Cloud plus measured performance/availability justification.
- Azure Flexible Server: conditional on Azure, region, tier, pooling, and restore drill.
- Neon, Supabase, PlanetScale Postgres: deferred pending worker/proxy, support, region, private network, PITR, and failure testing.
- Deferral is not approval for production connection.
## 93. Implementation Consequences

- Decision: Implementation Consequences must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 94. Migration Consequences

- Decision: Migration Consequences must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 95. Testing Consequences

- Decision: Testing Consequences must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 96. Runtime Interface Consequences

- Decision: Runtime Interface Consequences must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 97. Contract Test Consequences

- Decision: Contract Test Consequences must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 98. Adapter Plan

- Decision: Adapter Plan must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Adapter Sequence

1. Define the PostgreSQL transaction/error/clock mapping without installing a driver.
2. Build Slice A schema and migration contract: Final Result, protected Reference, Outbox.
3. Implement transaction adapter, clock adapter, Slice A store backend, failure mapper, and readiness check.
4. Run the full durable-store contract suite against containerized PostgreSQL.
5. Add proxy disconnect and commit-unknown integration tests.
6. Only then proceed to Slice B idempotency and Slice C Generation Job claim/lease.
## 99. Schema Foundation Plan

- Decision: Schema Foundation Plan must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 100. Migration Foundation Plan

- Decision: Migration Foundation Plan must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 101. Connection Foundation Plan

- Decision: Connection Foundation Plan must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 102. Acceptance Gates

- Decision: Acceptance Gates must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Gate Checklist

- [x] Relational engine selected: PostgreSQL.
- [x] Transaction, isolation, CAS, claim, fencing, clock, outbox, pooling, migration, local/CI, and first-slice directions fixed.
- [x] Multi-region model fixed to single home-region writer.
- [ ] PostgreSQL major version, SQL client/driver, and migration tool selected.
- [ ] Managed provider, cloud, region, RPO/RTO, pool/proxy, limits, KMS, support, owner, load target, and cost ceiling selected.
- [ ] Provider conformance, failover, PITR, and restore drills passed.
## 103. Stop Conditions

- Decision: Stop Conditions must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Concrete Adapter Stop Conditions

- Stop if a schema proposal cannot commit Final, Reference, and Outbox atomically.
- Stop if CAS, terminal guard, claim, fence, or database-clock mapping becomes ambiguous.
- Stop if tests use only an in-memory adapter or hide provider differences with direct casts/mocks.
- Stop if commit unknown is converted to blind retry or success without protected lookup.
- Stop if managed constraints require changing the Runtime Interface or moving durability to queue/cache.
- Stop production connection until provider, network, credentials, encryption, region, backup, restore, and readiness gates pass.
## 104. Revisit Conditions

- Decision: Revisit Conditions must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.
## 105. Open Questions

- Decision: Open Questions must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Blocking TBDs

- Deployment cloud, managed provider, database major version, extension policy, pooling service, and connection limits.
- Migration tool, SQL client/driver, query builder (if any), and schema code-generation direction.
- Backup RPO/RTO, restore drill cadence, region list, home-region routing, and failover authority.
- Protected identity hash/version, KMS, restricted ciphertext storage, key rotation, and audit retention.
- Staging topology, load target, operational owner, support tier, and cost ceiling.
- These block production connection; major version/driver/migration tool block concrete implementation beyond design.
## 106. Final Decision Matrix

- Decision: Final Decision Matrix must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Final Decision Matrix

| Decision | Selected | Reason | Evidence | Rejected | Consequence | Blocking TBD | Revisit trigger |
|---|---|---|---|---|---|---|---|
| engine | PostgreSQL | best semantic/local fit | official transaction/lock/time docs | distributed SQL V1 | PostgreSQL-specific foundation | major version | global-write requirement |
| deployment model | managed, cloud-aligned | lower operational burden | provider HA/PITR docs | self-managed preferred | provider conformance required | cloud/region/provider | operating-model change |
| isolation | operation-specific RC + constraints/locks; Serializable when proven | avoids blanket retry burden | PostgreSQL isolation model | one level for all | document per method | anomaly tests | new invariant |
| CAS | conditional UPDATE + expected revision | atomic winner test | row-count/constraint semantics | read-then-write | typed conflict | schema predicate | contract change |
| claim | durable row + conditional update + fence; SKIP LOCKED discovery | survives workers | PostgreSQL locking | advisory-only | short transactions | schema/index | contention result |
| clock | writer DB UTC | durable authority | PostgreSQL time functions | process wall clock | injected monotonic only for timeout | timezone/session policy | provider clock issue |
| outbox | same transaction | prevents dual-write gap | PostgreSQL atomicity | queue-first | dispatcher separate | schema | CDC decision |
| inbox | durable unique dedupe row when required | idempotent intake | unique constraints | cache dedupe | later slice | retention | intake model |
| pooling | per-consumer; migration direct/session | preserves features | official provider pool docs | one mode for all | capability tests | service/limits | topology change |
| migration | SQL-first dedicated tool direction | auditable portable schema | PostgreSQL DDL docs | ORM source of truth | product deferred | tool | proven alternative |
| local testing | containerized PostgreSQL | exact semantics | upstream engine | embedded-only | required in CI | major/image | equivalent harness |
| CI testing | clean/upgrade migrations + contract/failure tests | catches drift/races | contract foundation | mock-only | more CI time | runner resources | test strategy change |
| backup | managed automatic + encrypted + restore drill | recoverability | provider docs | backup checkbox only | operational gate | RPO/RTO | regulation |
| multi-region | single home-region writer | fixed V1 architecture | existing ADR | active-active | explicit promotion | routing/regions | global-write SLA |
| first adapter slice | Final + Reference + Outbox | highest atomicity risk | Store Contract | broad all-store build | narrow proof | schema foundation | contract priority |
| driver timing | next foundation, before code | no package changes here | scope rule | premature install | production still blocked | driver/tool/version | benchmark/support result |
## 107. Readiness

- Decision: Readiness must preserve upstream PostgreSQL semantics and the fixed durable-store boundary.
- V1 mapping: use database rows, constraints, and short transactions; do not move correctness into queue, cache, or process memory.
- Acceptance evidence: the PostgreSQL contract suite plus provider-specific integration and failure tests.
- Operational evidence: official availability, limits, security, backup, restore, migration, and region documentation.
- Open details remain explicit TBDs rather than guessed defaults.
- Consequence: an incompatible product feature is disabled or the candidate is rejected for production.

### Readiness Verdict

- The **PostgreSQL schema/transaction foundation and Slice A design may start** because the engine and semantic mappings are selected.
- Installing a driver, writing schema/migrations, or connecting to production is not authorized by this ADR.
- Concrete code remains blocked on PostgreSQL major version, driver, migration tool, and detailed schema foundation approval.
- Production connection remains blocked on managed provider, cloud, region, networking, credentials, pooling, KMS/encryption, limits, backups, PITR, restore drill, monitoring, and ownership.
- The next artifact should be **PostgreSQL Durable Store Schema Foundation Contract V1**, centered on Slice A and SQL-first migration invariants.
- Production launch remains prohibited.

## Official Source Register

Technical product claims in this ADR use official documentation, architecture, availability, limits/pricing, migration, or security material. Blogs, comparison sites, and affiliate material are not decision evidence.

- PostgreSQL: [Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html), [INSERT](https://www.postgresql.org/docs/current/sql-insert.html), [Date/Time Functions](https://www.postgresql.org/docs/current/functions-datetime.html), [CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html).
- AWS: [Aurora high availability](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.AuroraHighAvailability.html), [Aurora PITR](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-pitr.html), [RDS Proxy for Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/rds-proxy.html).
- Google Cloud: [Cloud SQL HA](https://cloud.google.com/sql/docs/postgres/high-availability), [Cloud SQL instance settings](https://cloud.google.com/sql/docs/postgres/instance-settings), [AlloyDB backup and recovery](https://cloud.google.com/alloydb/docs/backup/overview).
- Microsoft: [Azure Database for PostgreSQL reliability and HA](https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-high-availability).
- Neon: [Documentation](https://neon.com/docs/introduction), [Connection pooling](https://neon.com/docs/connect/connection-pooling), [Regions](https://neon.com/docs/introduction/regions).
- Supabase: [Database overview and connections](https://supabase.com/docs/guides/database/overview), [Database backups and PITR](https://supabase.com/docs/guides/platform/backups), [Read replicas](https://supabase.com/docs/guides/platform/read-replicas).
- Cockroach Labs: [Transactions](https://www.cockroachlabs.com/docs/stable/transactions), [SELECT FOR UPDATE](https://www.cockroachlabs.com/docs/stable/select-for-update), [Backup](https://www.cockroachlabs.com/docs/stable/backup), [Restore](https://www.cockroachlabs.com/docs/stable/restore).
- YugabyteDB: [Transactions](https://docs.yugabyte.com/stable/architecture/transactions/), [PostgreSQL compatibility](https://docs.yugabyte.com/stable/explore/postgresql-compatibility/), [Backup and restore](https://docs.yugabyte.com/stable/manage/backup-restore/).
- PlanetScale: [Postgres architecture](https://planetscale.com/docs/postgres/postgres-architecture), [Backups and restore](https://planetscale.com/docs/postgres/backups), [Pricing](https://planetscale.com/docs/postgres/pricing).
