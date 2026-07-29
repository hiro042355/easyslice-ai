# Replay Identity Contract Amendment Specification V1

## 1. Background

Replay Contracts v3 divide replay ownership across Resolution, Lifecycle, and
Recovery. Resolution receives both Protected Scope and Replay Identity.
Lifecycle and Recovery receive Replay Identity and, for mutations, Reservation
Evidence.

The PostgreSQL Logical Schema identifies the authoritative uniqueness boundary
as complete Protected Scope plus `keyIdentity`. This specification records
whether that identity remains available throughout the Contract flow. It
defines the scope of a required Contract review only. It does not prescribe a
correction.

## 2. Current Identity Flow

### Admission to Resolution

Admission holds:

- `MultiCutReplayProtectedScope`
- `MultiCutReplayResolvedIdentity`

Protected Scope contains:

- `scopeVersion`
- `replayNamespace`
- protected tenant identity and its version
- `operationIdentity`

Replay Identity contains:

- `identityVersion`
- `keyIdentity`
- `requestFingerprintIdentity`

Resolution therefore receives the complete logical lookup boundary and the
fingerprint needed for semantic classification.

### Resolution output

A successful new result returns Replay Identity and Reservation Evidence. A
successful replay result returns Replay Identity and Result Reference.
Protected Scope is not present in either success result.

Reservation Evidence contains reservation identity, expected revision, fencing
token, lease identity, lease expiry, and reservation attempt. It contains no
replay namespace, tenant identity, or operation identity.

### Lifecycle

Every Lifecycle transition receives:

- Replay Identity
- Reservation Evidence
- transition-specific metadata or Result Reference where applicable

Lifecycle receives no Protected Scope. Its results continue to return Replay
Identity, and successful renew also returns Reservation Evidence.

### Recovery

Authoritative lookup receives Replay Identity and a recovery reason. Takeover
receives Replay Identity and Reservation Evidence. Reservation-mutation
reconciliation receives Replay Identity and previous Reservation Evidence.

Recovery receives no Protected Scope. Authoritative records return Replay
Identity but do not restore the missing scope.

## 3. Resolution Inputs

`MultiCutReplayResolutionInput` contains:

- Contract version
- complete Protected Scope
- Replay Identity

This is sufficient to address the logical uniqueness boundary stated by the
Logical Schema: Protected Scope plus `keyIdentity`. The fingerprint component
of Replay Identity is sufficient to distinguish a compatible replay from a
semantic conflict once that boundary has been addressed.

## 4. Resolution Outputs

Resolution success preserves:

- Replay Identity
- Reservation Evidence for `new`
- Result Reference for `replay`

Resolution success does not preserve:

- replay namespace
- protected tenant identity
- operation identity
- complete Protected Scope

The information loss occurs at the Resolution output boundary, before
Lifecycle or Recovery invocation.

## 5. Lifecycle Inputs

Lifecycle uses Replay Identity as its replay lookup identity. Reservation
Evidence protects mutation concurrency but identifies the current reservation
generation rather than the logical replay uniqueness boundary.

Neither Replay Identity nor Reservation Evidence contains the Protected Scope
used by Resolution. Consequently, Lifecycle inputs do not retain the same
identity set that Resolution used to select the authoritative replay.

## 6. Recovery Inputs

Recovery lookup uses Replay Identity alone. Recovery takeover and reservation
mutation reconciliation add Reservation Evidence, but that evidence still does
not contain Protected Scope.

Recovery therefore has the same loss of logical replay addressing information
as Lifecycle. This also affects authoritative observation after an unknown
commit outcome.

## 7. Replay Lookup Requirements

The repository currently states two related requirements:

1. Logical uniqueness is complete Protected Scope plus `keyIdentity`.
2. Lifecycle and Recovery lookup uses Replay Identity, consisting of
   `identityVersion`, `keyIdentity`, and `requestFingerprintIdentity`.

These requirements are equivalent only if Replay Identity is independently
guaranteed to be unique across every Protected Scope. No such guarantee exists
in the reviewed Contracts.

`requestFingerprintIdentity` classifies request meaning. It does not establish
tenant, namespace, or operation isolation. Reservation and lease identities
identify concurrency ownership and likewise do not reconstruct the logical
replay boundary.

## 8. Identity Preservation Analysis

| Boundary | Protected Scope | Replay Identity | Reservation Evidence | Result Reference |
|---|---:|---:|---:|---:|
| Resolution input | retained | retained | not yet available | not required |
| Resolution `new` output | lost | retained | retained | not available |
| Resolution `replay` output | lost | retained | not returned | retained |
| Lifecycle input | absent | retained | retained | transition-dependent |
| Lifecycle result | absent | retained on success | renew only | complete only |
| Recovery lookup input | absent | retained | absent | absent |
| Recovery takeover input | absent | retained | retained | absent |
| Recovery authoritative result | absent | retained | not normally returned | completed only |

Replay Identity is preserved. The broader identity set used to establish
Resolution uniqueness is not preserved.

## 9. Observed Gap

The Contracts do not guarantee that Lifecycle and Recovery can identify one
authoritative replay when identical Replay Identity values exist in different
Protected Scopes.

The gap is not a loss of fingerprint, reservation, lease, fence, or revision
evidence. It is the loss of the identity information that distinguishes
namespace, protected tenant, and operation boundaries after Resolution.

This specification does not determine how that information should be
represented or transported. It records only that the identity guarantee is
present at Resolution input and absent at the later Contract boundaries.

## 10. Why Physical Schema Cannot Solve It

A physical schema can enforce either a scope-qualified uniqueness boundary or
a repository-wide Replay Identity uniqueness boundary. Choosing the latter
would impose a stronger meaning than the current Logical Schema, while choosing
the former leaves later Contract inputs unable to address one row without
information outside their declared shape.

Hidden lookup state, implicit caller context, or database-specific inference
would make the persistence layer supply meaning that the public Contracts do
not carry. Physical naming, indexing, constraints, and storage types cannot
repair that Contract-level loss.

## 11. Why SQL Cannot Solve It

A statement can compare only information available through its declared input
or information selected through an independently unique key. The reviewed
Lifecycle and Recovery inputs provide neither the complete logical uniqueness
boundary nor a Contract guarantee that their remaining replay identity is
globally unique.

Selecting an arbitrary matching record, assuming uniqueness, or recovering
scope from unrelated state would introduce behavior outside the Contract.
Statement text therefore cannot resolve the ambiguity without changing the
meaning of an existing boundary.

## 12. Minimal Contract Amendment Goals

Any later Contract amendment must be judged against these goals:

1. Resolution, Lifecycle, and Recovery address the same authoritative replay.
2. The identity guarantee survives every successful handoff.
3. Protected namespace, tenant, and operation isolation are not weakened.
4. Replay semantic classification remains distinct from replay addressing.
5. Reservation, lease, fence, and revision evidence remain concurrency
   evidence rather than substitutes for replay identity.
6. Authoritative lookup after commit uncertainty remains unambiguous.
7. The guarantee is explicit in Contract semantics and does not depend on
   hidden persistence context.

These are acceptance goals, not a proposed field, type, wrapper, or API design.

## 13. Non-goals

This specification does not:

- select a Contract amendment shape;
- propose fields or types;
- redefine Protected Scope or Replay Identity;
- change Resolution, Lifecycle, or Recovery behavior;
- change failure classifications;
- define physical tables, columns, indexes, or constraints;
- define statement text or parameter order;
- define migration, adapter, runtime, or Workflow behavior;
- change Reservation Evidence or Result Reference ownership.

## 14. Compatibility Constraints

A future amendment review must preserve:

- current Resolution semantic-conflict behavior;
- the Protected Scope isolation established before Resolution;
- current replay states and terminal preservation;
- Reservation Evidence concurrency semantics;
- Result Reference ownership and Workflow completion ordering;
- commit-unknown authoritative recovery;
- absence of raw tenant, key, and fingerprint disclosure;
- existing v3 meaning for consumers that do not cross the ambiguous lookup
  boundary.

Compatibility cannot be claimed solely from structural assignability. The
cross-stage identity guarantee must remain semantically equivalent.

## 15. Migration Expectations

Migration planning begins only after the Contract owner has resolved the open
Contract questions in Section 16.

The migration review must then identify:

- affected Contract versions;
- producers and consumers at each handoff;
- persisted records whose identity guarantee predates the amendment;
- compatibility behavior during mixed-version operation;
- the point at which Logical Schema review becomes valid;
- the point at which Physical Schema and statement design may resume.

This section defines review sequencing only. It does not prescribe a migration
mechanism or implementation.

## 16. Open Questions

### Contract decisions

- What exact identity guarantee must hold across Resolution, Lifecycle, and
  Recovery?
- Is Replay Identity guaranteed unique independently of Protected Scope?
- Which successful handoffs are required to preserve the complete logical
  replay addressing information?
- How is mixed-version compatibility classified when that guarantee differs?

These questions block a determination that Contracts v3 provide unambiguous
Lifecycle and Recovery lookup.

### Logical Schema decisions

- After the Contract guarantee is settled, does the stated uniqueness boundary
  remain internally consistent with every Lifecycle and Recovery access path?
- Does the logical replay lookup description identify the same key at all
  stages?

Logical Schema review cannot answer the preceding Contract questions.

### Physical Schema decisions

- Which physical uniqueness constraint realizes the settled Contract
  guarantee?
- Which physical lookup key serves each of the eight Catalog statements?
- Can all required access paths be indexed without introducing stronger
  identity semantics?

These are intentionally deferred until Contract and Logical Schema consistency
is established.

### SQL definition decisions

- Which declared parameters carry the settled lookup identity?
- Which comparisons are required for an unambiguous target row?
- Which returned identity values demonstrate that the addressed row is the
  intended replay?

Statement design cannot decide these questions before the upstream identity
guarantee is explicit.

## 17. Amendment-scope conclusion

Contract amendment review is required because the complete identity set used
by Resolution is not preserved at the Lifecycle and Recovery input boundaries.
The deficiency is observable without selecting a correction. Physical Schema
and statement definition work remain blocked until the Contract-level identity
guarantee is unambiguous.
