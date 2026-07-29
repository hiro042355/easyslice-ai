# Replay Concurrency Authority and Generation Ownership ADR V1

## Status

Accepted.

## Date

2026-07-29.

## Context

Replay Identity Authority, Shared Identity Schema V2, Replay Contracts V4,
Admission/Lifecycle/Recovery Runtime V4, Logical Schema V2, and Physical Schema
V2 are established. They preserve a version-pinned authoritative Replay
identity from Admission through persistence consumers.

CS-08 cannot define deterministic SQL parameters until the generation
authority for internal record identity and concurrency evidence is singular.
Existing sources establish PostgreSQL as the lease clock, prohibit callers
from creating a takeover fence or authoritative expiry, and require
commit-unknown reconciliation. They do not assign one generator boundary for
internal UUID, reservation identity, and lease identity.

The following prior statements are resolved by this ADR:

- UUID generator/provider/version was TBD.
- revision advancement was intentionally non-numeric and
  implementation-defined.
- PostgreSQL was database-clock-owned for lease expiry.
- Runtime-owned Replay identity was already fixed to Admission.
- callers were prohibited from generating authoritative takeover fence and
  lease expiry.

## Problem Statement

Every value consumed or returned by Replay Persistence V2 needs exactly one
generation owner, deterministic transaction visibility, and an explicit retry
rule. SQL must not invent identity, concurrency, or clock semantics. Runtime
must not predict database-owned results.

## Decision Drivers

- single generation authority;
- stale-writer rejection;
- atomic comparison and mutation;
- safe commit-unknown recovery;
- stable logical-attempt identity;
- deterministic parameter projection;
- testability without production infrastructure;
- PostgreSQL-native concurrency behavior;
- compatibility with Replay Identity V2 and Replay Contracts V4;
- minimal changes to established Runtime responsibilities.

## Considered Options

### Internal record identifier

| Option | Correctness and retry safety | Complexity and compatibility | Decision |
|---|---|---|---|
| A. Application or Runtime UUID | Stable if carefully retained, but expands business Runtime responsibility and risks regeneration on retry | Conflicts with propagation-only Runtime boundaries | Rejected |
| B. PostgreSQL UUID returned by mutation | Atomic, but unavailable before execution and unstable across a safely retried uncommitted attempt | Conflicts with Physical Schema V2 `default: none` and complicates insert intent correlation | Rejected |
| C. Injected generator boundary | Stable before execution, deterministic in tests, reusable across commit-unknown reconciliation | Requires one small future persistence capability and Adapter composition wiring | Accepted |

Option C is refined as a dedicated
**Replay Persistence Generation Capability**, injected at the persistence
Adapter composition boundary. It is not added to the generic PostgreSQL Client
and is not a Runtime service.

### Revision

| Option | Correctness and stale-writer protection | Compatibility | Decision |
|---|---|---|---|
| Runtime-generated revision | Creates split authority and permits concurrent writers to propose successors | Conflicts with atomic CAS | Rejected |
| Numeric application sequence | Requires cross-process coordination | Adds a new sequence contract | Rejected |
| Database-generated monotonic successor encoded as canonical decimal text | Equality-CAS, increment, and successful mutation are one atomic operation | Matches the current text column while preserving an opaque external Contract | Accepted |

Revision is initialized to canonical decimal text `1`. Each successful mutation
atomically replaces it with the canonical decimal representation of the
previous value plus one. PostgreSQL owns parsing, increment, and canonical
encoding. Contracts expose equality only; Runtime must treat the value as
opaque and must never order or increment it.

### Fencing token

| Option | Correctness | Retry safety | Decision |
|---|---|---|---|
| Runtime-generated fence | Can race with the authoritative ownership mutation | Requires Runtime prediction | Rejected |
| Revision reused as fence | Conflates record mutation with ownership epoch | Makes renew rotate ownership | Rejected |
| Database-generated independent monotonic fence encoded as canonical decimal text | Atomic with initial reservation or takeover and rejects stale owners | Recovered through authoritative observation | Accepted |

The initial fence is canonical decimal text `1`. Takeover atomically replaces
it with the canonical decimal representation of the previous fence plus one.
Renew and terminal transitions preserve it. Runtime treats the fence as opaque
and never performs numeric comparison.

### Reservation and lease identities

| Option | Retry behavior | Architecture effect | Decision |
|---|---|---|---|
| Separate Resolution and Recovery generators | Same semantic type has multiple generation owners | Recreates the CS-07.5 ambiguity | Rejected |
| Database generation | Values are unknown before mutation and cannot identify caller takeover intent after commit-unknown | Weakens reconciliation | Rejected |
| One injected persistence generator | Values are known before mutation and stable for the logical attempt | Preserves Runtime and database boundaries | Accepted |

### Lease expiry

| Option | Clock consistency | Decision |
|---|---|---|
| Application clock | Cross-process skew can create or prolong ownership | Rejected |
| Mixed application and database clocks | No single authority | Rejected |
| PostgreSQL transaction clock plus bounded duration input | One authoritative observation per statement/transaction | Accepted |

The lease duration is a versioned persistence policy input supplied before the
statement. It is not an absolute timestamp. PostgreSQL calculates the
authoritative expiry.

### Consolidated option impact

| Decision | Correctness | Atomicity | Retry safety | Stale-writer protection | Testability | Implementation complexity | Migration impact | Existing compatibility | Parameter Contract impact | Executor and Adapter impact |
|---|---|---|---|---|---|---|---|---|---|---|
| Injected internal/ownership identity generation | one owner outside business Runtime | values exist before statement | logical attempt reuses values | neutral; fence remains DB-owned | deterministic fixture | one small capability | V2 only | preserves Runtime propagation | explicit required parameters | Adapter receives capability; Executor remains generic |
| Database decimal revision successor | exact CAS authority | comparison and increment are one mutation | reconcile before reuse | rejects stale revision | deterministic transaction fixture | canonical parse/increment | V2 only | preserves opaque string Contract | expected input and returned successor | Adapter projects; Executor does not interpret |
| Database decimal fence successor | one ownership epoch authority | rotation and takeover are one mutation | reconcile before another rotation | directly rejects stale owner | deterministic database fixture | canonical parse/increment | V2 only | preserves opaque fence Contract | expected input and returned successor | Adapter projects; Executor does not interpret |
| Injected reservation/lease identities | one persistence generator | stable intent enters atomic mutation | same intent survives unknown commit | DB fence remains decisive | deterministic fixture | generator plus attempt envelope | V2 only | supports requested takeover intent | required pre-statement parameters | Adapter retains intent; Executor remains generic |
| Database clock expiry | one clock and calculation owner | expiry and mutation share observation | new expiry is trusted only after success | prevents application-clock takeover | transaction clock fixture | bounded duration policy | V2 only | matches Lifecycle ADR | duration input, expiry output | Adapter passes duration; Executor remains generic |

## Decision

### Generation authorities

1. Admission Runtime remains the sole generator of authoritative Replay
   identity and request fingerprint identity.
2. Replay Persistence Generation Capability is the sole generator of:
   - `internal_record_id`;
   - reservation identity;
   - lease identity.
3. Replay Persistence Lease Policy Capability is the sole authority for the
   bounded, versioned lease-duration input. It supplies duration, never an
   absolute timestamp.
4. PostgreSQL is the sole generator of:
   - initial and successor revision;
   - initial and takeover fencing token;
   - initial, renewed, and takeover lease expiry;
   - reservation-attempt successor;
   - no general audit timestamp beyond the timestamps already present in
     Physical Schema V2.
5. Lifecycle input owners remain the generators of terminal metadata.
6. The existing Result Reference boundary remains the generator of Result
   Reference.
7. Recovery generates no authoritative evidence. It interprets authoritative
   persisted evidence returned by PostgreSQL.

### Concurrency contract version

Persistence concurrency parameters use an explicit `2.0` boundary. V1 and V2
parameters, rows, and statements must not be mixed. There is no implicit
upgrade, default completion, or fallback.

### Reservation generations

The persistence generator creates one reservation identity and one lease
identity before each operation that establishes a processing ownership
generation:

- initial reservation;
- released re-reservation;
- stale takeover.

The pair is immutable within that ownership generation. Renew preserves both.
Takeover replaces both atomically.

### Revision

- initial creation returns revision `1`;
- every successful renew, terminal transition, re-reservation, and takeover
  returns the canonical decimal successor;
- comparison is exact equality with the expected revision;
- zero affected rows is not success;
- a revision is never regenerated or guessed outside PostgreSQL;
- a revision has no numeric public meaning outside PostgreSQL.

### Fencing

- initial reservation creates fence `1` within the insert;
- renew preserves the current fence;
- terminal transitions compare and preserve the current fence;
- takeover compares the previous fence and creates a new fence atomically;
- a previous fence cannot authorize a mutation after takeover;
- fence and revision are independent values.

### Lease

- PostgreSQL owns the authoritative clock and expiry calculation;
- duration is an explicit, bounded, versioned persistence-policy parameter;
- initial reservation, renew, and takeover calculate expiry from one
  transaction-consistent clock observation;
- Runtime timestamps never authorize lease ownership;
- renew preserves reservation identity, lease identity, fence, and attempt;
- takeover replaces reservation identity, lease identity, fence, expiry, and
  advances attempt.

## Authority Matrix

| Value | Authority | Generation owner | Validation owner | Persistence owner | Mutability | Retry behavior | Transaction visibility |
|---|---|---|---|---|---|---|---|
| Replay authoritative identity | Replay Identity V2 | Admission Runtime | Admission and Adapter projection | PostgreSQL | immutable | reuse | known before statement |
| request fingerprint | Request semantics | Admission Runtime | Admission and Adapter projection | PostgreSQL | immutable | reuse | known before statement |
| `internal_record_id` | Persistence internal identity | Persistence Generation Capability | generation capability and DB type constraint | PostgreSQL | immutable | reuse for same logical creation attempt | known before statement |
| initial revision | persisted record CAS | PostgreSQL | PostgreSQL | PostgreSQL | replaced by successor | observe after unknown commit | generated and returned by statement |
| next revision | persisted record CAS | PostgreSQL | PostgreSQL predicate | PostgreSQL | mutable successor | never predict; reconcile first | generated and returned by successful mutation |
| initial fencing token | ownership epoch | PostgreSQL | PostgreSQL | PostgreSQL | replaced only by takeover | observe after unknown commit | generated and returned by insert |
| takeover fencing token | ownership epoch | PostgreSQL | PostgreSQL predicate | PostgreSQL | mutable on takeover | never regenerate before reconciliation | generated and returned by takeover |
| reservation identity | ownership intent | Persistence Generation Capability | Adapter projection and PostgreSQL | PostgreSQL | replaced on re-reservation/takeover | reuse for same logical attempt | known before statement |
| initial lease identity | lease intent | Persistence Generation Capability | Adapter projection and PostgreSQL | PostgreSQL | immutable during ownership generation | reuse for same logical attempt | known before statement |
| renewed lease identity | existing ownership generation | Persistence Generation Capability at original generation | PostgreSQL predicate | PostgreSQL | preserved | reuse | known before statement |
| takeover lease identity | takeover intent | Persistence Generation Capability | Adapter projection and PostgreSQL | PostgreSQL | replaces prior lease identity | reuse until reconciliation | known before statement |
| lease duration | bounded persistence policy | Persistence Lease Policy Capability | parameter validation | not persisted | policy input | reuse for same logical attempt | known before statement |
| lease expiry | lease time authority | PostgreSQL | PostgreSQL bounded-duration rule | PostgreSQL | mutable on renew/takeover | authoritative observation only | generated and returned by statement |
| `created_at` | not part of Replay Physical Schema V2 | Not generated | schema-boundary review | none | not applicable | not applicable | not applicable |
| `updated_at` | not part of Replay Physical Schema V2 | Not generated | schema-boundary review | none | not applicable | not applicable | not applicable |
| `terminal_at` | Lifecycle result semantics | Lifecycle input owner | Lifecycle validation and Adapter projection | PostgreSQL | immutable after terminal transition | reuse supplied value; reconcile state | known before statement |
| result reference | Result Reference boundary | Result Reference capability | completion boundary and Adapter projection | PostgreSQL linkage | immutable after completion | reuse supplied reference | known before completion statement |
| reconciliation evidence | authoritative persisted observation | PostgreSQL | Recovery projection | PostgreSQL | read-only projection | repeat read safely | returned by authoritative read |

## Generation Timing Matrix

| Phase | Values generated |
|---|---|
| Admission | Replay identity and fingerprint |
| Persistence request preparation | internal record ID when creating; reservation and lease identities when establishing ownership; bounded lease duration |
| Initial reservation statement | initial revision, fence, expiry, and attempt |
| Renew statement | successor revision and renewed expiry |
| Terminal transition statement | successor revision |
| Takeover statement | successor revision, new fence, expiry, and advanced attempt |
| Reconciliation read | no new evidence; authoritative persisted evidence is projected |

## Transaction Visibility Matrix

| Visibility class | Values | Rule |
|---|---|---|
| known before statement | Replay identity, fingerprint, internal ID, reservation identity, lease identity, expected evidence, duration, terminal metadata, Result Reference | stable for one logical attempt |
| generated within statement | revision, fence, expiry, attempt, database audit timestamps | not authoritative before successful mutation |
| returned after statement | complete persisted concurrency evidence and relevant terminal projection | caller uses returned values only |
| shared across workflow-completion transaction | completion Result Reference, expected evidence, and resulting revision | commit/rollback as one transaction |
| commit outcome unknown | no generated output is assumed | authoritative Recovery observation is required |

## Takeover Concurrency Evidence

Before takeover, PostgreSQL compares:

- complete authoritative Replay identity and V2 discriminators;
- processing state;
- expected revision;
- prior reservation identity;
- prior lease identity;
- prior fencing token;
- prior reservation attempt;
- authoritative lease expiry against the PostgreSQL clock.

The persistence generator supplies the requested next reservation and lease
identities before execution. PostgreSQL atomically generates the successor
revision, next fence, next expiry, and advanced attempt. The successful
statement returns the complete authoritative evidence. A stale worker fails at
the conditional mutation and cannot use the prior fence.

## Reconciliation Evidence

Reconciliation has no new authority and generates no concurrency value. It
uses the same complete Replay identity as Lifecycle and Recovery, reads the
authoritative state, and compares the caller’s retained intent and previous
evidence with the persisted revision, reservation, lease, fence, attempt, and
state.

Repeated reconciliation reads are idempotent. Terminal state is preserved.
Ambiguous evidence is `reconciliation-required`, never inferred success.

## Retry and Idempotency Rules

### Insert retry

The same internal record ID, reservation identity, lease identity, Replay
identity, fingerprint, and duration are retained until authoritative
resolution. A uniqueness conflict is classified through the authoritative
Replay selector; the internal ID is never used to claim an existing record.
After commit unknown, no second insert occurs before reconciliation.

### Transition retry

Expected evidence and terminal input are retained. Database-generated
successor revision and timestamps are not predicted or reused. A zero-row or
unknown result requires authoritative lookup.

### Lease renewal retry

Reservation, lease, fence, attempt, and expected revision are retained until
reconciliation. A renewed expiry is generated only by the successful database
mutation.

### Takeover retry

Requested next reservation and lease identities remain stable for the logical
takeover attempt. A new fence, revision, expiry, or attempt is never requested
again until reconciliation proves the prior mutation was not applied.

### Reconciliation retry

Read-only reconciliation may repeat with identical identity and intent. It
creates no evidence and does not authorize a blind mutation.

### Transaction retry

An automatic transaction retry is allowed only before commit outcome becomes
unknown and must retain all pre-statement generated identities. Values
generated by a rolled-back statement have no authority. Once commit outcome is
unknown, recovery replaces automatic retry.

## Database Responsibilities

PostgreSQL may generate:

- canonical decimal revision successors;
- canonical decimal ownership fencing successors;
- lease expiry from its transaction clock and bounded duration;
- reservation attempt;
- no additional general audit timestamp.

PostgreSQL must not generate:

- Replay authoritative identity or any Protected Scope component;
- request fingerprint;
- internal record ID;
- reservation identity;
- lease identity;
- Result Reference;
- terminal metadata;
- missing version or scope values.

The Persistence Lease Policy Capability supplies a bounded duration for initial
reservation, renew, re-reservation, and takeover. It is injected at persistence
composition, is deterministic in tests, and never observes an application
clock.

PostgreSQL validates required V2 fields, state constraints, CAS predicates,
fence predicates, lease predicates, and atomic affected-row semantics.

## Runtime Responsibilities

### Admission Runtime

Admission generates Replay authoritative identity and fingerprint exactly as
defined by the existing Replay Identity ADR. It does not generate persistence
or concurrency evidence.

### Lifecycle Runtime

Lifecycle preserves Replay identity, forwards expected Reservation Evidence,
terminal metadata, and Result Reference, and interprets results. It does not
generate revision, fence, reservation identity, lease identity, or expiry.

### Recovery Runtime

Recovery preserves Replay identity and previous evidence, carries stable
takeover intent supplied through the persistence boundary, and interprets
authoritative evidence. It does not generate revision, fence, expiry, or
reconciliation evidence.

The future Persistence Parameter Contract and Adapter alignment expose the
injected generation capability without moving it into these Runtimes.

## Consequences

### Positive

- CS-08 receives one authority for every required parameter.
- SQL can remain static and parameterized.
- Runtime never predicts database-owned concurrency values.
- Stale owners are rejected with atomic CAS and fencing.
- Commit-unknown recovery has stable caller intent.
- Generator fixtures make internal and ownership identity deterministic in
  tests.

### Costs

- A small versioned Persistence Generation Capability Contract is required.
- Parameter projection must retain a logical-attempt envelope across
  commit-unknown recovery.
- SQL Definitions must return complete concurrency evidence.
- Client/Adapter composition must receive deterministic production and test
  generators without making the generic PostgreSQL Client an identity owner.

## Compatibility

- Replay authoritative identity remains Admission-owned.
- Lifecycle and Recovery never regenerate Replay identity.
- Protected Scope is never inferred.
- Fingerprint remains semantic compatibility data only.
- Logical and Physical Schema V2 remain breaking boundaries.
- V1/V2 implicit mixing and fallback are forbidden.
- Concurrency Parameter Contract V2 is version-pinned and has no implicit V1
  adapter.

## Security and Correctness Considerations

- Internal UUID is not logged, exposed, or used as a business selector.
- Raw tenant, raw idempotency key, and raw fingerprint never enter persistence.
- Generator outputs must be unguessable enough for their internal purpose, but
  exact algorithm selection belongs to the generation capability
  implementation.
- Revision and fence are distinct; neither substitutes for Replay identity.
- Application time cannot authorize lease ownership.
- SQL error detail must not expose protected identity or concurrency values.

## Validation Requirements

1. Every parameter has exactly one generation owner.
2. All eight SQL Definitions use the complete version-pinned selector.
3. Insert parameters include stable internal, reservation, and lease
   identities.
4. Mutations compare expected revision and required ownership/fence evidence.
5. Renew preserves fence, reservation identity, lease identity, and attempt.
6. Takeover rotates ownership identities and fence atomically.
7. Only PostgreSQL calculates authoritative lease expiry.
8. Database-generated values are returned by the owning statement.
9. Commit-unknown tests prove no blind regeneration or retry.
10. Replay Identity ADR compatibility and V1/V2 isolation remain explicit.

## Implementation Sequence

1. **Persistence Generation and Lease Policy Capability Contracts**: define
   the injected, deterministic generation boundary for internal record,
   reservation, and lease identities, plus the bounded duration policy.
   Atomic boundary: Contracts and fixtures only.
2. **Concurrency Parameter Contract V2**: define fixed names, order,
   provenance, duration policy input, and returned evidence. Atomic boundary:
   parameter types, metadata, and tests.
3. **SQL Definitions V2**: define the eight static, parameterized statements.
   Atomic boundary: definitions and SQL-focused tests.
4. **Statement Catalog V2 alignment**: verify identifiers and metadata without
   changing business operations.
5. **Statement Adapter V4/V2 alignment**: project Contract inputs and injected
   generated intent into parameters.
6. **Statement Executor conformance**: connect immutable definitions through
   generic hooks without identity semantics.
7. **PostgreSQL Adapter and Transaction Runtime integration**: wire generator,
   database clock outputs, affected-row handling, and commit-unknown recovery.
8. **Integration tests**: validate concurrent insert, renew, terminal
   transitions, takeover, reconciliation, and transaction retry.

Each step is independently revertible until the next consumer is activated.
After integration activation, rollback restores the complete compatible V2
set.

## Rollback Boundary

This ADR alone changes no runtime or persisted data. It may be reverted before
the Persistence Generation Capability Contract is consumed. After SQL and
Adapter activation, partial rollback is prohibited; generation capability,
parameters, SQL, Catalog alignment, Adapter, and integration must roll back as
one compatible version set.

## Non-Goals

- selecting a UUID library, extension, or entropy implementation;
- defining SQL text, DDL, migration, or indexes;
- changing Replay Contracts, Runtime behavior, or Physical Schema;
- defining transaction retry policy beyond concurrency safety;
- implementing persistence generators;
- changing Workflow completion ownership or Result Reference semantics.

## Open Questions

The following do not block CS-08 authority or parameter semantics:

- production UUID and reservation/lease identity implementation choice behind
  the generation capability;
- operational lease-duration values within the bounded policy Contract;
- metrics and safe diagnostic naming;
- production rollout and migration scheduling.

No authority, generation owner, parameter provenance, clock owner, retry rule,
or transaction visibility required by CS-08 remains open.
