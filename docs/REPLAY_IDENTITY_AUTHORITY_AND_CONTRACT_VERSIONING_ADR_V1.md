# Replay Identity Authority and Contract Versioning ADR V1

> Status: Accepted
>
> Date: 2026-07-29
>
> Decision scope: Multi-cut Replay identity continuity and Contract versioning

## 1. Title

Replay Identity Authority and Contract Versioning.

## 2. Status

Accepted. This ADR satisfies the decision prerequisites for Replay Identity
Refactoring CS-01, CS-02, and CS-03.

## 3. Date

2026-07-29.

## 4. Context

Replay Contracts v3 divide responsibility among Resolution, Lifecycle, and
Recovery. Resolution receives Protected Scope and Resolved Identity. Successful
Resolution results retain Resolved Identity but do not retain the complete
Protected Scope. Lifecycle and Recovery consequently receive a narrower
identity set than Resolution.

The Logical Schema defines replay uniqueness as Protected Scope plus protected
key identity. Resolved Identity contains protected key identity and protected
request fingerprint identity. The Contracts do not guarantee that Resolved
Identity alone is globally unique across Protected Scopes.

The Replay Identity Contract Amendment Specification V1 records this gap. The
Refactoring Plan and Change Set Specification require an approved identity
authority and versioning decision before CS-01 begins.

## 5. Problem

Resolution can uniquely address a replay because it receives the complete
scope-qualified identity. Lifecycle and Recovery cannot prove that they address
the same replay from their declared inputs alone.

Persistence cannot infer missing scope without changing Contract meaning.
Making the current key or fingerprint globally unique would replace the
existing scope-isolated uniqueness model. An optional identity component would
not establish a guarantee.

The architecture therefore requires one authoritative identity set that:

- keeps existing scope isolation;
- is present at Resolution;
- remains present through Lifecycle and Recovery;
- supports authoritative persistence lookup without hidden context;
- does not turn concurrency evidence into replay identity.

## 6. Decision Drivers

The decision prioritizes:

1. preserving existing scope-qualified uniqueness;
2. avoiding a new business identity concept;
3. eliminating cross-scope ambiguity;
4. enabling persistence design without inference;
5. enabling Lifecycle and Recovery lookup from declared inputs;
6. retaining one identity generation owner;
7. preventing long-lived implicit mixed-version operation;
8. preserving dependency-ordered rollback;
9. retaining protected-value non-disclosure;
10. leaving Replay states, outcomes, and concurrency semantics unchanged.

## 7. Considered Options

### Option A: Preserve Protected Scope with Resolved Identity

The existing Protected Scope and existing Resolved Identity remain the
authoritative identity information and are preserved after Resolution through
Lifecycle and Recovery.

Assessment:

| Criterion | Assessment |
|---|---|
| Contract semantic impact | breaking identity-continuity amendment; existing uniqueness meaning retained |
| scope isolation | preserved exactly |
| backward compatibility | source and wire breaking for identity-bearing v3 consumers |
| Admission Runtime impact | existing identity producer must propagate the authoritative set |
| Lifecycle impact | declared lookup becomes scope-qualified |
| Recovery impact | authoritative lookup becomes scope-qualified |
| Logical Schema impact | lookup terminology must align with its existing uniqueness boundary |
| Physical Schema impact | direct mapping becomes possible without global-identity inference |
| migration complexity | bounded multi-component migration using existing information |
| mixed-version risk | high if implicit mixing is allowed; manageable with version pinning |
| cross-scope access risk | eliminated when the complete set is required |

### Option B: Introduce a Globally Unique Replay Identity

A new global replay identifier becomes the authoritative Lifecycle and Recovery
lookup key.

Assessment:

| Criterion | Assessment |
|---|---|
| Contract semantic impact | introduces a new authoritative identity concept |
| scope isolation | indirect and dependent on global identity issuance |
| backward compatibility | breaking for all identity producers and consumers |
| Admission Runtime impact | requires a new generation or allocation boundary |
| Lifecycle impact | changes lookup authority |
| Recovery impact | changes lookup authority |
| Logical Schema impact | replaces or supplements the existing uniqueness model |
| Physical Schema impact | requires new identity persistence and uniqueness |
| migration complexity | high; existing records require global identity assignment |
| mixed-version risk | high because old records lack the new authority |
| cross-scope access risk | depends on correctness of the new allocator and binding |

### Option C: Make Current Key or Fingerprint Globally Unique

The existing key identity or request fingerprint identity receives a global
uniqueness guarantee.

Assessment:

| Criterion | Assessment |
|---|---|
| Contract semantic impact | changes protected key or fingerprint meaning |
| scope isolation | weakened or made redundant |
| backward compatibility | semantically breaking despite similar shape |
| Admission Runtime impact | identity projection meaning changes |
| Lifecycle impact | lookup appears simpler but relies on stronger hidden semantics |
| Recovery impact | same hidden global guarantee is required |
| Logical Schema impact | contradicts scope-plus-key uniqueness |
| Physical Schema impact | requires repository-wide uniqueness |
| migration complexity | high; collisions across existing scopes must be resolved |
| mixed-version risk | critical because identical shapes carry different guarantees |
| cross-scope access risk | elevated during migration and on producer mismatch |

## 8. Decision

**Option A is adopted.**

The authoritative Replay identity set is:

- the complete versioned Protected Scope;
- the existing versioned Resolved Identity.

Within that set:

- Protected Scope plus protected key identity is the uniqueness boundary;
- request fingerprint identity is the semantic compatibility discriminator;
- Reservation Identity, Lease Identity, fencing token, and revision remain
  concurrency evidence;
- Result Reference remains a completed-result linkage.

No globally unique replay identity is introduced. No global uniqueness is
assigned to the current key or fingerprint.

## 9. Replay Identity Guarantee

The following guarantee is normative:

1. A Replay is uniquely selected within one complete Protected Scope by its
   protected key identity.
2. The protected request fingerprint identifies request meaning within that
   selected replay boundary.
3. The complete authoritative identity set is required at every Resolution,
   Lifecycle, and Recovery lookup or mutation boundary.
4. The identity set is immutable for the lifetime of the replay record.
5. Successful results that remain usable by a later Replay capability preserve
   the same authoritative identity set.
6. No component may reconstruct, infer, default, or recover a missing scope
   from persistence, process state, or unrelated metadata.

Cross-scope equality of key or fingerprint values does not indicate the same
Replay. Such values belong to independent replay boundaries and are never
compared as one authoritative record.

## 10. Identity Authority

The sole authority for replay selection is the complete authoritative identity
set defined in Section 8.

Resolution binds that set to the authoritative replay record. Lifecycle and
Recovery consume the already-established set. PostgreSQL enforces and resolves
the set but does not define its business meaning.

Persistence lookup may depend on:

- all components of the versioned Protected Scope;
- protected key identity;
- protected request fingerprint identity for semantic verification;
- concurrency evidence only for conditional mutations.

Persistence may not substitute Reservation Identity, Lease Identity, Result
Reference, database row identity, or implicit connection context for the
authoritative Replay identity set.

## 11. Identity Ownership

### Generation ownership

Admission Runtime is the single generation owner for request-scoped Replay
identity information. It receives trusted scope inputs, owns the existing
deterministic fingerprint projection, and constructs the identity information
sent to Resolution.

Resolution does not generate scope, key identity, or fingerprint identity.
It validates and binds the supplied authoritative set.

### Propagation ownership

Every Replay capability owns preservation of the authoritative identity set
across its successful outputs. Every caller owns forwarding that preserved set
unchanged to the next Replay capability.

Lifecycle and Recovery do not calculate scope. Adapters and persistence do not
repair incomplete identity.

## 12. Contract Versioning Decision

This amendment is **breaking**.

The version decisions are:

- Replay Resolution, Lifecycle, and Recovery Contracts advance from major
  version `3.0` to major version `4.0`.
- The shared authoritative identity representation advances from identity
  schema version `1.0` to major version `2.0`.
- Admission Contract identity-bearing success and dependency boundaries advance
  to major version `4.0`.
- State, Reservation Evidence, Result Reference, and metadata versions do not
  advance solely because of this identity amendment.
- Logical Schema requires terminology and mapping alignment after Contract
  acceptance; this is document schema alignment, not a new Replay state.

A mandatory identity component changes construction, serialization, and
consumer expectations. It is not classified as additive or non-breaking.

## 13. Compatibility Policy

### Source compatibility

V3 identity-bearing producers and consumers are not source-compatible with V4
identity-bearing boundaries. Compilation must expose incomplete migration.

### Runtime compatibility

V3 and V4 capabilities are not directly interchangeable. Composition must pin
one complete version set.

### Persisted-data compatibility

Existing replay records are compatible only when their complete Protected Scope
and existing Resolved Identity can be authoritatively mapped without inference.
Records lacking that evidence are not silently promoted.

### Wire and serialized-shape compatibility

V3 and V4 identity-bearing serialized shapes are not wire-compatible. Version
discriminants must be honored before interpretation.

### Optional compatibility period

A bounded compatibility period is permitted only through separately
version-pinned compositions. It is not an optional-field period and does not
permit a V3 caller to invoke a V4 capability directly.

The old identity shape is accepted only by the isolated V3 composition during
that bounded period. V4 boundaries reject it.

## 14. Mixed-version Policy

Implicit mixed-version operation is prohibited.

Permitted:

- an isolated V3 component graph serving V3 requests;
- an isolated V4 component graph serving V4 requests;
- explicit deployment routing between those complete graphs during a bounded
  migration window.

Prohibited:

- V3 Admission with V4 Resolution;
- V4 Resolution with V3 Lifecycle or Recovery;
- adapters filling missing V3 identity;
- persistence choosing a record from incomplete identity;
- optional compatibility fields;
- fallback from V4 to V3 after validation failure.

The migration window ends when all active producers, consumers, and persisted
records satisfy the V4 identity guarantee.

## 15. Migration Boundary

Migration follows the accepted change-set order:

1. CS-01 establishes the shared V2 identity authority.
2. CS-02 establishes V4 Resolution, Lifecycle, and Recovery Contracts.
3. CS-03 aligns Admission Runtime as the V4 producer.
4. Contract-only identity continuity is validated.
5. Logical and physical persistence work resumes in later change sets.
6. Adapter and integration activation occurs only after the complete V4 graph
   is validated.

V3 removal is permitted only after:

- no active V3 producer or consumer remains;
- no composition routes between V3 and V4 components;
- persisted replay records pass authoritative identity mapping validation;
- rollback no longer depends on the V3 graph;
- cross-scope and commit-unknown tests pass on V4.

## 16. Consequences

Positive consequences:

- existing scope isolation remains authoritative;
- Lifecycle and Recovery can select a Replay from declared inputs;
- cross-scope collision cannot select an unrelated record;
- Physical Schema can implement the existing uniqueness meaning directly;
- commit-unknown lookup uses the same identity as Resolution;
- no new business identity service or allocator is required.

Costs:

- identity-bearing Contracts require major-version migration;
- Admission Runtime and all Replay capability consumers require coordinated
  alignment;
- Logical Schema terminology requires alignment;
- V3 and V4 graphs must remain isolated during the bounded transition;
- persisted records require compatibility evidence before V4 activation.

## 17. Risks

1. A consumer may treat the new shape as optional and preserve the original
   ambiguity.
2. A mixed-version composition may compile through unsafe casts.
3. Persistence may incorrectly strengthen key identity to global uniqueness.
4. Scope values may be logged or exposed during propagation.
5. Existing records may lack authoritative evidence required for V4 mapping.
6. Rollback may become unsafe if only part of the version set is restored.
7. Statement or adapter work may begin before Contract-only continuity passes.

Mitigation is mandatory version discrimination, complete graph pinning,
protected-value audits, dependency-ordered rollout, and phase-level rollback.

## 18. Rejected Options

Option B is rejected because it adds a global identity concept, generation
owner, persistence requirement, and migration burden not required by existing
scope semantics.

Option C is rejected because it changes the meaning of current protected key or
fingerprint identities, contradicts scope-qualified uniqueness, and permits
identical serialized shapes to carry incompatible guarantees.

Optional scope propagation is rejected because optional information cannot
guarantee authoritative lookup.

Physical Schema supplementation and statement-side inference are rejected
because downstream storage cannot establish missing Contract authority.

## 19. Validation Requirements

ADR acceptance requires and records:

- exactly one adopted option: Option A;
- exactly one identity authority: complete Protected Scope plus existing
  Resolved Identity;
- exactly one generation owner: Admission Runtime;
- explicit propagation ownership at every Replay capability;
- explicit scope-qualified uniqueness;
- Lifecycle lookup sufficiency from declared V4 input;
- Recovery lookup sufficiency from declared V4 input;
- breaking major-version classification;
- explicit V3/V4 wire incompatibility;
- no implicit mixed-version composition;
- bounded, version-pinned compatibility only;
- no global identifier, optional identity, persistence inference, or statement
  inference;
- CS-01, CS-02, and CS-03 prerequisites resolved.

## 20. Follow-up Change Sets

### CS-01 Shared Types

Implements the authoritative identity set, identity schema major version, and
protected-value ownership decisions from Sections 8 through 12.

### CS-02 Replay Contracts

Implements the V4 identity continuity, Lifecycle lookup, Recovery lookup, and
mixed-version boundary decisions from Sections 9, 12, 13, and 14.

### CS-03 Admission Runtime

Implements the generation and propagation ownership decisions from Sections 11
through 15 for the V4 producer graph.

No later change set begins until these three change sets satisfy their ordered
validation gates.

## 21. Out of Scope

- exact TypeScript fields or functions
- source or test changes
- statement text, database definition, or migration scripts
- Physical Schema design
- adapter implementation
- Runtime implementation
- Workflow, Route, HTTP, Provider, or Integration behavior
- Replay state or business-policy changes
- global identity allocation
- implicit compatibility adapters
