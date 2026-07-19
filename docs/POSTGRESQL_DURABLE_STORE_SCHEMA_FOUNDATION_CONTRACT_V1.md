# PostgreSQL Durable Store Schema Foundation Contract V1

> Status: Accepted schema direction / Implementation blocked
> Foundation date: 2026-07-16
> Scope: logical schema contract only

## Contract Summary

- Dedicated PostgreSQL schema: `workflow`.
- Primary tables: `workflow_final_results`, `workflow_result_references`, `workflow_outbox_events`.
- Slice A atomicity: all three rows commit or roll back on one writer connection and transaction.
- Representation: normalized identities/lifecycle plus bounded versioned JSONB payloads.
- Status values: text with named CHECK constraints; no PostgreSQL ENUM in V1.
- Protected identities: algorithm/version plus fixed-length `bytea`; raw tokens never persist.
- Implementation remains blocked by PostgreSQL major, driver, migration tool, generator, digest, and exact migration contract.

## 1. Purpose
- This contract fixes the PostgreSQL V1 schema boundary for the first concrete durable-store slice.
- Slice A is Final Result plus protected Result Reference plus Outbox in one atomic transaction.
- This is a logical schema contract, not executable SQL, migration, driver, ORM, or adapter implementation.
- It preserves the Runtime Interface as the source contract; schema design must conform to it.
- Status: schema direction accepted; implementation remains blocked by the explicit stop conditions.
## 2. Current Foundation
- PostgreSQL is the selected relational engine; the managed provider remains deferred.
- The architecture is a primary relational transaction domain with transactional outbox, separate queue delivery, and optional cache.
- `FinalResultStore`, `ResultReferenceVault`, and `OutboxStore` exist as production interfaces but no concrete production adapter exists.
- The durable contract suite already fixes atomicity, CAS, claims, commit-unknown lookup, mutation isolation, and safe failures.
- Production connection and launch remain prohibited.
## 3. Scope
- In scope: `workflow_final_results`, `workflow_result_references`, and `workflow_outbox_events`.
- A minimal `workflow_schema_metadata` control table is included; migration history remains migration-tool owned unless the selected tool cannot provide it.
- A minimal `workflow_writer_epochs` control table is conditionally required for failover fencing.
- Naming, constraints, indexes, transactions, versioning, migration, readiness, security, backup, and test mapping are included.
- Future store families receive namespace guidance only.
## 4. Non-goals
- Accepted Persistence, Poll State, Resume, Generation Job, Restricted Input, API Idempotency, Materialization, Output Ingestion, Auth/CSRF, Billing, and Asset metadata schemas are excluded.
- No physical SQL, migration file, table creation, DB connection, Docker configuration, package, or dependency is introduced.
- No raw public token, raw idempotency key, raw fingerprint, provider secret, signed URL, locator, or provider output reference is stored.
- No retention duration, performance target, cloud provider, PostgreSQL major, driver, migration tool, KMS, or digest algorithm is guessed.
- No Runtime Interface method or Result union is changed for schema convenience.
## 5. Schema Principles
- Use constraints for invariants that PostgreSQL can enforce without reimplementing TypeScript DTO validation.
- Keep the authoritative aggregate, capability index, and delivery intent normalized into three tables.
- Use hybrid payloads: indexed lifecycle and identity columns plus versioned, bounded JSONB for safe terminal branches.
- Prefer explicit application statements over triggers and hidden database behavior.
- All names, versions, clocks, and failure mappings must be deterministic and readiness-verifiable.
## 6. Required Invariants
- Final Result is commit-once; terminal Result is immutable except approved lifecycle metadata under CAS.
- A Result Reference is never published without its Final Result, and a terminal DTO is never published without an active resolvable Reference.
- Business commit is incomplete without its Outbox row; all three tables commit on one connection and transaction.
- Same result identity yields the same Reference; different result identities cannot share a Reference.
- Resolution enforces owner, protected tenant, region, operation, lifecycle, expiry, revocation, and deletion.
- Success-like results alone hold formal assets; failed alone holds safe error; commit unknown is reconciled by protected identities.
## 7. PostgreSQL Assumptions
- Required semantics are atomic multi-row transactions, UNIQUE, foreign keys, CHECK, conditional update, row locking, `SKIP LOCKED`, JSONB, `bytea`, and `timestamptz`.
- Read Committed is the default with operation-specific constraints and locks; stronger isolation is exceptional and tested.
- Durable time comes from the writable PostgreSQL database; process clocks do not author persisted lease or commit time.
- Concurrent index construction requires non-transactional migration-runner support and explicit invalid-index recovery.
- Provider-specific PostgreSQL compatibility must pass the same schema and contract suite.
## 8. Version Assumptions
- The PostgreSQL major version remains a blocking TBD and is not selected here.
- The version owner is Data Platform with Runtime Architecture, Security, and Operations approval.
- Before migration work, select a supported non-EOL major and record provider availability, upgrade path, extension policy, and CI image parity.
- Minimum required features are those listed in chapter 7; exact syntax is validated only after the major is fixed.
- Unsupported or EOL majors fail readiness and block migration and adapter implementation.
## 9. Naming Convention
- Use lowercase `snake_case`; plural table names; singular columns; no quoted mixed-case identifiers.
- Names begin with the bounded `workflow_` context only where the object is outside the dedicated schema or where cross-schema clarity is needed.
- Constraint and index names encode table abbreviation, columns/predicate purpose, and kind.
- Application concepts retain Runtime names in documentation while physical names remain stable and provider-neutral.
- Abbreviations must be registered; opaque vendor suffixes are prohibited.
## 10. Schema Namespace
- **Selected: dedicated PostgreSQL schema `workflow`.**
- `public` is rejected because it weakens privilege, ownership, and drift boundaries.
- A separate database is deferred because Slice A needs one transaction domain and additional database operations add complexity.
- Repository search found no existing physical `workflow` schema or migration namespace collision.
- Every runtime and migration connection sets or qualifies the schema explicitly; `search_path` is not trusted implicitly.
## 11. Table Namespace
- Contract: Table Namespace is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.

| Logical family | V1 physical name | Status |
|---|---|---|
| Final Result | `workflow.workflow_final_results` | Included |
| Result Reference | `workflow.workflow_result_references` | Included |
| Outbox | `workflow.workflow_outbox_events` | Included |
| Schema metadata | `workflow.workflow_schema_metadata` | Minimal control table |
| Migration history | tool-owned; table conditional | Deferred to tool selection |
| Writer epochs | `workflow.workflow_writer_epochs` | Conditional control table |
## 12. Column Naming
- Contract: Column Naming is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 13. Type Naming
- Contract: Type Naming is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 14. Constraint Naming
- Contract: Constraint Naming is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 15. Index Naming
- Contract: Index Naming is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 16. Trigger Policy
- Contract: Trigger Policy is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 17. Function Policy
- Contract: Function Policy is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 18. Extension Policy
- Contract: Extension Policy is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 19. Migration Ownership
- Contract: Migration Ownership is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 20. Transaction Ownership
- Contract: Transaction Ownership is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 21. Slice A Definition
- Slice A comprises one immutable terminal Final Result, one protected Result Reference, and one unpublished Outbox event.
- The three records share protected result identity, operation, protected tenant, region, version, and lifecycle invariants.
- `FinalResultStore.commitIfAbsent`, `ResultReferenceVault.issueIfAbsent`, and `OutboxStore.append` are composed by one higher-level transaction owner.
- Individual interface methods remain usable inside the supplied `WorkflowTransactionContext`; they do not auto-commit.
- The first migration slice contains only minimal metadata/control objects and the three primary tables.
## 22. Aggregate Boundary
- The Final Result is the business aggregate root for Slice A.
- Result Reference is a server-side capability index linked to exactly one Final Result.
- Outbox is an immutable delivery intent linked logically and, for Slice A, referentially to the Final Result.
- Aggregate identity is protected and never the public token.
- Lifecycle changes use explicit CAS; payload content never becomes a mutable workflow state machine.
## 23. Final Result Table
- Conceptual columns: internal result ID, protected result algorithm/version/digest, protected tenant digest, region, operation, status, result/record/schema versions, revision, payload, created/committed/updated time, expiry, retention class, deletion state, legal-hold state.
- Use hybrid storage: normalized identity/lifecycle/status columns plus bounded versioned JSONB terminal payload.
- Status is exactly the existing `WorkflowSafeResult`: completed, degraded, partial, failed, or cancelled.
- `formalAssetReferences` maps to an ordered safe assets JSONB branch in Slice A; a child table is deferred.
- Commit-once identity uniqueness and terminal branch CHECK constraints are mandatory.

| Final Result field group | Representation | Constraint owner |
|---|---|---|
| internal identity | UUID-shaped internal PK | generator + PK |
| result identity | algorithm/version/`bytea` digest | UNIQUE + length CHECK |
| scope | protected tenant, region, operation | NOT NULL + CHECK |
| terminal branch | status + versioned JSONB | branch CHECK + app validator |
| lifecycle | expiry, retention, deletion, legal hold | CHECK + CAS |
| concurrency/time | revision, created/updated/committed | CHECK + DB clock |
## 24. Result Reference Table
- Conceptual columns mirror `ResultReferenceRecord`: internal ID, protected token digest tuple, result FK, kind, operation, owner digest, tenant digest, region, state, versions, revision, times, expiry, deletion, and legal hold.
- Kinds are upload-pending, generation-job, and workflow-result because the current Runtime interface owns that union.
- Slice A issues `workflow-result`; other kinds reserve naming but their backing schemas remain out of scope.
- The raw token is never stored, logged, returned by diagnostics, or used as a primary key.
- A unique result linkage prevents duplicate issuance for the same result identity and kind.
## 25. Outbox Table
- Conceptual columns mirror `OutboxRecord`: internal/event ID, aggregate kind and protected digest, Final Result FK, event type, payload version, safe JSONB payload, delivery state, attempt, next eligible time, claim owner digest, fencing revision, lease expiry, delivered time, safe failure class, and record times.
- The existing delivery states pending, claimed, delivered, and reconciliation-required are authoritative; V1 does not add dead-letter.
- Dead-letter is an operational routing/retention decision deferred to an Outbox policy ADR.
- Events are append-immutable; only delivery-control columns mutate through fenced CAS.
- Payload is bounded scalar JSON only and cannot contain raw content or sensitive identifiers.

### Outbox State Machine

| Current | Event | Next | Required guard |
|---|---|---|---|
| pending | claim | claimed | eligible time, owner digest, new fence, lease |
| claimed | renew/reclaim | claimed | matching/new fence and DB time |
| claimed | delivered | delivered | matching fence; delivered time |
| pending/claimed | unsafe ambiguity | reconciliation-required | safe failure class |
| reconciliation-required | approved repair/claim | claimed | operator/worker policy |
| delivered | duplicate completion | delivered | idempotent no-op |
## 26. Schema Metadata
- Include one row-oriented `workflow_schema_metadata` table as the runtime readiness authority.
- It records schema contract major/minor, compatible reader/writer range, migration head identifier/checksum, and update time.
- It contains no production payload, credential, tenant, region, or reference.
- The migration tool remains the source for detailed history; metadata is a compatibility projection.
- Readiness reads it through a privileged safe query and fails closed on mismatch.
## 27. Migration History
- Do not duplicate a full migration ledger until the migration tool is selected.
- The tool must own ordered version, name, immutable checksum, applied time, transactional/online class, and application compatibility.
- If the selected tool lacks trustworthy history, add `workflow_migration_history` in the next migration foundation contract.
- Manual edits to history are forbidden; repair is an audited operator action.
- This is blocking for migration execution, not for schema documentation.
## 28. Writer Epoch
- Use a small `workflow_writer_epochs` control table if provider routing alone cannot fence stale writers.
- Key it by deployment/home-region authority scope, not by every business row.
- It holds home region, monotonic writer epoch, active state, revision, and updated database time.
- Business writes verify the active epoch through transaction/session policy; copying epoch onto every row is rejected for V1.
- Exact control scope and failover owner are blocking TBDs before production connection.
## 29. Primary Keys
- **Selected logical type: internally generated UUID-shaped identifier**, stored in PostgreSQL native UUID when the chosen major/provider supports it as required.
- UUID is preferred over sequence bigint because records may be prepared across processes without central numeric allocation.
- ULID and opaque text are rejected as physical PK defaults because ordering/encoding would couple schema to an ID ADR.
- Binary protected identity and public Reference token are distinct and never primary keys.
- Production entropy/generator/version remains blocking; no default generator is assumed.
## 30. Internal Record IDs
- Contract: Internal Record IDs is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 31. Protected Identities
- Store protected identities as algorithm identifier, algorithm version, and fixed expected-length `bytea` digest.
- `bytea` is selected over hex/base64 text to avoid encoding ambiguity and index bloat; length is enforced after algorithm selection.
- Each identity namespace is explicit, unique constraints include the required scope, and diagnostics expose neither digest nor raw source.
- Algorithm rotation uses parallel digest columns/rows or an explicit versioned migration; it never silently rewrites lookup semantics.
- Collision response is fail closed as corrupted/conflict with manual security repair; never select either row arbitrarily.
## 32. Public References
- Contract: Public References is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 33. Idempotency Identity
- Contract: Idempotency Identity is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 34. Tenant
- Contract: Tenant is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 35. Region
- Contract: Region is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 36. Operation
- Contract: Operation is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 37. Result Status
- Use text columns plus named CHECK constraints for result status.
- PostgreSQL ENUM is rejected in V1 because additive/removal/rolling compatibility is harder to manage.
- Lookup tables are unnecessary for small closed Runtime unions and can add mutable reference data.
- Allowed values exactly match current Runtime types; additions require expand/contract compatibility.
- Status never substitutes for deletion, expiry, revocation, hold, or delivery state.
## 38. Record Version
- Contract: Record Version is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 39. Schema Version
- Contract: Schema Version is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 40. Revision
- Contract: Revision is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 41. Created Time
- Contract: Created Time is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 42. Updated Time
- Contract: Updated Time is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 43. Expiry
- Contract: Expiry is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 44. Retention
- Contract: Retention is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 45. Deletion
- Contract: Deletion is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 46. Legal Hold
- Contract: Legal Hold is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 47. Final Result Payload
- Use one bounded JSONB terminal payload with explicit `resultVersion` and status-discriminated shape.
- Normalized columns carry status, operation, identity, lifecycle, revision, and query predicates.
- Application validation owns exact DTO shape; database CHECK owns presence/absence, JSON object type, maximum envelope policy, and branch consistency.
- Unknown fields are rejected by the versioned application validator before write; readers reject unsupported versions as corrupted.
- Payload is immutable after commit.
## 48. Asset Payload
- Slice A stores formal asset references as an ordered JSONB array because the Runtime type is an ordered array of protected identities.
- Each entry is a safe formal Asset ID/reference projection only; kind, role, MIME may be added in a later version after the Asset contract is mapped.
- Duplicate entries are rejected by application validation and contract tests; a DB helper/trigger is not introduced.
- Storage locator, signed URL, provider output reference, content, and credentials are prohibited.
- Revisit a child asset table when asset-level querying, FK integrity, retention, or cardinality measurements require it.
## 49. Safe Error Payload
- Only failed results may carry a safe error projection; success-like and cancelled branches do not store raw error details.
- Allowed fields are allowlisted code, retryable flag, retry class, and safe message key.
- Stack, raw message, provider error, DB error, request body, Reference, credential, and payload fragments are prohibited.
- Application validation enforces exact keys and maximum lengths; DB CHECK enforces failed/non-failed branch presence.
- Safe reason codes from `WorkflowSafeResult` remain bounded and versioned.
## 50. Result Reference Metadata
- Contract: Result Reference Metadata is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 51. Result Reference Kind
- Contract: Result Reference Kind is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 52. Reference Revocation
- Contract: Reference Revocation is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 53. Outbox Event Type
- Contract: Outbox Event Type is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 54. Outbox Payload
- Contract: Outbox Payload is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 55. Outbox Delivery State
- Use text plus CHECK with exactly pending, claimed, delivered, and reconciliation-required.
- Claimed requires claim owner digest, fencing revision, and lease expiry; other states constrain those fields explicitly.
- Delivered requires delivered time and forbids an active lease.
- Reconciliation-required retains safe failure class and remains eligible only through explicit repair policy.
- V1 does not formalize failed or dead-letter as persistent states.
## 56. Outbox Attempt
- Contract: Outbox Attempt is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 57. Outbox Eligibility
- Contract: Outbox Eligibility is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 58. Outbox Claim
- Contract: Outbox Claim is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 59. Outbox Fencing
- Contract: Outbox Fencing is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 60. Outbox Delivery Completion
- Contract: Outbox Delivery Completion is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 61. Primary Key Constraints
- Contract: Primary Key Constraints is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.

| Table | Primary key rule | Business identity rule |
|---|---|---|
| final results | internal UUID PK | protected result digest UNIQUE in scope |
| result references | internal UUID PK | protected token digest UNIQUE; result/kind UNIQUE |
| outbox | internal UUID PK | protected event identity UNIQUE |
| schema metadata | bounded singleton/version key | one active compatibility row |
| writer epochs | authority-scope key | monotonic epoch/revision |
## 62. Unique Constraints
- Contract: Unique Constraints is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 63. Foreign Keys
- Contract: Foreign Keys is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.

| Relationship | Decision | Deletion consequence |
|---|---|---|
| Reference → Final Result | mandatory FK, RESTRICT physical delete | logical lifecycle first |
| Outbox → Final Result | Slice A FK, RESTRICT until archival contract | preserves atomic aggregate evidence |
| Outbox aggregate outside Slice A | deferred | future nullable/type-safe linkage design |
| Final Result → Asset service | no DB FK in Slice A | safe formal references only |
## 64. Check Constraints
- Contract: Check Constraints is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 65. Not-null Policy
- Contract: Not-null Policy is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 66. JSONB Policy
- JSONB is limited to versioned terminal payload, ordered formal-asset projection, and safe scalar Outbox payload.
- Every JSONB column has a schema version, application validator owner, configured maximum size TBD, unknown-field policy, and corruption mapping.
- Canonical serialization is required for hashing/comparison where used, but JSON key order is never a business invariant.
- Only targeted expression/index paths approved by measured queries may be indexed.
- The database enforces coarse type/branch checks; it does not duplicate the full TypeScript validator.
## 67. Enum Policy
- Use text plus named CHECK for operation, result status, Reference kind/state, Outbox state, deletion state, and legal-hold state.
- Do not create PostgreSQL ENUM types in V1.
- Use lookup tables only when values are operator-managed data rather than closed code unions.
- Rolling addition is expand: relax reader, add allowed value, deploy writer, then require new semantics.
- Unknown values map to corrupted/unsupported and never default to a known branch.
## 68. Domain Type Policy
- Contract: Domain Type Policy is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 69. Binary Digest Policy
- Protected digests use `bytea` with algorithm/version companion columns and a fixed-length CHECK determined by the Security/ID ADR.
- Raw public Reference, idempotency keys, fingerprints, tenant inputs, and owner inputs are never persisted.
- Unique B-tree indexes use the binary digest with explicit namespace/scope columns.
- Digest bytes are sensitive operational data: no logs, metrics labels, errors, or broad read roles.
- Rotation and collisions are explicit lifecycle events.
## 70. Timestamp Policy
- Use `timestamptz` for all durable instants; sessions operate with UTC display policy.
- `created_at` and transaction-consistent `committed_at` use database transaction time.
- Lease expiry and next eligibility are calculated from actual writer database time under short transactions, not client time.
- Application-supplied timestamps are accepted only as validated external evidence fields, never as durable authority.
- `updated_at` changes only in explicit CAS statements; no timestamp trigger.
## 71. Default Value Policy
- Contract: Default Value Policy is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 72. Generated Column Policy
- Contract: Generated Column Policy is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 73. Trigger Policy Decision
- **Decision: no business triggers in V1.**
- Triggers are rejected for terminal immutability, outbox insertion, revision increment, updated time, and payload validation.
- The transaction adapter issues all three writes explicitly so tests observe the same boundary.
- Only a future audited infrastructure trigger with no hidden business branch may be proposed by separate contract.
- Readiness verifies absence of unapproved triggers/functions on the three tables.
## 74. Index Strategy
- Indexes exist only for uniqueness, protected lookups, FK support, lifecycle cleanup, and Outbox claim polling.
- Every index has a named query owner, expected predicate/order, selectivity measurement, and migration path.
- Avoid redundant prefix indexes and speculative JSONB GIN indexes.
- Covering columns are added only from measured heap-fetch cost and privacy review.
- Index availability is part of schema readiness.

| Query | Required index shape | Notes |
|---|---|---|
| Final read/replay | scoped protected result digest UNIQUE | no raw identity |
| Reference resolve | scoped protected token digest UNIQUE | includes lifecycle filter inputs |
| same-result issuance | result FK + kind UNIQUE | same identity → same Reference |
| Outbox duplicate | protected event identity UNIQUE | immutable payload comparison |
| Outbox poll | partial state + next eligible + stable ID | supports `SKIP LOCKED` |
| lifecycle cleanup | deletion/expiry/hold composite or partial | exact shape after measured query |
## 75. Unique Indexes
- Contract: Unique Indexes is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 76. Partial Indexes
- Contract: Partial Indexes is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 77. Composite Indexes
- Contract: Composite Indexes is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 78. Covering Indexes
- Contract: Covering Indexes is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 79. Claim Query Index
- The claim query index targets non-delivered eligible Outbox rows ordered by next eligibility and stable event ID.
- Its partial predicate covers pending and reclaimable claimed/reconciliation policy states only after exact query semantics are fixed.
- Lease expiry comparison remains a query condition; volatile database time is not embedded in an index predicate.
- Batch size is bounded and TBD from contention/backlog tests.
- `SKIP LOCKED` distributes candidates; durable fence correctness does not depend on the index.
## 80. Result Lookup Index
- Contract: Result Lookup Index is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 81. Reference Lookup Index
- Contract: Reference Lookup Index is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 82. Outbox Poll Index
- Contract: Outbox Poll Index is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 83. Tenant / Region Index
- Contract: Tenant / Region Index is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 84. Expiry Index
- Contract: Expiry Index is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 85. Deletion Index
- Contract: Deletion Index is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 86. Legal Hold Index
- Contract: Legal Hold Index is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 87. Final Result Commit Transaction
- `commitIfAbsent` inserts one terminal Final Result under protected result identity uniqueness.
- Existing same identity and equivalent immutable content maps to `found`; different content maps to conflict/corrupted per proof.
- No later payload update is allowed through `compareAndSet`; only approved lifecycle metadata may change under CAS.
- Commit time comes from database transaction time.
- The method never publishes a Reference by itself.
## 88. Result Reference Issuance Transaction
- `issueIfAbsent` inserts a protected Reference linked to an existing Final Result.
- For workflow-result Slice A, issuance occurs only inside the atomic Slice A transaction.
- Same result identity and same intended protected token returns found; mismatched identity/scope is conflict.
- Resolve is a read that checks tenant, owner, region, operation, state, deletion, expiry, and hold policy outside mere token possession.
- Revoke, expire, and delete are revision-checked lifecycle mutations.
## 89. Outbox Append Transaction
- `append` inserts an immutable event identity and safe payload inside the supplied transaction.
- Duplicate identical event identity maps to duplicate; different payload under the same event identity is corruption/conflict.
- Append never performs queue delivery or external I/O.
- Delivery claim and completion occur in later short transactions.
- Business state without its required Outbox insert must roll back.
## 90. Atomic Slice A Transaction
- One transaction begins on one writable PostgreSQL connection.
- It inserts Final Result, Result Reference, and Outbox using deterministic protected identities and versions.
- It commits once; any unique/FK/CHECK/write failure rolls back all three.
- Outcomes are committed-new, replayed-existing, conflict, definite-failure, unknown-outcome, or unavailable.
- No branch exposes a terminal DTO until all three records are verified consistent.

### Atomic Outcome Matrix

| Observed state | Safe outcome | Action |
|---|---|---|
| all three newly committed | committed-new | publish only through Reference |
| all three already consistent | replayed-existing | return same safe result/Reference |
| none after definite rollback | definite-failure/not-committed | bounded safe retry if authorized |
| identity/payload mismatch | conflict | no overwrite or new Reference |
| acknowledgement lost | unknown-outcome | protected lookup |
| partial or inconsistent | corrupted | stop publication; manual repair |
| writer unavailable | unavailable | preserve unknown/try later policy |
## 91. Duplicate Commit
- A duplicate request first attempts constraint-backed creation within the same atomic operation.
- All three existing and mutually consistent records map to replayed-existing/found.
- No rows map to a safe fresh retry only after a definite rollback; partial rows map to corrupted and manual repair.
- A conflicting digest, scope, payload, or event identity maps to conflict/corrupted, never overwrite.
- Duplicate handling does not rotate or issue a second Reference.
## 92. CAS
- Mutable lifecycle and delivery controls use expected revision conditional update and increment exactly once.
- The predicate includes internal ID/protected identity, expected revision, allowed prior state, and where needed writer epoch/fence.
- Zero affected rows triggers a reread and safe mapping to not-found, terminal, expired, deleted, stale-fence, conflict, or unavailable.
- Revision is non-negative signed 64-bit logical space with CHECK; reaching the safety ceiling blocks mutation and raises an operational incident.
- Read-then-write without the atomic predicate is forbidden.
## 93. Revision Conflict
- Contract: Revision Conflict is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 94. Commit Unknown
- Unknown commit acknowledgement is never reported as rollback or retried blindly.
- Lookup uses protected result identity, protected Reference identity, and Outbox event identity.
- All present and consistent maps committed; none present after authoritative writer visibility maps not-committed.
- Partial, mismatched, or impossible state maps corrupted and requires manual repair; unavailable remains unknown/unavailable.
- Lookup results expose no digest, raw token, row, SQLSTATE, or payload.
## 95. Transaction Retry
- Retry only an entire idempotent transaction after classified serialization/deadlock failures and bounded backoff.
- Do not automatically retry unique/FK/CHECK violations, insufficient privilege, schema mismatch, or corrupted state.
- Connection failure before/after commit enters definite-versus-unknown reconciliation, not generic retry.
- Retry budget and jitter owner remain adapter policy TBD.
- Provider I/O is outside the transaction and never replayed by a DB retry.
## 96. Read Visibility
- Contract: Read Visibility is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 97. Terminal Immutability
- Contract: Terminal Immutability is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 98. Reference Immutability
- Contract: Reference Immutability is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 99. Outbox Immutability
- Contract: Outbox Immutability is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 100. Deletion Semantics
- Contract: Deletion Semantics is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 101. Expiry Semantics
- Contract: Expiry Semantics is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 102. Legal Hold Semantics
- Contract: Legal Hold Semantics is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 103. Data Corruption
- Corruption includes invalid JSON shape/version, impossible status branch, partial Slice A group, digest collision, invalid revision, and cross-scope linkage.
- Reads fail closed as `corrupted`; no best-effort DTO projection or Reference fallback is permitted.
- Automated repair may only use an approved deterministic evidence source and separate repair contract.
- Diagnostics expose table/constraint/failure class only, not values.
- Corruption blocks affected publication and can fail readiness when systemic.
## 104. Constraint Violation Mapping
- Contract: Constraint Violation Mapping is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 105. SQLSTATE Mapping
- Classify at minimum: `23505` unique violation, `23503` foreign-key violation, and `23514` check violation.
- Classify `40001` serialization failure and `40P01` deadlock detected as bounded whole-transaction retry candidates.
- Class `08` connection exceptions can imply unavailable or unknown outcome depending transaction phase.
- Classify `57014` query canceled, `25006` read-only transaction, `42501` insufficient privilege, `42P01` undefined table, and `42703` undefined column.
- Raw SQLSTATE, constraint value, SQL text, and driver error never cross the adapter boundary.

### SQLSTATE Classification Matrix

| SQLSTATE/class | Internal class | Retry | Readiness effect |
|---|---|---|---|
| `23505` | unique-conflict/duplicate | no automatic retry | no, unless unexpected constraint |
| `23503` | referential-corruption/input-order defect | no | incident if runtime path |
| `23514` | invalid-record/corruption | no | incident if persisted reader mismatch |
| `40001` | serialization-conflict | bounded whole transaction | no |
| `40P01` | deadlock | bounded whole transaction | no; metric |
| class `08` | connection/unknown/unavailable | reconcile by phase | dependency degraded |
| `57014` | canceled/timeout | policy-specific, never blind commit retry | maybe |
| `25006` | read-only writer | no | false |
| `42501` | privilege mismatch | no | false |
| `42P01` / `42703` | schema mismatch | no | false |
## 106. Safe Store Result Mapping
- Map known equivalent duplicates to created/found/duplicate according to the exact Runtime interface.
- Map stale CAS/terminal guards to conflict or terminal after safe reread.
- Map expiry, deletion, corruption, and unavailable to the existing Store Result unions.
- Schema/privilege/read-only failures are unavailable plus readiness failure, never not-found.
- Unknown commit uses the dedicated reconciliation result rather than inventing a public Runtime status.
## 107. Security
- Never persist raw Reference token, idempotency key, fingerprint, Story, Lyrics, Scene, Prompt, credential, provider secret, signed URL, locator, provider output reference, or raw error.
- Formal Asset ID and safe result content are allowed only in their contracted branches.
- Digest columns and internal IDs are restricted operational data even though transformed.
- Tenant, region, owner, and operation checks are conjunctive; Reference possession alone is not authorization.
- Security failures fail closed and use bounded diagnostics.
## 108. Sensitive Data
- Contract: Sensitive Data is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 109. Encryption
- Contract: Encryption is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 110. Protected Identity Hashing
- Contract: Protected Identity Hashing is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 111. Row-level Security
- **RLS is deferred, not selected for V1 foundation.**
- Authorization remains application policy plus schema/role isolation and mandatory scoped predicates.
- RLS may add defense in depth, but pooling identity, migration bypass, operator access, policy testing, and failover behavior are unresolved.
- Reference possession alone remains insufficient whether or not RLS is later enabled.
- RLS adoption requires a separate Security ADR and cannot replace negative cross-tenant tests.
## 112. Database Roles
- Logical roles: migration owner, runtime read-write, runtime read-only, Outbox worker, operator repair, audit/read, and provider-managed backup.
- Credentials are not created in this contract.
- Roles receive only schema/table/sequence/function privileges required by their consumer.
- Runtime cannot DDL; migration cannot run application traffic; read-only cannot claim or mutate.
- Operator repair is break-glass, time-bounded, audited, and denied routine application use.

| Role | Minimum access | Explicit denial |
|---|---|---|
| migration | DDL and metadata under controlled runner | application traffic |
| runtime read-write | Slice A read/write and transaction | DDL, broad repair |
| runtime read-only | scoped SELECT | mutation/claim |
| Outbox worker | poll/claim/deliver Outbox; bounded aggregate read | Final payload mutation |
| operator repair | approved break-glass procedures | routine app login |
| audit/read | safe metadata views only | protected digest/payload by default |
| backup | provider-managed backup capability | interactive runtime use |
## 113. Privilege Model
- Contract: Privilege Model is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 114. Connection Separation
- Contract: Connection Separation is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 115. Migration Role
- Contract: Migration Role is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 116. Runtime Role
- Contract: Runtime Role is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 117. Read-only Role
- Contract: Read-only Role is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 118. Operator Role
- Contract: Operator Role is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 119. Audit Role
- Contract: Audit Role is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 120. Backup / Restore
- Backups include schema metadata, Final Result, Result Reference, Outbox, required writer control, and migration history source.
- Encryption, retention, RPO, RTO, geographic placement, and backup deletion policy are blocking production TBDs.
- Backup success metrics are insufficient without periodic isolated restore.
- Logical deletion and legal hold state must remain consistent through backup lifecycle policy.
- Raw tokens are absent, so restore cannot recreate them; protected lookup identity must remain stable.
## 121. PITR
- Contract: PITR is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 122. Restore Validation
- Restore validates row counts and constraints without exposing sensitive values.
- For every sampled/complete Slice A group, Final Result, Result Reference, and Outbox linkage and versions are consistent.
- Protected digests, revisions, deletion/hold states, and Outbox delivered state remain unchanged.
- Active claims are invalidated by lease policy and writer epoch promotion before workers resume.
- Readiness remains false until migration head, roles, writer mode, region, constraints, and indexes validate.
## 123. Multi-region
- Contract: Multi-region is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 124. Home-region Writer
- All writes and authoritative reads for mutation decisions route to one home-region writer.
- Records carry normalized region; trusted policy supplies it and clients cannot override it.
- The schema control plane records active home region/writer epoch rather than copying epoch into every immutable row.
- Cross-region reads are explicitly stale-tolerant and cannot resolve security-sensitive Reference publication without policy approval.
- Active-active writes are outside V1.
## 125. Writer Epoch
- Writer epoch is a monotonic fencing token for control-plane promotion, distinct from per-row revision and Outbox claim fence.
- Store it in the minimal writer control table keyed by authority scope.
- A promoted writer increments epoch transactionally before accepting writes; stale processes fail their epoch check.
- Exact authority scope and integration mechanism are blocking TBDs.
- Restore always establishes a new epoch before runtime readiness.
## 126. Failover
- Contract: Failover is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 127. Split-brain Protection
- Contract: Split-brain Protection is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 128. Replication
- Contract: Replication is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 129. Read Replica
- Contract: Read Replica is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 130. Migration Strategy
- Use SQL-first ordered checksummed migrations under a dedicated tool selected next.
- Proposed future directory is `db/workflow/migrations/`; it is not created now.
- Each migration declares version, name, checksum, created time, app compatibility, transactional flag, and online/offline class.
- Migration runner uses a direct/session connection and an exclusive schema migration lock.
- Forward-fix is default; destructive rollback requires restored evidence and explicit approval.

| Migration metadata | Required meaning |
|---|---|
| version | total ordered identifier |
| name | stable human-safe purpose |
| checksum | immutable content verification |
| created at | source artifact time, not apply authority |
| app compatibility | min/max reader/writer contract |
| transactional | may run in a transaction |
| online/offline | traffic and readiness behavior |
## 131. Expand / Contract
- Canonical flow: add nullable/unused structure, deploy compatible readers/writers, backfill, validate, require, remove old writer/reader, then drop.
- Status/CHECK additions relax compatible readers before writers emit new values.
- JSONB versions use parallel reader support before new writer version.
- Indexes are created/validated before readiness requires them.
- Destructive steps wait beyond the supported rolling window.
## 132. Forward Compatibility
- Contract: Forward Compatibility is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 133. Backward Compatibility
- Contract: Backward Compatibility is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 134. Rolling Deployment
- Contract: Rolling Deployment is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 135. Backfill
- Contract: Backfill is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 136. Online Index Creation
- Concurrent index creation runs outside a transaction block and is explicitly marked non-transactional.
- Runner records intent/checksum, detects invalid remnants, and has an approved cleanup/retry procedure.
- Readiness does not require the new index until creation and validation succeed.
- Only one concurrent build per affected table is scheduled and resource impact is observed.
- Unique constraints requiring correctness are established safely before writers depend on them.
## 137. Constraint Validation
- Contract: Constraint Validation is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 138. Migration Lock
- Contract: Migration Lock is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 139. Migration Checksum
- Contract: Migration Checksum is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 140. Readiness Integration
- Readiness checks expected schema version, compatible reader/writer range, migration checksum/head, required tables, columns, indexes, constraints, and approved trigger/function set.
- It verifies role privileges, writable primary mode, home region/writer epoch, and Outbox writability.
- Mismatch sets readiness false and stops new writes and new claims.
- Checks are bounded metadata queries and do not return row values or protected identities.
- Read-only health is insufficient for write readiness.
## 141. Schema Drift
- Contract: Schema Drift is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 142. Local Test Schema
- Local tests run the selected supported PostgreSQL major in a real container.
- Apply the same ordered migrations from empty and from the previous supported schema.
- No embedded substitute or in-memory adapter qualifies the concrete PostgreSQL schema.
- Test database uses isolated credentials, deterministic safe fixtures, and teardown.
- Docker configuration is a future foundation and is not changed here.
## 143. CI Schema
- Contract: CI Schema is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 144. Contract Test Mapping
- Map contract tests to database invariants rather than duplicating implementation details.
- Atomicity covers three-row visibility/rollback; duplicate covers unique identities and replay.
- CAS and terminal overwrite cover revision/state predicates; Reference issuance covers FK/scope/uniqueness.
- Outbox rollback/claim/lease cover transaction, polling index, fencing, and delivery CAS.
- Commit unknown, corruption, deletion, legal hold, mutation isolation, and multi-instance tests are mandatory.

### Contract Test to Schema Matrix

| Contract concern | Schema invariant | Concrete proof |
|---|---|---|
| atomicity | three tables one transaction | injected write rollback exposes none |
| duplicate | three UNIQUE identities | same returns existing; mismatch conflicts |
| CAS | revision/state predicate | stale/future writers lose |
| terminal overwrite | immutable payload/status | mutation rejected |
| Reference issuance | FK + result/kind/token uniqueness | same result same Reference |
| Outbox rollback | required insert in transaction | append failure rolls back business rows |
| commit unknown | three protected lookup keys | all/none/partial classification |
| claim/lease | state/fence/DB time | multi-worker and stale-fence races |
| corruption | versions/CHECK/linkage | fail closed, no fallback |
| deletion/legal hold | lifecycle CHECK/CAS | hold blocks deletion; deleted not active |
| mutation isolation | immutable copies/decoded DTO | caller mutation cannot alter row |
| multi-instance | DB constraints/locks | shared container races converge |
## 145. Failure Injection
- Inject unique, CHECK, FK, deadlock, serialization, privilege, read-only, migration mismatch, and JSON corruption failures.
- Terminate connections before commit and after commit request to exercise definite versus unknown outcomes.
- Race multiple Outbox workers through claim, lease expiry, stale fence, and delivery completion.
- Provider staging tests cover failover and pool exhaustion; local proxy/fault harness covers transport cuts.
- No production table receives scenario/test-only columns.
## 146. Performance
- Contract: Performance is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 147. Capacity
- Contract: Capacity is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 148. Vacuum / Analyze
- Contract: Vacuum / Analyze is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 149. Partitioning
- **No table partitioning in Slice A V1.**
- Early partitioning by tenant or region complicates unique identity and FK constraints; by status creates churn; by time complicates immutable aggregate linkage.
- Use ordinary tables with measured indexes and retention jobs first.
- Revisit when measured row volume, index size, vacuum pressure, retention deletion cost, or provider limits breach approved thresholds.
- Partition key migration requires a separate architecture and online migration contract.
## 150. Archival
- Contract: Archival is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 151. Observability
- Contract: Observability is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 152. Metrics
- Contract: Metrics is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 153. Query Logging
- Contract: Query Logging is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 154. Auditability
- Contract: Auditability is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 155. Adapter Interface Mapping
- The mapping below uses actual production interface method names from `storeTypes.ts`.
- Schema never changes those methods or their Result unions.
- A higher-level atomic Slice A composer owns the shared transaction context.
- Read methods use scoped protected lookup and lifecycle validation.
- Failures are converted by the PostgreSQL Failure Mapper.

### Runtime Adapter Mapping

| Runtime interface method | PostgreSQL table | Transaction requirement | Lock / constraint | Result mapping | Failure class |
|---|---|---|---|---|---|
| `FinalResultStore.commitIfAbsent` | final results | supplied transaction; atomic composer for Slice A | result digest UNIQUE | created/found/conflict | constraint/unavailable/unknown |
| `FinalResultStore.read` | final results | read-only | protected lookup + lifecycle | found/not-found/expired/deleted/corrupted | connection/schema |
| `FinalResultStore.compareAndSet` | final results lifecycle only | short write transaction | expected revision + allowed state | updated/conflict/terminal | CAS/unavailable |
| `ResultReferenceVault.issueIfAbsent` | result references | same Slice A transaction | token UNIQUE; result/kind UNIQUE; FK | created/found/conflict | constraint/corruption |
| `ResultReferenceVault.resolve` | result references + final results | scoped read | digest + owner/tenant/region/operation/lifecycle | found or safe failure | unavailable/corrupted |
| `OutboxStore.append` | outbox | same business transaction | event identity UNIQUE | appended/duplicate/unavailable | constraint/unknown |
| `OutboxStore.claimBatch` | outbox | short worker transaction | poll index + row lock + fence | claimed/empty/conflict/unavailable | deadlock/serialization |
| `OutboxStore.markDelivered` | outbox | short worker transaction | event + matching lease fence | delivered/duplicate/stale-fence/unavailable | CAS/connection |
| atomic Slice A commit | all three | one connection/transaction | all constraints | committed/replayed/conflict/unknown | mapped aggregate failure |
| commit-unknown lookup | all three | authoritative writer read | three protected identities | committed/not-committed/corrupted/unavailable | connection/corruption |
## 156. Transaction Adapter Mapping
- Contract: Transaction Adapter Mapping is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 157. Clock Adapter Mapping
- Contract: Clock Adapter Mapping is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 158. Failure Mapper
- Contract: Failure Mapper is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.
## 159. Slice A Implementation Plan
- First, select PostgreSQL major, driver, migration tool, PK generator, and digest algorithm without adding dependencies in this document.
- Second, create the PostgreSQL test-environment foundation and migration-file contract.
- Third, implement only schema metadata/control and Slice A three-table migration.
- Fourth, implement transaction/clock/failure mapping and the atomic Slice A composer.
- Fifth, run durable contract, failure, restore, readiness, and multi-instance suites before Slice B.
## 160. Acceptance Gates
- Accepted: dedicated `workflow` schema, three primary tables, UUID internal-key direction, versioned `bytea` protected identities, text+CHECK statuses, hybrid JSONB, explicit indexes, and atomic Slice A transaction.
- Accepted: commit-unknown lookup, SQLSTATE classification, logical deletion, legal-hold blocking, SQL-first migrations, and fail-closed readiness.
- Accepted: no business triggers, no PostgreSQL ENUM, no early partitioning, and RLS deferred.
- Required before implementation: major, driver, migration tool, generator, digest details, exact payload schemas/limits, exact constraints/indexes, and writer epoch scope.
- Required before production: provider, region, pooling, roles, KMS, RPO/RTO, restore drills, capacity, and operations ownership.
## 161. Stop Conditions
- Do not start adapter or migration implementation while PostgreSQL major, SQL driver, migration tool, PK generator, or protected digest details are undecided.
- Stop if Final/Reference/Outbox columns, status branch constraints, JSONB versions/limits, indexes, transaction branches, commit lookup, SQLSTATE mapping, readiness checks, or home-region writer semantics are unclear.
- Stop if raw token/plaintext Restricted Input must be stored, or if schema convenience requires changing the Runtime Interface.
- Stop if only in-memory tests are available or provider semantics cannot pass real PostgreSQL tests.
- Stop if starting requires a package/SDK change before the selection and migration contracts approve it.
## 162. Open Questions
- **Blocking:** PostgreSQL major, SQL driver, migration tool, PK generator, digest algorithm/length/rotation, exact JSONB schemas/maximums, asset child-table decision for V1, and writer epoch authority scope.
- **Production-blocking:** managed provider, pooling, connection limits, KMS, RLS decision, backup RPO/RTO, restore cadence, regions, roles/credentials, audit retention, operator repair, support, and cost.
- **Deferred:** retention class durations, Outbox dead-letter owner, archival policy, partition thresholds, covering indexes, audit role implementation, and query builder.
- **Measurement TBD:** row/asset/JSONB sizes, Reference QPS, backlog, batch size, retention volume, index growth, vacuum load, and performance targets.
- Every TBD has an owner in the next selection, migration, security, data-lifecycle, or operations artifact.
## 163. Final Schema Decision Matrix
- Contract: Final Schema Decision Matrix is represented explicitly in the `workflow` schema or is an identified external policy owner.
- Rule: application validation and PostgreSQL constraints divide responsibility without duplicating full DTO validation.
- Failure: ambiguity, unsupported version, impossible lifecycle, or missing required structure fails closed.
- Gate: the concrete migration and adapter tests must prove this rule before production readiness.

### Final Schema Decision Matrix

| Decision | Selected option | Reason | Rejected option | Schema consequence | Adapter consequence | Blocking TBD | Revisit trigger |
|---|---|---|---|---|---|---|---|
| schema namespace | dedicated `workflow` | privilege/drift boundary | `public`, separate DB | qualify three tables | explicit schema | none | multi-database requirement |
| table layout | three normalized tables + minimal metadata | atomic clarity | single JSON document | FK/UNIQUE boundaries | three explicit writes | exact columns | new aggregate |
| primary key | native UUID-shaped internal ID | opaque/distributed creation | sequence, ULID/text PK | UUID PK | generator injection | generator/version | measured locality issue |
| protected identity | algorithm/version + `bytea` | no encoding ambiguity | raw/text token | binary UNIQUE | digest mapper | algorithm/length/rotation | security ADR |
| result payload | hybrid normalized + bounded JSONB | branch evolution | fully JSON/fully normalized | versioned branch CHECK | validator | exact shape/max | query pressure |
| asset storage | ordered JSONB references | Runtime array, Slice A scope | child table now | payload branch | preserve order | confirm V1 shape | asset query/FK need |
| safe error | failed-only safe JSON branch | prevents leakage | raw error/table | branch CHECK | sanitize before write | code registry | analytics need |
| reference linkage | mandatory FK + result/kind UNIQUE | same result same Reference | loose link | RESTRICT delete | scoped resolve | exact FK names | archival split |
| outbox state | existing four-state text CHECK | Runtime alignment | new dead-letter | fenced mutable controls | exact Result mapping | dead-letter owner deferred | operational policy |
| status representation | text + CHECK | rolling friendly | PostgreSQL ENUM | named constraints | unknown→corrupted | exact rollout | high churn |
| JSONB | bounded/versioned only | avoid over-normalization | catch-all JSONB | 3 approved uses | app exact validation | maximum sizes | query/size evidence |
| timestamps | `timestamptz`, DB authoritative | durable UTC | client time | explicit columns | clock adapter | lease expression detail | provider limitation |
| CAS | revision + state predicate | race-safe | read/write | BIGINT CHECK | zero-row mapping | overflow threshold | interface change |
| indexes | query-owned B-tree/partial | minimal correctness/perf | speculative GIN | readiness catalog | prepared lookup/claim | exact names/shapes | measured workload |
| deletion | logical state then policy purge | hold/restore safety | immediate cascade | lifecycle columns | safe deleted result | retention policy | approved purge |
| legal hold | explicit state blocks purge | independent lifecycle | implied retention | CHECK/CAS | authorization check | policy owner | legal policy |
| RLS | deferred | pooling/policy unresolved | assumed万能 control | role isolation now | scoped predicates | Security ADR | tenancy threat change |
| roles | separated least privilege | blast-radius reduction | one owner role | grants/readiness | consumer pools | credential platform | topology change |
| migration | SQL-first ordered/checksummed | audit/portability | ORM truth | metadata projection | runner interface | tool | proven alternative |
| partitioning | none V1 | insufficient evidence | early tenant/time partitions | ordinary tables | simpler SQL | thresholds deferred | scale/vacuum breach |
| writer epoch | control table, not every row | promotion fence | copied row epoch | minimal authority row | transaction/session check | scope/mechanism | failover design |
| first migration slice | metadata/control + three tables | smallest atomic proof | all stores | narrow DDL | Slice A only | selection ADRs | contract priority |
## 164. Readiness
- Schema Contract is complete as a design decision once this document passes structural checks.
- PostgreSQL Adapter implementation is **not yet allowed** because major, driver, migration tool, generator, digest details, and exact first migration contract are blocking.
- The next artifact is **PostgreSQL Version / Driver / Migration Tool Selection ADR**, followed by PostgreSQL Test Environment Foundation.
- After those gates, implement Slice A Migration Foundation, Transaction Adapter, and Final/Reference/Outbox Adapter in that order.
- Production connection and launch remain prohibited.

## Appendix A. Forbidden Persistence Inventory

- Raw Result Reference token, raw idempotency key, raw fingerprint, raw tenant/owner source, or unversioned digest.
- Story, Lyrics, Scene, Prompt, request body, credential, provider secret, signed URL, storage locator, or Provider Output Reference.
- Raw error, stack, driver error, SQL text, constraint value, database row dump, or query parameters.
- Formal Asset content; only contracted safe Asset references in the successful result branch.
- Test scenario switches or fault-injection fields in production tables.

## Appendix B. Next Foundation Sequence

1. PostgreSQL Version / Driver / Migration Tool Selection ADR.
2. PostgreSQL Test Environment Foundation.
3. Slice A Migration Foundation.
4. PostgreSQL Transaction and Clock Adapters.
5. PostgreSQL Final Result / Result Reference / Outbox Adapter.
6. Durable Contract Suite and failure/restore/readiness validation.
