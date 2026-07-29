# Replay Lease and Attempt Persistence Policy ADR V1

## Status

Accepted.

## Date

2026-07-29.

## Context

Replay Identity Authority, Replay Concurrency Authority, Shared Identity
Schema V2, Replay Contracts V4, Logical Schema V2, Physical Schema V2, and the
Replay Persistence Parameter Contract V2 are established.

The existing concurrency ADR assigns lease-duration policy to the Persistence
Lease Policy Capability and assigns reservation-attempt, authoritative time,
and lease-expiry generation to PostgreSQL. It intentionally does not select
the concrete duration representation, attempt origin, clock expression, expiry
expression, or stale boundary. Those omissions block CS-07.6 and CS-08 because
neither the Parameter Contract nor SQL Definitions may invent them.

This ADR completes only those persistence-policy decisions. It does not change
Replay identity, lifecycle states, public Runtime responsibilities, Physical
Schema V2, or Replay Contracts V4.

## Problem Statement

Initial reservation, renewal, and stale takeover require one deterministic
interpretation of attempt progression and lease time. Every statement must use
the same units, validation bounds, clock authority, expiry calculation, and
boundary comparison. Retries must not silently create a new ownership
generation or extend a lease.

## Decision Drivers

- one authority for every generated value;
- deterministic translation into PostgreSQL statements;
- transaction-stable time;
- stale-owner rejection;
- monotonic concurrency evidence;
- retry and commit-unknown safety;
- timezone and precision safety;
- bounded arithmetic;
- direct translation into Parameter Contract V2;
- compatibility with Physical Schema V2;
- no application-clock authority;
- minimal architecture change.

## Considered Options

### Initial reservation attempt

| Option | Meaning | Retry and schema impact | Decision |
|---|---|---|---|
| A. `0` | number of completed takeovers | Initial ownership is not represented as an acquisition | Rejected |
| B. `1` | ordinal processing-ownership acquisition | Initial reservation is the first acquisition; takeover advances monotonically | Accepted |
| C. opaque database sequence | no stable numeric meaning | Adds machinery without improving the existing integer evidence model | Rejected |

### Lease-duration representation

| Option | Precision and validation | PostgreSQL and TypeScript fit | Decision |
|---|---|---|---|
| A. integer milliseconds | exact bounded integer and no fractional ambiguity | safe TypeScript `number`; PostgreSQL `bigint` binding | Accepted |
| B. integer seconds | simple but loses sub-second policy precision | natural mapping but unnecessarily coarse | Rejected |
| C. PostgreSQL `interval` | database-native | leaks database representation into the policy boundary | Rejected |
| D. ISO 8601 duration string | transport-friendly | permits calendar units and parsing ambiguity | Rejected |
| E. structured duration object | explicit units | adds a shape not required by the single-unit policy | Rejected |

### Authoritative PostgreSQL clock

| Option | Stability | Decision |
|---|---|---|
| `CURRENT_TIMESTAMP` | transaction-stable alias | Rejected as the canonical spelling to avoid multiple accepted expressions |
| `transaction_timestamp()` | transaction-stable and explicit | Accepted |
| `statement_timestamp()` | stable only for a statement | Rejected |
| `clock_timestamp()` | changes during statement execution | Rejected |

### Stale boundary

| Option | Boundary behavior | Decision |
|---|---|---|
| `lease_expires_at < authoritative_now` | lease remains non-stale at its exact expiry instant | Rejected |
| `lease_expires_at <= authoritative_now` | lease becomes stale at its declared expiry instant | Accepted |

## Decision

1. Reservation attempt is a one-based ordinal count of successful processing
   ownership acquisitions for a Replay record.
2. Initial reservation attempt is PostgreSQL integer `1`.
3. Only a successful released re-reservation or stale takeover advances the
   attempt by exactly one.
4. Renew and terminal transitions do not advance the attempt.
5. Lease duration is a versioned, required integer-millisecond policy value.
6. Its TypeScript representation is a finite safe integer `number`.
7. Its PostgreSQL input binding type is `bigint`.
8. Valid duration is inclusive from `1` through `86,400,000` milliseconds.
9. PostgreSQL authoritative time is exactly `transaction_timestamp()`.
10. Initial, renewed, and takeover expiry are calculated from authoritative
    time plus the validated duration.
11. A processing lease is stale when its expiry is less than or equal to the
    authoritative time.
12. Renewal calculates a replacement expiry from authoritative time, not from
    the prior expiry.
13. An already stale lease cannot be renewed.
14. Takeover performs stale comparison and all ownership-evidence replacement
    in one conditional mutation.
15. Terminal timestamps retain their existing Lifecycle V4 input ownership;
    the database clock does not replace or synthesize them.

## Attempt Semantics

`reservation_attempt` means the ordinal ownership acquisition, not retry
count, revision, or fencing epoch.

- The insert expression is the PostgreSQL integer literal `1`.
- A successful ownership replacement uses
  `(reservation_attempt::bigint + 1)::integer`.
- The current value must be between `1` and `2,147,483,646` before an
  ownership replacement.
- The persisted value must be between `1` and `2,147,483,647`.
- Overflow rejects the mutation; wrapping and saturation are prohibited.
- Renew compares the retained attempt and leaves it unchanged.
- Complete, fail, and release may use the current attempt as a precondition,
  but generate no successor attempt.
- A failed or zero-row takeover does not advance the attempt.
- An automatic retry reuses the same expected attempt and takeover intent.
- After commit outcome becomes unknown, reconciliation is required before
  another attempt can be requested.

Revision, fencing token, and reservation attempt remain independent:

- revision counts successful record mutations;
- fence identifies a processing ownership epoch;
- attempt counts successful processing ownership acquisitions.

No value substitutes for another and no equality relationship between them is
required.

## Lease Duration Semantics

The canonical logical type is `lease-duration-milliseconds-v1`. Its value is a
base-10 integer count of milliseconds:

- TypeScript representation: finite safe integer `number`;
- SQL binding name: `lease_duration_milliseconds`;
- PostgreSQL binding type: `bigint`;
- minimum: `1`;
- maximum: `86,400,000`;
- zero: prohibited;
- negative values: prohibited;
- fractional values: prohibited;
- non-finite values: prohibited;
- values outside the TypeScript safe-integer range: prohibited before
  binding;
- serialization: canonical base-10 integer text or a driver-native integer
  binding with identical value;
- validation owner: Persistence Lease Policy Capability before Adapter
  projection, with PostgreSQL enforcing the same inclusive bounds;
- generation owner: Persistence Lease Policy Capability;
- retry behavior: reuse the same validated duration for the same logical
  statement attempt.

The duration is a policy input. It is not a timestamp, deadline, PostgreSQL
interval, or authority over current time.

## Lease Duration Persistence

Only `lease_expires_at` is persisted. The duration is not persisted in
Physical Schema V2.

Each initial reservation, renewal, released re-reservation, or takeover
receives an explicit validated duration. A retry before an unknown commit
outcome reuses that duration. A later operation may receive a different
current policy value. Such a policy change affects only the expiry generated
by a successful later mutation and does not rewrite existing records.

This decision requires no Physical Schema V2 change.

## Database Clock Semantics

The sole authoritative current-time expression is
`transaction_timestamp()`.

- Every statement in one transaction observes the same instant.
- A multi-statement transaction uses that same instant for all lease
  calculations and stale comparisons.
- Runtime or Adapter clocks cannot authorize renewal or takeover.
- `statement_timestamp()`, `clock_timestamp()`, and alternate aliases are
  prohibited in Replay lease SQL Definitions.
- The output and persisted timestamp type is `timestamp with time zone`.
- PostgreSQL session timezone affects presentation only, not the represented
  instant.
- Tests execute statements in a controlled transaction and assert that
  generated expiries share the transaction timestamp basis.

## Lease Expiry Semantics

The exact PostgreSQL expression for initial, renewed, re-reserved, and takeover
expiry is:

`transaction_timestamp() + ($lease_duration_milliseconds::bigint * INTERVAL '1 millisecond')`

The expression returns `timestamp with time zone`. The required binding is
`lease_duration_milliseconds` with PostgreSQL type `bigint`.

Bounds are checked before evaluating the expression. No implicit cast from
text, floating point, or PostgreSQL interval is allowed. The one-day maximum
prevents arithmetic overflow within this policy. SQL Definitions must copy
this expression and may not select another clock or conversion.

## Stale Comparison Semantics

The exact stale predicate is:

`lease_expires_at <= transaction_timestamp()`

The expiry instant itself is stale. A renewal is eligible only when:

- state is `processing`;
- `lease_expires_at` is non-null;
- `lease_expires_at > transaction_timestamp()`;
- complete authoritative Replay identity matches;
- expected revision, reservation identity, lease identity, fencing token, and
  reservation attempt match.

A takeover is eligible only when state is `processing`, expiry is non-null,
and the exact stale predicate plus all authoritative identity and concurrency
predicates match.

Null expiry is invalid processing evidence and cannot be renewed or taken over
through the normal predicates. A non-processing record is never lease-stale.
The conditional mutation supplies race safety under the transaction isolation
selected by the existing statement architecture; no prior read authorizes the
mutation.

## Renewal Semantics

Renewal uses:

`transaction_timestamp() + ($lease_duration_milliseconds::bigint * INTERVAL '1 millisecond')`

as the replacement expiry. It does not extend from current
`lease_expires_at`.

Successful renewal:

- requires a non-stale processing lease;
- compares complete Replay identity and current concurrency evidence;
- advances revision according to the Concurrency Authority ADR;
- preserves reservation identity;
- preserves lease identity;
- preserves fencing token;
- preserves reservation attempt;
- replaces only the expiry and revision among concurrency evidence;
- returns the authoritative resulting evidence.

Zero rows means the requested renewal was not applied. It is never treated as
success. Automatic retry retains the same expected evidence and duration.
Commit-unknown requires authoritative reconciliation before another mutation.

## Takeover Semantics

Takeover is one atomic conditional mutation. It:

- selects by complete authoritative Replay identity;
- requires `processing`;
- applies `lease_expires_at <= transaction_timestamp()`;
- compares expected revision, prior reservation identity, prior lease
  identity, prior fencing token, and prior reservation attempt;
- requires the next reservation and lease identities supplied before the
  statement;
- advances revision using its independent existing rule;
- advances fencing token using its independent existing rule;
- advances reservation attempt by exactly one;
- replaces reservation and lease identities;
- calculates expiry from the transaction clock and supplied duration;
- replaces the persisted ownership evidence together;
- returns complete authoritative state and concurrency evidence.

The requested reservation identity, lease identity, and duration remain stable
for one logical takeover attempt. A failed or zero-row takeover changes
nothing. After commit-unknown, another takeover is prohibited until
reconciliation establishes whether the requested intent was persisted.

## Terminal Timestamp Semantics

Complete, fail, and release timestamps remain values supplied by their
existing Lifecycle V4 metadata:

- complete uses `completedAt`;
- fail uses `failedAt`;
- release uses `releasedAt`.

Their SQL input binding is `terminal_at` with PostgreSQL type `timestamp with
time zone`. The exact persistence expression is
`$terminal_at::timestamptz`.

Runtime-provided terminal timestamps are allowed because Lifecycle V4 already
owns their semantics. They do not participate in lease validity, renewal, or
takeover and therefore do not create a second lease clock. PostgreSQL validates
the required binding and persists it atomically with the terminal transition.
The returning projection returns the persisted `terminal_at`.

A transition retry reuses the same terminal metadata. Commit-unknown requires
authoritative lookup; a new terminal timestamp must not be generated before
reconciliation. Changing terminal timestamps to database-generated values
would require Lifecycle Contract changes and is outside this ADR.

## Authority Matrix

| Value | Authority | Generation owner | Validation owner | Persistence owner | Mutability | Retry behavior | Transaction visibility |
|---|---|---|---|---|---|---|---|
| initial reservation attempt | persisted concurrency policy | PostgreSQL | PostgreSQL | PostgreSQL | successor on ownership replacement | observe after unknown commit | generated and returned by insert |
| takeover reservation attempt | persisted concurrency policy | PostgreSQL | PostgreSQL predicate and bounds | PostgreSQL | monotonic successor | retain expected value and reconcile | generated and returned by takeover |
| lease duration | persistence lease policy | Persistence Lease Policy Capability | policy capability and PostgreSQL bounds | not persisted | immutable per logical attempt | reuse | known before statement |
| authoritative current time | PostgreSQL transaction clock | PostgreSQL | PostgreSQL expression | not separately persisted | stable per transaction | re-observed only in a new transaction | visible within transaction |
| initial lease expiry | PostgreSQL lease clock | PostgreSQL | PostgreSQL bounds and expression | PostgreSQL | replaced by later ownership operation | never predict | generated and returned by insert |
| renewed lease expiry | PostgreSQL lease clock | PostgreSQL | PostgreSQL renewal predicate and expression | PostgreSQL | replaces prior expiry | reconcile before retry after unknown commit | generated and returned by renew |
| takeover lease expiry | PostgreSQL lease clock | PostgreSQL | PostgreSQL stale predicate and expression | PostgreSQL | replaces prior expiry | reconcile before retry after unknown commit | generated and returned by takeover |
| stale lease determination | PostgreSQL lease clock and persisted expiry | PostgreSQL conditional predicate | PostgreSQL | not persisted separately | evaluated per mutation | zero rows is not success | statement-local using transaction time |
| complete timestamp | Lifecycle completion metadata | Lifecycle input owner | Lifecycle validation and Adapter projection | PostgreSQL | immutable after terminal transition | reuse input and reconcile | known before statement, returned after mutation |
| fail timestamp | Lifecycle failure metadata | Lifecycle input owner | Lifecycle validation and Adapter projection | PostgreSQL | immutable after terminal transition | reuse input and reconcile | known before statement, returned after mutation |
| release timestamp | Lifecycle release metadata | Lifecycle input owner | Lifecycle validation and Adapter projection | PostgreSQL | immutable after terminal transition | reuse input and reconcile | known before statement, returned after mutation |

## Generation Expression Matrix

| Value | Exact PostgreSQL expression | Required bindings | Output type | Transaction stability | Retry behavior | Notes |
|---|---|---|---|---|---|---|
| initial attempt | `1::integer` | none | `integer` | statement result | observe after unknown commit | first ownership acquisition |
| takeover attempt | `(reservation_attempt::bigint + 1)::integer` | expected attempt in predicate | `integer` | atomic mutation | retain expectation; reconcile | bounds checked before cast |
| authoritative clock | `transaction_timestamp()` | none | `timestamp with time zone` | one value per transaction | new transaction re-observes time | sole lease clock spelling |
| initial expiry | `transaction_timestamp() + ($lease_duration_milliseconds::bigint * INTERVAL '1 millisecond')` | `lease_duration_milliseconds` | `timestamp with time zone` | transaction-stable basis | reuse duration until reconciliation | bounds required |
| renewal expiry | `transaction_timestamp() + ($lease_duration_milliseconds::bigint * INTERVAL '1 millisecond')` | `lease_duration_milliseconds` | `timestamp with time zone` | transaction-stable basis | reuse duration until reconciliation | not based on prior expiry |
| takeover expiry | `transaction_timestamp() + ($lease_duration_milliseconds::bigint * INTERVAL '1 millisecond')` | `lease_duration_milliseconds` | `timestamp with time zone` | transaction-stable basis | reuse duration until reconciliation | atomic with ownership replacement |
| stale comparison | `lease_expires_at <= transaction_timestamp()` | none | `boolean` predicate | transaction-stable basis | zero rows requires lookup or classification | null and non-processing are ineligible |
| terminal timestamp | `$terminal_at::timestamptz` | `terminal_at` | `timestamp with time zone` | stable caller input per logical transition | reuse input until reconciliation | not a lease-clock expression |

## Transaction Visibility Matrix

| Class | Values | Rule |
|---|---|---|
| known before statement | duration, expected attempt, expected concurrency evidence, terminal timestamp | immutable for one logical attempt |
| generated within statement | initial/successor attempt, authoritative time, lease expiry | unavailable before successful mutation |
| returned after mutation | persisted attempt, expiry, revision, fence, and relevant terminal timestamp | only returned persisted values are authoritative |
| stable within transaction | `transaction_timestamp()` and all expressions derived from it | every Replay lease statement in that transaction shares the instant |
| commit outcome unknown | no generated value is assumed | Recovery performs authoritative lookup before retry |

## Retry and Idempotency Rules

- A logical insert retry retains input identities and duration; attempt `1` is
  generated only by the successful insert.
- Renewal retry retains expected evidence and duration and never chains from a
  locally predicted expiry.
- Takeover retry retains expected evidence, requested identities, and duration.
- Attempt, revision, fence, and expiry are never incremented or regenerated by
  Runtime.
- Zero-row mutations do not constitute successful ownership acquisition.
- Automatic retry is permitted only while commit outcome is known not to have
  succeeded.
- Commit-unknown always transitions to authoritative reconciliation.
- Reconciliation reads generate no attempt, expiry, or timestamp.
- Terminal retries retain the original Lifecycle metadata and Result Reference.
- No statement may mix duration versions or units.

## Database Responsibilities

PostgreSQL:

- generates and bounds-checks reservation attempt;
- evaluates the canonical transaction clock expression;
- validates the bound duration as integer milliseconds within the inclusive
  policy range;
- calculates and persists authoritative lease expiry;
- evaluates stale and renewable lease predicates;
- atomically applies takeover evidence replacement;
- returns persisted evidence;
- rejects implicit duration casts and overflow;
- does not generate Replay identity, reservation identity, lease identity,
  Result Reference, or terminal metadata.

## Runtime Responsibilities

Runtime:

- does not observe a clock for lease authorization;
- does not calculate lease expiry;
- does not increment reservation attempt, revision, or fence;
- does not decide stale status;
- forwards authoritative evidence without reconstruction;
- supplies existing Lifecycle terminal metadata without changing its
  timestamp;
- treats zero-row and commit-unknown outcomes according to existing result and
  recovery contracts.

The Persistence Lease Policy Capability supplies the validated duration. The
Adapter binds it without unit conversion. SQL Definitions apply only the exact
expressions selected here.

## Consequences

### Positive

- CS-07.6 can represent one duration unit and complete attempt metadata.
- CS-08 can copy exact expressions without choosing policy.
- Lease calculations use one clock and one unit.
- Expiry-boundary behavior is deterministic.
- Attempts remain distinct from revisions and fences.
- Existing Physical Schema V2 columns are sufficient.

### Negative

- The one-day maximum is a V1 policy constraint.
- Sub-millisecond lease precision is unavailable.
- Long-running transactions retain their initial transaction timestamp.
- Terminal timestamps remain lifecycle-owned rather than database-generated.

## Compatibility

- Replay Identity Authority remains unchanged.
- Replay Concurrency Authority remains the source of generation ownership.
- Parameter Contract V2 can encode these decisions without changing Replay
  Contracts V4.
- Physical Schema V2 already stores attempt as `integer` and expiry and
  terminal time as `timestamp with time zone`.
- Logical Schema V2 states and evidence remain unchanged.
- Lifecycle V4 and Recovery V4 remain unchanged.
- No V1/V2 implicit duration-policy mixing is allowed.
- No existing record requires a stored duration.

## Security and Correctness Considerations

- Complete Replay identity remains mandatory in every authoritative mutation.
- CAS, fencing, ownership, attempt, state, and lease predicates are cumulative.
- The stale boundary cannot be selected by an Adapter or Runtime.
- Application clock skew cannot create or prolong lease ownership.
- Integer bounds prevent wraparound and interval amplification.
- Parameterized duration and terminal timestamp bindings prevent SQL text
  construction from untrusted values.
- A prior owner cannot renew after expiry or mutate after takeover.

## Validation Requirements

CS-07.6 and later change sets must verify:

- initial attempt is exactly `1`;
- attempt advances exactly once only on successful ownership replacement;
- renew and terminal transitions do not advance attempt;
- duration unit, TypeScript type, PostgreSQL type, and binding name are unique;
- duration rejects zero, negative, fractional, non-finite, and out-of-range
  values;
- every lease expression uses `transaction_timestamp()`;
- every lease expression uses the millisecond interval conversion shown here;
- stale uses `<=` and renewal eligibility uses `>`;
- renewal is based on authoritative now;
- takeover changes all ownership-generation evidence atomically;
- terminal timestamps remain Lifecycle inputs and are returned from persistence;
- retry and commit-unknown rules do not duplicate attempts;
- no Physical Schema V2 or Replay Contract change is introduced.

## Implementation Sequence

1. CS-07.6 completes Parameter Contract V2 metadata and validation rules.
   Atomic boundary: parameter definitions remain buildable without SQL.
2. CS-08 adds SQL Definitions V2 using the exact expressions in this ADR.
   Atomic boundary: definitions are independently boundary-tested.
3. Statement Catalog V2 aligns statement metadata with the definitions.
   Atomic boundary: all eight statement identities remain complete.
4. Statement Adapters align typed bindings and returned projections.
   Atomic boundary: no SQL policy enters Adapter code.
5. Statement Executor integrates definitions without interpreting parameters.
6. PostgreSQL Adapter integrates the existing Client boundary.
7. Transaction Runtime composes transaction and commit-unknown behavior.
8. Integration tests validate concurrency, retry, renewal, takeover, terminal
   transitions, and recovery.

## Rollback Boundary

This ADR can be rolled back before CS-07.6 by reverting this document alone.
After CS-07.6, rollback must revert the Parameter Contract completion in the
same release boundary. After CS-08, SQL Definitions and dependent statement
alignment must also roll back together. Persisted Physical Schema V2 rows need
no migration rollback because this ADR adds no column or state.

## Non-Goals

- changing Replay identity or fingerprint generation;
- changing revision or fencing rules;
- adding lifecycle states;
- defining SQL files, DDL, or migrations;
- implementing the lease policy capability;
- implementing Runtime, Adapter, Executor, Client, or transaction behavior;
- changing terminal metadata contracts;
- selecting deployment-specific lease duration within the allowed range;
- changing transaction isolation architecture.

## Open Questions

No open question may change CS-07.6 or CS-08 semantics.

Deployment may select an operational duration value within the fixed inclusive
range through the versioned Persistence Lease Policy Capability. That
configuration choice does not alter the canonical unit, representation,
validation, SQL binding, expiry expression, stale boundary, or retry rules
decided here.
