# Replay Identity Architecture Refactoring Plan V1

## 1. Background

Replay Contracts v3 use Resolution, Lifecycle, and Recovery to manage one
authoritative replay over time. Resolution receives both Protected Scope and
Replay Identity, while later stages receive Replay Identity and,
operation-dependently, Reservation Evidence.

The Replay Identity Contract Amendment Specification V1 establishes that the
complete identity set used by Resolution is not preserved at later Contract
boundaries. This plan defines the responsible components, dependency order,
validation gates, and migration sequence needed to remove that inconsistency.
It intentionally does not select or describe a Contract shape, field, type, or
runtime algorithm.

## 2. Current Identity Ownership

| Information | Current owner | Current role |
|---|---|---|
| Protected Scope | Admission and Resolution input boundary | namespace, protected tenant, and operation isolation |
| Replay Identity | Admission projection and Replay Contracts | key identity and semantic fingerprint identity |
| Reservation Evidence | Resolution, Lifecycle, and Recovery mutation boundaries | concurrency ownership and CAS evidence |
| Result Reference | Workflow completion owner and completed replay projection | protected final-result linkage |

Admission currently owns projection of the Replay Identity supplied to
Resolution. Resolution owns authoritative reservation or replay
classification. Lifecycle owns transitions of processing ownership. Recovery
owns authoritative observation and stale-ownership recovery.

No later component is the declared owner of reconstructing information lost at
an earlier boundary.

## 3. Current Identity Flow

The current dependency flow is:

Admission input
→ Admission Runtime identity projection
→ Resolution input
→ Resolution result
→ Lifecycle input
→ Lifecycle result
→ Recovery input and authoritative result

At Resolution input, Protected Scope and Replay Identity coexist. Resolution
success retains Replay Identity but not the full scope information. Lifecycle
and Recovery therefore operate with a narrower identity set than Resolution.

Reservation Identity and Lease Identity remain concurrency-generation
identifiers. Result Reference remains a completion linkage. None of them owns
the missing replay-addressing semantics.

## 4. Component Dependency Graph

The architectural dependency direction relevant to this refactoring is:

Shared identity contracts
→ Replay Resolution, Lifecycle, and Recovery contracts
→ Admission Runtime producer boundary
→ Lifecycle and Recovery consumers
→ Logical Schema
→ Physical Schema specification
→ statement definitions
→ statement execution and adapter integration

Statement Catalog identifiers describe operations and do not define identity
shape. Transaction Runtime, Client Abstraction, and Statement Executor define
execution boundaries and do not own replay identity meaning.

The refactoring must follow the dependency direction. A downstream persistence
decision must not be used to establish an upstream Contract guarantee.

## 5. Root Cause

The logical uniqueness requirement and the preserved Contract identity are not
equivalent:

- Resolution uses complete Protected Scope plus key identity.
- Resolution success returns a narrower identity set.
- Lifecycle and Recovery accept that narrower identity set.
- The Contracts do not guarantee that the narrower identity is independently
  unique across every Protected Scope.

The root cause is an identity continuity break at the Resolution success
handoff. It is not a transaction, SQL, index, retry, state-machine, or
Reservation Evidence defect.

## 6. Required Change Sequence

The refactoring is divided into responsibility-scoped stages. Each stage must
finish its validation gate before the next begins.

### Stage 1: Contract identity authority

Responsible components:

- Shared Types
- Resolution Contract
- Lifecycle Contract
- Recovery Contract

Responsibility:

- establish one explicit, transport-neutral identity guarantee;
- preserve that guarantee across all Replay capability boundaries;
- retain the distinction between replay addressing, semantic fingerprinting,
  concurrency evidence, and Result Reference linkage.

No runtime or persistence work begins during this stage.

### Stage 2: Identity producer alignment

Responsible component:

- Admission Runtime

Responsibility:

- produce and forward values conforming to the accepted Contract guarantee;
- preserve deterministic, request-scoped identity projection;
- avoid taking ownership of persistence or replay classification.

This stage follows Contract acceptance and does not precede it.

### Stage 3: Identity consumer alignment

Responsible components:

- Resolution consumers
- Lifecycle consumers
- Recovery consumers
- identity-focused fixtures and Contract tests

Responsibility:

- consume the accepted identity guarantee without inference;
- preserve the same identity through transition and recovery results;
- demonstrate continuity and copy isolation at every handoff.

### Stage 4: Logical persistence alignment

Responsible component:

- Replay PostgreSQL Logical Schema

Responsibility:

- express one consistent uniqueness and lookup model for Resolution,
  Lifecycle, and Recovery;
- align every logical access path with the accepted Contract guarantee;
- preserve existing state, concurrency, completion, and recovery semantics.

### Stage 5: Physical persistence design

Responsible component:

- PostgreSQL Physical Schema specification

Responsibility:

- select physical identity representation, constraints, and indexes after the
  logical model is consistent;
- map every Replay operation without hidden identity inference.

### Stage 6: Statement definition alignment

Responsible component:

- PostgreSQL SQL Definitions

Responsibility:

- represent the accepted physical lookup boundary for all eight Catalog
  statements;
- preserve Catalog transaction, access, and mutation metadata.

### Stage 7: Adapter and integration alignment

Responsible components:

- statement adapters
- Replay PostgreSQL adapter
- composition and integration boundaries

Responsibility:

- carry the accepted identity through existing execution boundaries;
- map Contract identity to physical parameters and results;
- preserve failure, commit-unknown, and transaction ownership.

Execution infrastructure is changed only if compatibility validation
demonstrates a direct identity-bearing dependency.

## 7. Component Impact Matrix

| Component | Change status | Reason |
|---|---|---|
| Admission Runtime | required | current identity producer and Resolution request projector |
| Replay Contracts | required | continuity guarantee is absent from Resolution success, Lifecycle, and Recovery boundaries |
| Shared Types | review required; change expected | shared identity terminology and ownership originate here |
| Logical Schema | required after Contract acceptance | current uniqueness and later lookup descriptions are not demonstrably equivalent |
| Physical Schema | required as a new downstream specification | cannot be completed until Contract and logical identity agree |
| SQL Definitions | required after Physical Schema | statement parameters and lookup predicates depend on the settled physical identity |
| Statement Executor | no identity refactoring expected | generic execution and hook boundary does not own parameter meaning |
| Adapter | required after statement definitions | maps identity-bearing Contract requests and authoritative results |
| Integration | required last | wires the aligned producer, capabilities, and persistence consumer |
| Statement Catalog | no change expected | eight operation identifiers and metadata do not encode identity fields |
| Client Abstraction | no change expected | connection and prepared-statement transport boundary only |
| Transaction Runtime | no change expected | retains transaction context and transparent results only |

“No change expected” remains subject to reverse-dependency diagnostics. It does
not authorize unrelated cleanup.

## 8. Compatibility Constraints

The refactoring must preserve:

1. the four Replay states;
2. Resolution outcome meanings;
3. Lifecycle transition meanings and terminal preservation;
4. Recovery lookup, takeover, and reconciliation meanings;
5. Reservation Evidence concurrency ownership;
6. Result Reference ownership and Workflow completion ordering;
7. commit-unknown containment;
8. protected identity non-disclosure;
9. deterministic Admission projection;
10. Statement Catalog identifiers and metadata;
11. execution-driver, client, executor, and transaction-runtime boundaries.

Compatibility must be evaluated semantically and structurally. A shape that
still compiles but permits ambiguous cross-scope lookup does not satisfy the
plan.

Mixed-version operation must not silently treat incomplete identity as
complete. Compatibility classification belongs to the Contract migration
stage, not to adapters or persistence.

## 9. Migration Order

The required order is:

1. approve the Contract identity guarantee;
2. align Shared Types;
3. align Resolution Contract;
4. align Lifecycle Contract;
5. align Recovery Contract;
6. validate Contract-only compatibility;
7. align Admission Runtime;
8. align identity producers, fixtures, and consumers;
9. validate end-to-end identity continuity without persistence;
10. align Logical Schema;
11. approve Physical Schema specification;
12. define the eight physical statements;
13. align adapters;
14. align composition and integration;
15. run complete regression and migration-readiness validation.

This list defines sequence only. It does not define the content of any
amendment or implementation.

## 10. Rollback Strategy

Rollback is stage-gated:

- Before Contract acceptance, discard the proposed Contract revision as one
  unit.
- After Contract acceptance but before producer alignment, do not expose the
  new version to runtime consumers.
- During producer and consumer alignment, retain a single explicitly selected
  Contract version per composition.
- Before persistence alignment, keep physical and statement work disabled.
- After persistence alignment begins, rollback must restore Contract,
  Logical Schema, physical specification, statements, adapters, and
  composition to one mutually compatible version set.

Partial rollback across identity-bearing stages is prohibited. Existing replay
records require an explicit compatibility assessment before any mixed-version
deployment. This plan does not define a data migration mechanism.

## 11. Validation Order

Validation follows the same dependency direction:

1. Shared Types boundary and terminology;
2. Resolution Contract identity completeness;
3. Lifecycle Contract continuity;
4. Recovery Contract continuity;
5. Contract version and compatibility diagnostics;
6. Admission Runtime deterministic production;
7. Resolution-to-Lifecycle continuity;
8. Resolution-to-Recovery continuity;
9. cross-scope ambiguity tests;
10. Logical Schema consistency;
11. Physical Schema completeness;
12. eight-statement parameter and result coverage;
13. adapter mapping and commit-unknown recovery;
14. integration and consumer diagnostics;
15. dependency graph and circular-dependency review;
16. protected-value and disclosure audit;
17. scoped TypeScript, Markdown, and diff checks.

No downstream validation may substitute for a failed upstream identity gate.

## 12. Risks

### Semantic compatibility risk

Existing consumers may treat Replay Identity as complete even though the
Contract does not establish that guarantee. Structural compatibility can hide
continued ambiguity.

### Mixed-version risk

Producer and consumer versions can disagree about whether an identity is
complete. Silent fallback would make authoritative recovery unsafe.

### Persistence divergence risk

Physical design started before Contract alignment can encode a stronger or
weaker uniqueness rule than the accepted architecture.

### Recovery risk

Commit-unknown lookup can observe the wrong scope if identity continuity is not
proven before adapter work.

### Scope leakage risk

Identity alignment must preserve protected representation and must not expose
raw tenant, key, or fingerprint values.

### Refactoring expansion risk

Execution infrastructure may be changed unnecessarily even though it owns only
generic boundaries. The impact matrix and reverse-dependency checks constrain
that expansion.

## 13. Out of Scope

This plan does not:

- choose a new Contract shape;
- describe fields, wrappers, or type definitions;
- provide runtime pseudocode or implementation steps;
- define SQL, DDL, migrations, or database types;
- change Replay states, outcomes, or business policy;
- define retry or reconciliation algorithms;
- alter Workflow, Route, HTTP, Provider, or result persistence behavior;
- authorize changes to unrelated tracked or untracked files;
- replace the Replay Identity Contract Amendment Specification V1.

## 14. Plan readiness

The root cause, responsible components, dependency order, compatibility
constraints, validation gates, rollback boundary, and excluded components are
defined without prescribing a correction. Contract authority must resolve the
identity guarantee before implementation work resumes.
