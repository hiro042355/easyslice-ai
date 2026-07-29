# Replay Terminal Boundary Concurrency Continuity ADR V1

## Status

Accepted.

## Date

2026-07-29.

## Context

Replay Identity Authority, Replay Concurrency Authority, Replay Lease and
Attempt Persistence Policy, Shared Identity Schema V2, Replay Contracts V4,
Logical Schema V2, Physical Schema V2, Parameter Contract V2, and the existing
Statement Catalog establish the current Replay persistence architecture.

The architecture permits a released Replay record to acquire processing
ownership again. `resolve-existing-replay` is catalogued as a write operation
with reservation-create semantics. Every successful ownership acquisition
must advance the reservation attempt exactly once, and fencing evidence must
remain monotonic. Revision is already lifecycle-persistent.

Logical Schema V2 puts Reservation Evidence only on processing records.
Physical Schema V2 likewise requires terminal records to clear processing
evidence, including active fence, attempt, lease identity, lease expiry, and
ownership evidence. Consequently, a released record retains no canonical
source for the next fence or attempt.

## Problem Statement

Released re-reservation requires monotonic revision, fencing, and attempt
continuity without treating an inactive terminal record as an active owner.
The successor source must survive terminal transition, support atomic
compare-and-swap, remain authoritative after commit-unknown, and never depend
on Runtime memory or an implicit null-to-zero conversion.

## Existing Authority Conflict

The following established requirements cannot all be represented by the
current schemas:

- released Replay is re-reservable;
- re-reservation is a successful ownership acquisition;
- revision advances on every successful mutation;
- fence is a monotonic ownership epoch;
- attempt advances exactly once per successful ownership acquisition;
- terminal records clear active processing evidence;
- current terminal records retain no fence or attempt successor source.

Resetting either counter would violate monotonicity and allow ABA-shaped
evidence reuse. Retaining active evidence would misrepresent terminal state.
The conflict is representational, not an Identity Authority conflict.

## Decision Drivers

- preserve Replay identity authority;
- preserve fence and attempt monotonicity;
- preserve ABA protection;
- distinguish lifecycle-persistent counters from active processing evidence;
- make commit-unknown reconciliation authoritative;
- keep generation in PostgreSQL;
- use atomic compare-and-swap;
- avoid Runtime clock or memory authority;
- minimize schema and migration complexity without conflating meanings;
- permit direct Parameter and SQL Definition Contract projection.

## Considered Options

### Option 1: Terminal row retains active counter columns

The existing `fencing_token` and `reservation_attempt` would remain populated
after terminal transition while lease and ownership fields clear.

- Existing ADR compatibility: partial.
- Concurrency safety: counters remain available.
- ABA protection: preserved.
- Schema complexity: low.
- Semantic cost: active Reservation Evidence columns would acquire historical
  meanings.
- Constraint impact: processing-evidence constraints require exceptions.
- Maintainability: rejected because active evidence and historical source are
  conflated.

### Option 2: Separate persistent counters from active evidence

The Replay record gains lifecycle-persistent `last_fencing_token` and
`last_reservation_attempt`. Active `fencing_token` and
`reservation_attempt` remain processing-only.

- Existing ADR compatibility: high.
- Identity semantics: unchanged.
- Concurrency safety: one row owns both current state and successor sources.
- ABA protection: preserved across every terminal boundary.
- Retry safety: stable persisted counters support reconciliation.
- Schema complexity: two columns and amended constraints.
- Migration impact: explicit backfill and eligibility gate.
- SQL complexity: bounded and deterministic.
- Runtime impact: none.
- Auditability and maintainability: high because active and historical roles
  remain distinct.
- Decision: accepted.

### Option 3: Append-only ownership history

- Concurrency safety and auditability: high.
- Commit-unknown recovery: strong.
- Schema and transaction complexity: substantially higher.
- Migration impact: new table and relationships.
- Long-term fit: viable if full ownership history later becomes a requirement.
- Decision: rejected for V2 because successor continuity alone does not
  justify a history subsystem.

### Option 4: Global or scoped database sequence

- Generation authority: singular.
- Monotonicity: strong.
- Retry behavior: sequence gaps and transaction-independent consumption
  complicate logical-attempt reconciliation.
- Scope semantics: global ordering is unnecessary.
- Schema complexity: sequence lifecycle and scope ownership.
- Decision: rejected.

### Option 5: Prohibit released re-reservation

- Schema impact: none.
- Concurrency safety: simple.
- Compatibility: contradicts existing concurrency and lease ADRs, Parameter
  Contract inputs, and Statement Catalog reservation-create classification.
- Product semantics: forces a new Replay identity.
- Decision: rejected.

## Decision

Adopt Option 2.

1. Released Replay re-reservation remains allowed.
2. Revision remains lifecycle-persistent in the existing `revision` column.
3. Fence and reservation attempt gain separate lifecycle-persistent successor
   source columns:
   - `last_fencing_token`;
   - `last_reservation_attempt`.
4. Active processing evidence remains in the existing Reservation Evidence
   columns and is cleared on every terminal transition.
5. PostgreSQL is the sole successor generator for revision, fence, and
   reservation attempt.
6. Re-reservation atomically advances all three lifecycle-persistent counters,
   creates new active evidence, clears released terminal metadata, and changes
   state to processing.
7. Completed and failed records are not re-reservable.
8. No existing identity, fingerprint, internal UUID, or Protected Scope field
   changes.

## Evidence Classification

| Evidence | Classification | Processing state | Terminal state | Re-reservation role |
|---|---|---|---|---|
| `revision` | lifecycle-persistent CAS evidence | retained | retained | canonical revision successor source |
| `last_fencing_token` | lifecycle-persistent ownership epoch counter | retained | retained | canonical fence successor source |
| `last_reservation_attempt` | lifecycle-persistent acquisition counter | retained | retained | canonical attempt successor source |
| active `fencing_token` | processing-session evidence | present | null | copied from the newly advanced persistent fence |
| active `reservation_attempt` | ownership-scoped evidence | present | null | copied from the newly advanced persistent attempt |
| reservation identity | active ownership evidence | present | null | newly supplied ownership intent |
| lease identity | lease-scoped evidence | present | null | newly supplied lease intent |
| lease expiry | lease-scoped evidence | present | null | newly generated from database clock |
| Reservation Evidence versions | processing-session evidence | present | null | recreated with new active evidence |

Lifecycle-persistent counters are not an active lease and cannot authorize work
without complete current Reservation Evidence.

## Terminal Boundary Policy

Complete, fail, and release:

- retain immutable Replay identity;
- retain semantic fingerprint;
- retain internal record UUID;
- advance and retain revision;
- retain `last_fencing_token` unchanged;
- retain `last_reservation_attempt` unchanged;
- clear reservation identity and its active version;
- clear active fencing token and its active version;
- clear active reservation attempt;
- clear lease identity, lease expiry, and lease version;
- clear expected-revision fields that belong to active Reservation Evidence;
- preserve terminal metadata required by the resulting terminal state;
- preserve Result Reference only for completed state.

The persistent counters are never interpreted as active ownership evidence.

## Revision Continuity

The existing persisted `revision` column is the canonical successor source.
The expected binding is a compare-and-swap predicate only; it is not the
arithmetic source.

Revision is canonical positive decimal text with an inclusive maximum of
`9,223,372,036,854,775,807`. PostgreSQL computes the checked successor from
the persisted column:

`CASE WHEN revision ~ '^[1-9][0-9]*$' AND revision::numeric < 9223372036854775807 THEN (revision::numeric + 1)::text ELSE NULL::text END`

The expected revision must exactly equal the persisted revision in the same
conditional mutation. The successor becomes visible only through a successful
statement result or later authoritative reconciliation. Runtime never parses,
orders, or increments it.

## Fence Continuity

`last_fencing_token` is the canonical lifecycle-persistent fence source. It is
canonical positive decimal text with the same inclusive maximum as revision.

Initial reservation sets both `last_fencing_token` and active
`fencing_token` to canonical text `1`.

Renew and terminal transition:

- retain `last_fencing_token`;
- renew retains active `fencing_token`;
- terminal transition clears active `fencing_token`.

Takeover and released re-reservation calculate:

`CASE WHEN last_fencing_token ~ '^[1-9][0-9]*$' AND last_fencing_token::numeric < 9223372036854775807 THEN (last_fencing_token::numeric + 1)::text ELSE NULL::text END`

The result is written atomically to both `last_fencing_token` and the new
active `fencing_token`. The prior epoch can never recur for the same Replay
record.

Fence monotonicity is scoped to one authoritative Replay record. No global
ordering is asserted.

## Reservation Attempt Continuity

`last_reservation_attempt` is the canonical lifecycle-persistent attempt
source. It is PostgreSQL integer from `1` through `2,147,483,647`.

Initial reservation sets both persistent and active attempt to `1`.
Renew and terminal transition do not advance the persistent counter. Terminal
transition clears the active attempt.

Takeover and released re-reservation use the existing checked successor:

`(last_reservation_attempt::bigint + 1)::integer`

The mutation predicate requires `last_reservation_attempt` between `1` and
`2,147,483,646`. The result is written atomically to both persistent and active
attempt columns. Attempt is never reset to `1`.

## Released Re-reservation Eligibility

Only state `released` is eligible. Completed and failed records remain
terminal and non-re-reservable.

Re-reservation requires:

- complete authoritative Replay identity;
- exact schema and identity versions;
- semantic fingerprint equality after authoritative selection;
- state exactly `released`;
- expected revision equality;
- expected `last_fencing_token` equality;
- expected `last_reservation_attempt` equality;
- no active reservation, fence, attempt, lease identity, lease expiry, or
  processing Reservation Evidence;
- new reservation and lease identities from the Persistence Generation
  Capability;
- a validated lease duration from the Lease Policy Capability.

One atomic mutation:

- changes state from released to processing;
- advances revision;
- advances persistent fence and copies it to active fence;
- advances persistent attempt and copies it to active attempt;
- installs new reservation and lease identities;
- creates complete processing Reservation Evidence and versions;
- generates lease expiry using `transaction_timestamp()` and the canonical
  duration expression;
- clears released terminal metadata;
- leaves Result Reference null;
- preserves identity, fingerprint, and internal UUID.

The operation returns the authoritative Replay identity, revision, complete
new Reservation Evidence, and both lifecycle-persistent counter values.

## Generation Authority

| Value | Canonical source | Generation owner | Consumer |
|---|---|---|---|
| revision successor | persisted `revision` | PostgreSQL | every successful mutation |
| fence successor | persisted `last_fencing_token` | PostgreSQL | takeover and released re-reservation |
| attempt successor | persisted `last_reservation_attempt` | PostgreSQL | takeover and released re-reservation |
| reservation identity | Persistence Generation Capability input | persistence composition | new active ownership |
| lease identity | Persistence Generation Capability input | persistence composition | new active lease |
| lease expiry | transaction clock plus bounded duration | PostgreSQL | new active lease |

Runtime, Lifecycle Runtime, and Recovery Runtime do not generate or predict
counter successors.

## Overflow Policy

Revision and fence maximum is `9,223,372,036,854,775,807`. Attempt maximum is
`2,147,483,647`.

PostgreSQL owns format, range, and overflow detection inside the mutation.
Revision and fence checked expressions return `NULL` on malformed or exhausted
source. Their lifecycle-persistent columns are non-null, so the statement
fails with a constraint error and the transaction performs no row mutation.
Attempt requires the bounded predecessor predicate and uses a bigint
intermediate; a cast overflow likewise fails the statement atomically.

Overflow:

- is non-retryable with the same record state;
- does not transition the Replay record to failed;
- does not authorize a new identity;
- requires an operational alert;
- requires authoritative lookup only when commit outcome itself is unknown;
- is classified through the existing dependency/internal failure boundary;
- cannot be repaired or wrapped by Runtime.

## Retry and Reconciliation

- A logical re-reservation retains expected revision, expected persistent
  counters, new reservation identity, new lease identity, and lease duration.
- Zero rows means no success; authoritative lookup is required because state
  or concurrency evidence may have changed.
- A known constraint failure is not blindly retried.
- Commit-unknown requires lookup by complete authoritative Replay identity.
- Reconciliation compares persisted state, revision, persistent counters, and
  requested new ownership intent.
- If persisted processing evidence matches the retained request, success is
  confirmed.
- If released state and prior counters remain, the mutation was not applied.
- Any mixed or malformed evidence is reconciliation-required.
- No second successor is generated before reconciliation completes.

## Transaction Visibility

Expected revision, expected persistent counters, requested identities, and
duration are known before the statement. Counter successors and lease expiry
are generated inside one PostgreSQL mutation. New active evidence and updated
persistent counters become authoritative together.

A returned row exposes the committed candidate result but does not replace
commit-outcome handling. Unknown commit outcome makes returned or locally held
successors non-authoritative until reconciliation.

## Schema Impact

### Logical Schema

Logical Schema requires a lifecycle-persistent concurrency-continuity object
on the common record base containing:

- last fencing token;
- last reservation attempt.

Revision remains in the existing base. Active Reservation Evidence remains
processing-only.

### Physical Schema

Physical Schema requires two non-null lifecycle-persistent columns:

- `last_fencing_token`, text, canonical positive decimal;
- `last_reservation_attempt`, integer.

Initial processing insertion populates both. Every state retains them.
Processing constraints require active fence and attempt to equal their
persistent counterparts. Terminal constraints require active processing
evidence null while persistent counters remain non-null.

No ownership-history table is required.

## Contract Impact

Parameter Contract must add:

- persistent counter input and returning metadata;
- expected persistent counter bindings for takeover and re-reservation;
- exact revision and fence successor expressions;
- released re-reservation mutation and projection metadata;
- overflow and reconciliation metadata.

SQL Definition Contract can then flatten the persistent counters, predicates,
mutations, projections, and exact expressions without inference.

Statement Catalog retains the existing eight IDs and keeps
`resolve-existing-replay` as a write/reservation-create operation. Replay
Contracts V4 and Runtime interfaces require no change because persistent
counters remain persistence-internal concurrency evidence.

## Migration Impact

A Physical Schema migration is required after Logical Schema amendment.

- Processing rows can backfill persistent counters from active fence and
  attempt.
- Terminal rows lacking recoverable prior counters cannot be assigned guessed
  values.
- Such terminal rows must be quarantined from re-reservation until an
  authoritative migration source proves their last counters.
- If no production V2 rows exist, migration initializes only through normal
  insert semantics.
- Constraints become enforceable only after backfill validation succeeds.

Migration never resets a counter and never treats null as zero.

## Consequences

### Positive

- monotonicity survives every terminal boundary;
- active ownership remains unambiguous;
- ABA evidence reuse is prevented;
- re-reservation and takeover share one counter model;
- commit-unknown reconciliation has persisted successor sources;
- Runtime remains propagation-only.

### Negative

- Logical and Physical Schema amendments are required;
- two persisted columns duplicate active values during processing;
- migration must handle unrecoverable historical terminal rows explicitly;
- SQL predicates and projections gain two fields.

## Compatibility

- Replay Identity Authority is unchanged.
- Concurrency Authority remains PostgreSQL-owned and monotonic.
- Lease and Attempt policy remains one-based and exactly-one advancement.
- Replay Contracts V4 remain unchanged.
- Statement Catalog remains unchanged.
- Runtime remains unchanged.
- Logical Schema V2 and Physical Schema V2 require versioned amendments before
  Parameter or SQL Definition completion.
- Parameter Contract V2 requires a follow-up amendment.

## Superseded Decisions

This ADR supersedes only the interpretation that all fence and attempt values
are wholly processing-scoped and may disappear at terminal transition.

It does not supersede:

- active Reservation Evidence clearing;
- PostgreSQL generation authority;
- one-based attempt semantics;
- monotonic fence semantics;
- revision CAS semantics;
- released re-reservation eligibility;
- transaction-clock lease semantics.

## Validation Requirements

Follow-up change sets must prove:

- persistent counters exist in every state;
- active fence and attempt equal persistent counters while processing;
- active evidence is null in terminal states;
- terminal transitions do not change persistent fence or attempt;
- re-reservation and takeover advance each persistent counter exactly once;
- revision advances from the persisted revision;
- no counter resets or wraps;
- overflow rolls back the mutation;
- old ownership evidence cannot satisfy new processing predicates;
- commit-unknown reconciliation compares requested intent and persisted
  counters;
- completed and failed records cannot re-reserve;
- released metadata clears atomically on successful re-reservation;
- identity, fingerprint, Protected Scope, and internal UUID never mutate.

## Implementation Sequence

1. Amend Logical Schema with lifecycle-persistent concurrency continuity.
2. Amend Physical Schema and constraints with the two persistent counters.
3. Define and validate the migration/backfill boundary.
4. Amend Parameter Contract with persistent counter metadata and exact
   successor expressions.
5. Complete SQL Definition Contract flattening and re-reservation metadata.
6. Implement SQL Definitions V2.
7. Align Statement Adapters and projections.
8. Integrate Executor and PostgreSQL Adapter.
9. Integrate transaction and commit-unknown recovery behavior.
10. Run migration and concurrency integration tests.

Each step is an atomic change set and must remain buildable before the next.

## Non-Goals

- adding new Replay identity fields;
- changing public Replay Contracts V4;
- implementing schema or migration in this ADR;
- implementing SQL, Adapter, Executor, Client, or Runtime;
- retaining active leases in terminal state;
- adding global counter ordering;
- adding ownership history;
- permitting completed or failed re-reservation;
- defining operational repair for exhausted counters.
