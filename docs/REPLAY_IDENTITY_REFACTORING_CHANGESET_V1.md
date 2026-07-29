# Replay Identity Refactoring Change Set Specification V1

## 1. Status and purpose

- Status: Planned change-set decomposition.
- Authority: Replay Identity Contract Amendment Specification V1 and Replay
  Identity Architecture Refactoring Plan V1.
- Purpose: divide the identity refactoring into independently reviewable,
  dependency-ordered units.
- This document defines scope, impact, gates, and rollback points. It does not
  define Contract shapes, runtime behavior, persistence structures, statement
  text, or implementation instructions.

## 2. Change-set dependency graph

The directed dependency graph is:

CS-01 Shared Types
→ CS-02 Replay Contracts
→ CS-03 Admission Runtime
→ CS-04 Logical Schema
→ CS-05 Physical Schema
→ CS-06 SQL Definitions
→ CS-08 Adapter
→ CS-09 Integration

CS-07 Statement Executor Conformance depends on CS-02 and CS-06 and blocks
CS-09. It is otherwise independent of CS-08 because the executor owns generic
execution boundaries rather than identity semantics.

The graph is acyclic. No persistence change set is an input to a Contract or
producer change set.

## 3. CS-01: Shared Types

### Purpose

Establish the shared identity authority required by the approved Contract
amendment while preserving the separation between replay addressing,
fingerprint classification, concurrency evidence, and Result Reference.

### Files Expected To Change

- `lib/server/multiCutReplayShared/types.ts`
- identity-focused Shared Types boundary tests

Only identity-authority files are in scope.

### Public API Impact

Public shared identity contracts are affected. Reservation Evidence and Result
Reference APIs remain outside this change set unless compatibility diagnostics
prove a direct identity dependency.

### Backward Compatibility

Compatibility is assessed against existing v3 producers and consumers.
Structural compatibility alone is insufficient; cross-scope identity
ambiguity must be eliminated.

### Preconditions

- Contract owner approves the required identity guarantee.
- Amendment versioning policy is decided.
- Protected-value non-disclosure constraints are confirmed.

### Postconditions

- One shared authority exists for the approved identity guarantee.
- Shared terminology is unambiguous.
- No persistence or runtime responsibility enters Shared Types.

### Validation

- type-only boundary;
- readonly and versioning review;
- protected-value audit;
- reverse-dependency diagnostics;
- Shared Types compatibility tests.

### Rollback Point

Rollback to the pre-amendment Shared Types commit before CS-02 begins.

### Dependencies

- Depends On: approved amendment decision.
- Blocks: CS-02.
- Independent: persistence and execution infrastructure.

## 4. CS-02: Replay Contracts

### Purpose

Make Resolution, Lifecycle, and Recovery expose one continuous replay identity
guarantee without changing their state, outcome, transition, or recovery
responsibilities.

### Files Expected To Change

- `lib/server/multiCutRequestAdmission/types.ts`
- `lib/server/multiCutReplayLifecycle/types.ts`
- Replay Contract boundary and compatibility tests
- identity amendment documentation where terminology must be synchronized

### Public API Impact

Resolution, Lifecycle, and Recovery identity-bearing inputs and results are
affected. Capability operation names, state unions, failure classifications,
and Reservation Evidence semantics are not owned by this change set.

### Backward Compatibility

Compatibility must be explicitly classified for every identity-bearing v3
boundary. Incomplete identity must not be accepted as complete through silent
fallback.

### Preconditions

- CS-01 accepted.
- Public versioning policy approved.
- Consumer inventory complete.

### Postconditions

- Resolution success preserves the approved identity guarantee.
- Lifecycle and Recovery receive the same authoritative replay identity.
- Authoritative results preserve identity continuity.
- Capability responsibilities remain unchanged.

### Validation

- Resolution input/output continuity;
- Resolution-to-Lifecycle continuity;
- Resolution-to-Recovery continuity;
- discriminated-union exhaustiveness;
- capability ownership audit;
- scoped TypeScript diagnostics.

### Rollback Point

Rollback CS-02 and CS-01 together before any runtime producer is enabled.

### Dependencies

- Depends On: CS-01.
- Blocks: CS-03, CS-04, CS-07.
- Independent: physical storage selection.

## 5. CS-03: Admission Runtime

### Purpose

Align the current identity producer and Resolution request projection boundary
with the accepted Replay Contracts.

### Files Expected To Change

- `lib/server/multiCutRequestAdmission/referenceMultiCutRequestAdmission.ts`
- Admission Runtime identity-flow and compatibility tests

### Public API Impact

No new Admission responsibility is introduced. Observable output changes are
limited to conformance with CS-02.

### Backward Compatibility

Existing deterministic projection, idempotency classification, failure
containment, and request-scoped behavior must remain stable. Mixed Contract
versions require an explicit compatibility outcome.

### Preconditions

- CS-02 accepted.
- Identity producer ownership confirmed.
- Admission consumer fixtures identified.

### Postconditions

- Admission produces the accepted identity form deterministically.
- Resolution requests and successful Admission results preserve identity
  continuity.
- Runtime does not infer persistence state.

### Validation

- deterministic projection;
- immutable forwarding;
- cross-scope isolation;
- no implicit identity generation outside existing ownership;
- Admission regression;
- scoped TypeScript diagnostics.

### Rollback Point

Rollback to the last producer compatible with the active Contract version.
CS-02 must not remain active with an incompatible producer.

### Dependencies

- Depends On: CS-02.
- Blocks: CS-04 and identity-bearing consumer migration.
- Independent: SQL and transaction runtime.

## 6. CS-04: Logical Schema

### Purpose

Align logical replay uniqueness and every Lifecycle/Recovery lookup path with
the accepted Contract identity guarantee.

### Files Expected To Change

- `docs/MULTI_CUT_REPLAY_POSTGRESQL_LOGICAL_SCHEMA_V1.md`
- logical-schema consistency validation artifacts, if separately maintained

### Public API Impact

No runtime public API impact. Logical identity and lookup terminology are
affected.

### Backward Compatibility

Four states, Reservation Evidence, Result Reference linkage, terminal
preservation, commit-unknown semantics, and Workflow completion ordering remain
unchanged.

### Preconditions

- CS-03 validated.
- Contract identity continuity proven without persistence.
- Statement Catalog remains unchanged.

### Postconditions

- uniqueness and lookup requirements use one consistent identity guarantee;
- all eight logical access paths are unambiguous;
- no physical design decision appears in the logical model.

### Validation

- Contract-to-logical mapping;
- Resolution/Lifecycle/Recovery terminology;
- state and concurrency invariants;
- commit-unknown support;
- Catalog metadata comparison.

### Rollback Point

Rollback the Logical Schema independently before Physical Schema approval.

### Dependencies

- Depends On: CS-02 and CS-03.
- Blocks: CS-05.
- Independent: executor implementation.

## 7. CS-05: Physical Schema

### Purpose

Define the PostgreSQL physical representation capable of enforcing the
accepted Contract and Logical Schema identity guarantee.

### Files Expected To Change

- new PostgreSQL Physical Schema specification document

No source, migration, or statement file belongs to this change set.

### Public API Impact

None. This is a persistence specification boundary.

### Backward Compatibility

Existing persisted-record compatibility and mixed-version identity
interpretation must be classified before approval.

### Preconditions

- CS-04 accepted.
- all physical identity inputs have Contract owners;
- no blocking identity question remains.

### Postconditions

- physical names, types, constraints, indexes, and transaction-sensitive
  columns are fully specified;
- each Catalog operation has one unambiguous physical access path;
- no Contract-external business concept is introduced.

### Validation

- complete field mapping;
- uniqueness and lookup consistency;
- state-dependent constraints;
- concurrency and recovery evidence;
- eight-statement readiness review.

### Rollback Point

Discard the unimplemented Physical Schema specification before CS-06 begins.

### Dependencies

- Depends On: CS-04.
- Blocks: CS-06.
- Independent: Client Abstraction and Transaction Runtime.

## 8. CS-06: SQL Definitions

### Purpose

Define the eight static PostgreSQL statements against the approved Physical
Schema while retaining Statement Catalog metadata.

### Files Expected To Change

- `lib/server/multiCutReplayPostgresqlSqlDefinitions/types.ts`
- `lib/server/multiCutReplayPostgresqlSqlDefinitions/statements.ts`
- `lib/server/multiCutReplayPostgresqlSqlDefinitions/index.ts`
- SQL Definition boundary tests

### Public API Impact

Introduces the SQL Definition package boundary. Replay capability APIs and
Statement Catalog identifiers remain unchanged.

### Backward Compatibility

All eight existing Catalog identifiers, access modes, mutation kinds, and
transaction requirements must match exactly.

### Preconditions

- CS-05 accepted;
- parameter and result metadata complete;
- no unresolved physical name or type.

### Postconditions

- exactly eight immutable definitions exist;
- definitions use only Catalog identifiers;
- no execution, projection, retry, or transaction runtime is introduced.

### Validation

- eight-definition exhaustiveness;
- static-definition boundary;
- Catalog parity;
- parameter/result metadata coverage;
- dependency and circularity audit.

### Rollback Point

Remove the unconsumed SQL Definition package before adapter alignment.

### Dependencies

- Depends On: CS-05.
- Blocks: CS-07 and CS-08.
- Independent: Admission Runtime after CS-03 is complete.

## 9. CS-07: Statement Executor Conformance

### Purpose

Confirm that the generic Statement Executor remains compatible with the
identity-bearing definitions without acquiring identity interpretation.

### Files Expected To Change

- Statement Executor boundary or compatibility tests
- production files only if conformance diagnostics identify a generic
  boundary mismatch

No identity mapping belongs in the executor.

### Public API Impact

No public API change is expected. Any detected impact requires a separate
scope review before this change set proceeds.

### Backward Compatibility

Existing request/result passthrough, hook boundaries, immutable binding, and
commit-unknown passthrough must remain unchanged.

### Preconditions

- CS-02 accepted;
- CS-06 accepted;
- Executor reverse-dependency audit complete.

### Postconditions

- executor accepts the definition boundary through existing generic hooks;
- executor has no replay identity semantics;
- no SQL generation or parameter mapping enters the executor.

### Validation

- executor dedicated tests;
- SQL Definition compatibility;
- import isolation;
- circular-dependency audit;
- scoped TypeScript diagnostics.

### Rollback Point

Rollback test-only conformance changes independently. Any production impact
returns the change set to architecture review.

### Dependencies

- Depends On: CS-02 and CS-06.
- Blocks: CS-09.
- Independent: CS-08 implementation internals.

## 10. CS-08: Adapter

### Purpose

Align Contract-to-statement parameter and result mapping with the approved
identity guarantee and physical specification.

### Files Expected To Change

- identity-bearing Resolution, Lifecycle, and Recovery statement adapters
- Replay PostgreSQL adapter boundary
- adapter compatibility and boundary tests

### Public API Impact

Adapter-internal mapping changes are expected. Public Replay results must
remain those accepted in CS-02.

### Backward Compatibility

Failure classifications, affected-row interpretation, transaction
requirements, commit-unknown follow-up, and protected-value behavior must
remain stable.

### Preconditions

- CS-06 accepted;
- identity and physical mapping complete;
- adapter ownership boundaries reconfirmed.

### Postconditions

- every identity-bearing parameter has one Contract source;
- every returned identity has one authoritative physical source;
- no scope inference or hidden lookup context remains;
- commit-unknown recovery addresses the intended replay unambiguously.

### Validation

- Resolution/Lifecycle/Recovery adapter tests;
- eight-statement mapping coverage;
- failure and commit-unknown regression;
- sensitive-value audit;
- scoped TypeScript diagnostics.

### Rollback Point

Rollback the adapter and its SQL Definition dependency to the prior unbound
state before integration.

### Dependencies

- Depends On: CS-02, CS-05, and CS-06.
- Blocks: CS-09.
- Independent: generic client and transaction boundaries.

## 11. CS-09: Integration

### Purpose

Activate one mutually compatible identity version across Admission,
capabilities, persistence adapters, and composition boundaries.

### Files Expected To Change

- Replay identity composition and integration files identified by consumer
  diagnostics
- integration tests
- deployment-readiness documentation where required

Route, Workflow behavior, and unrelated composition remain outside scope.

### Public API Impact

No new public behavior is introduced. Integration selects and wires the
accepted component versions.

### Backward Compatibility

Mixed-version operation must be explicitly classified. No implicit downgrade,
fallback, or incomplete-identity acceptance is permitted.

### Preconditions

- CS-03, CS-04, CS-05, CS-06, CS-07, and CS-08 validated;
- persisted-record compatibility decision complete;
- rollback version set identified.

### Postconditions

- one identity guarantee is active end to end;
- all producers and consumers use compatible versions;
- persistence lookup is unambiguous;
- protected identity does not leak.

### Validation

- end-to-end identity continuity;
- cross-scope isolation;
- replay, lifecycle, and recovery behavior;
- commit-unknown recovery;
- dependency and consumer diagnostics;
- full scoped regression.

### Rollback Point

Restore the complete pre-refactoring version set. Partial component rollback is
not permitted after integration activation.

### Dependencies

- Depends On: CS-03 through CS-08.
- Blocks: production activation.
- Independent: unrelated Route and Workflow feature work.

## 12. Four-phase migration strategy

### Phase 1: Contract and producer alignment

Contains CS-01, CS-02, and CS-03.

Exit gate:

- Shared Types, Replay Contracts, and Admission Runtime use one compatible
  version set;
- Contract and Admission tests pass;
- repository remains buildable;
- persistence consumers remain inactive or explicitly compatible.

Rollback point: the commit immediately before CS-01.

### Phase 2: Persistence specification

Contains CS-04 and CS-05.

Exit gate:

- Contract-to-logical-to-physical mapping is complete;
- no source consumer is activated by documentation work;
- repository remains buildable;
- SQL Definition work has no blocking question.

Rollback point: the accepted Phase 1 boundary.

### Phase 3: Statement and adapter alignment

Contains CS-06, CS-07, and CS-08.

Exit gate:

- eight statements are covered;
- executor generic boundaries remain intact;
- adapters map identity without inference;
- dedicated and scoped regression tests pass;
- repository remains buildable.

Rollback point: the accepted Phase 2 boundary.

### Phase 4: Integration activation

Contains CS-09.

Exit gate:

- end-to-end identity continuity and cross-scope isolation pass;
- mixed-version and rollback decisions are recorded;
- consumer diagnostics are clean;
- repository remains buildable.

Rollback point: the accepted Phase 3 boundary and its complete compatible
component set.

## 13. Compatibility and rollback invariants

1. Every phase ends with one internally compatible component set.
2. A later-phase artifact is never used to infer an earlier Contract meaning.
3. Contract and producer versions move together.
4. Logical, physical, and statement artifacts move in dependency order.
5. Adapter activation waits for all upstream specifications.
6. Integration rollback restores the whole identity-bearing version set.
7. Statement Catalog, Client Abstraction, Transaction Runtime, and generic
   Executor semantics remain stable unless an explicit conformance gate fails.

## 14. Validation summary

Required review before implementation:

- graph has no cycle;
- each change set has one responsibility owner;
- every dependency and blocker is explicit;
- every phase has a buildable exit gate;
- every change set and phase has a rollback point;
- public API impact is classified;
- backward compatibility is addressed without silent fallback;
- no Contract or Runtime amendment content appears in this specification;
- no statement text, database definition, or implementation guidance appears;
- Markdown and diff validation pass.
