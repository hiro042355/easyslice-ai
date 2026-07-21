# Workflow / Operation Pipeline Foundation V1

## 1. Status

This document is the Architecture Decision Contract for the Workflow and Operation Pipeline foundations. Its decisions are fixed for Foundation V1.

This contract defines architecture and commit boundaries only. It does not authorize Production composition, Provider connectivity, HTTP integration, UI integration, or PostgreSQL connection wiring.

## 2. Purpose

The repository already contains independent Asset, Provider Request, Provider Adapter, Provider Client, Materializer, PostgreSQL Reconciliation, and AI MV Director foundations. Workflow must orchestrate those capabilities without absorbing their implementations or reversing their dependency direction.

This contract separates five concerns that were previously mixed:

1. Workflow orchestration.
2. Operation Pipeline execution.
3. Executable binding.
4. Descriptor discovery.
5. Server composition and durable integration.

## 3. Current Gap

The current uncommitted Reference Workflow directly imports concrete Materializers, creates a Reference Provider Client, invokes Upload Gate and Output Ingestion implementations, performs stage progression, and projects the final result.

The current uncommitted Operation Pipeline Registry creates executable Vocal, Music, and MV pipelines and also returns descriptors. This mixes executable binding with descriptor discovery.

The repository has detailed Resume Pipeline, Async Workflow Integration, and Workflow Entry Point contracts, but it does not yet have a single upper-level decision defining which layer owns orchestration, binding, retries, persistence, and reconciliation.

## 4. Decision Summary

Foundation V1 adopts the following layers:

```text
Foundation Contracts and Descriptor Registries
                    ↓
       Operation Binding Contract
                    ↓
       Operation Pipeline Runtime
                    ↓
        Workflow Orchestrator
                    ↓
 Server Composition / Durable Integration
                    ↓
          HTTP / UI Entry Points
```

Descriptor Registries remain metadata-only. Executable dependencies are held by a separate, explicitly injected Executable Binding Registry. Workflow resolves a saved binding identity and invokes one Operation Pipeline capability. It does not construct or select concrete Provider or Materializer implementations.

## 5. Terminology

### 5.1 Workflow

The lifecycle orchestrator for one generation operation. It advances stages, applies bounded policy, coordinates child capabilities, and projects a Workflow result.

### 5.2 Operation Pipeline

A single-attempt executable pipeline for one fixed operation binding. It restores the restricted Adapter Request, projects ready Assets, invokes a Materializer, bridges to a Provider Client request, normalizes the response, and invokes Output Ingestion.

### 5.3 Descriptor Registry

A safe, immutable, lookup-only catalog of metadata. It contains no executable instance, factory, credential, endpoint, or runtime dispatch.

### 5.4 Executable Binding Registry

A server-side injected mapping from an exact saved binding identity to a fixed Operation Pipeline capability. It is not a public descriptor catalog and is not a Provider-selection mechanism.

### 5.5 Composition Root

The server-only owner that supplies executable bindings and durable capabilities. Composition is outside the Workflow and Operation Pipeline foundations.

## 6. Workflow Ownership

Workflow owns:

- Workflow input-envelope validation.
- Operation lifecycle orchestration.
- Stage ordering and stage progression.
- Cancellation checks between stages.
- Saved binding identity usage.
- Attempt number and bounded retry budget.
- Retry, stop, wait, and reconciliation routing decisions.
- Workflow-level idempotency namespace coordination.
- Child-result aggregation.
- Workflow audit aggregation.
- Projection to completed, degraded, partial, accepted, failed, cancelled, or reconciliation-required outcomes permitted by the versioned Workflow Contract.

Workflow does not own child implementation details.

## 7. Operation Pipeline Ownership

An Operation Pipeline owns one execution attempt for one exact binding. It owns:

- Restricted Adapter Request restoration through an injected resolver capability.
- Ready Asset projection into the Materializer input contract.
- Invocation of the bound Materializer capability.
- Operation-specific transport bridging.
- One Provider Client submit attempt.
- Safe Provider response bridging.
- Invocation of the bound response normalizer.
- Expected Output projection.
- Invocation of the bound Output Ingestion capability.
- Pipeline-local safe audit and result projection.
- Pipeline-local semantic fingerprint inputs required by the binding contract.

It does not own loops, backoff, polling, scheduler decisions, Workflow lifecycle, Final Result persistence, or reconciliation observation policy.

## 8. Binding Ownership

The Operation Binding Contract owns compatibility among:

- operation;
- Adapter identity and version;
- Materializer identity and version;
- Provider Client identity and version;
- Provider identity and API version;
- normalizer identity and version;
- Output Ingestion identity and version;
- binding identity and binding version.

Bindings are fixed and versioned. Lookup uses the exact saved operation and binding ID. The following are forbidden:

- latest-version selection;
- caller-selected implementation IDs;
- implicit Provider selection;
- fallback to another binding;
- automatic migration of a saved binding;
- reconstruction of missing binding metadata from current registries.

## 9. Descriptor and Executable Registry Separation

Descriptor Registry and Executable Binding Registry are different capabilities.

### 9.1 Descriptor Registry

The Descriptor Registry:

- lists safe descriptors;
- performs exact metadata lookup;
- returns copy-isolated immutable values;
- expresses registered or disabled metadata state;
- contains no executable values.

Materializer Registry Foundation V1 remains descriptor-only and is not changed by this contract.

### 9.2 Executable Binding Registry

The Executable Binding Registry:

- is server-only;
- is created by explicit dependency injection;
- maps an exact operation and saved binding ID to one Operation Pipeline capability;
- rejects unknown, retired, disabled, mismatched, or ambiguous bindings;
- never exposes its internal dependency instances in safe descriptors;
- performs no dynamic registration after construction.

### 9.3 Prohibited Combination

An executable function, Materializer instance, Provider Client factory, credential resolver, Store, or Output Ingestion implementation must not be added to a public descriptor object.

## 10. Retry Ownership

Retry ownership is layered:

```text
Provider Client / Store / Pipeline
→ one attempt result and safe retry advice

Workflow
→ attempt budget, retry decision, ordering, and stop condition

Reconciliation Runtime
→ bounded observation policy for unknown outcomes

Scheduler
→ future wake-up mechanism only
```

The following are forbidden inside an Operation Pipeline:

- retry loops;
- sleep or timer backoff;
- blind submit retry;
- polling loops;
- treating not-found as permission to resubmit;
- converting commit unknown into not-committed.

## 11. Persistence Ownership

Workflow determines when a lifecycle transition is required. Durable capabilities determine how it is persisted.

Workflow and Operation Pipeline do not own:

- SQL;
- PostgreSQL Driver access;
- Pool or connection acquisition;
- transaction begin, commit, or rollback;
- revision or fence implementation;
- Store-level compare-and-set predicates;
- schema or migration;
- commit-unknown classification.

The durable Store owns atomic persistence behavior. The Durable Transaction capability owns physical transaction scope. The server Composition Root supplies those capabilities.

Operation Pipeline returns its result to Workflow or Integration Coordinator. It does not update the Final Result Store directly.

## 12. Reconciliation Ownership

Workflow owns the decision to request reconciliation when a child result or durable outcome requires it.

Reconciliation Runtime owns:

- bounded observation policy;
- lease, heartbeat, and fence orchestration;
- authoritative lookup ordering;
- unavailable retry policy;
- still-unknown generation;
- corruption stop behavior;
- manual-repair routing.

Stores return only their contracted classifications. Workflow and Pipeline must not invent a more specific Store classification or automatically repair corruption.

PostgreSQL Reconciliation Store implementations remain behind durable capability interfaces and must not be imported by Workflow or Operation Pipeline modules.

## 13. Validation Ownership

Validation remains with the layer that owns the invariant:

| Invariant | Owner |
| --- | --- |
| Workflow envelope and stage precondition | Workflow |
| Adapter Request shape | Provider Adapter |
| Asset resolution and access | Asset Foundation |
| Materializer slots, kinds, usage, expiry | Materializer |
| Binding ID and component compatibility | Binding Registry |
| Provider transport result | Provider Client |
| Provider response semantics | Adapter / Normalizer |
| Output media and ingestion policy | Output Ingestion |
| Revision, CAS, fence, transaction | Durable Store / Transaction |
| Unknown outcome observation | Reconciliation Runtime |

Workflow may reject an incompatible child result but must not duplicate the child's validator.

## 14. Dependency Direction

The allowed dependency direction is:

```text
Provider Request Contract       Asset Contract
          ↓                          ↓
Provider Adapter Contract       Materializer Contract
          ↓                          ↓
Provider Client Contract        Descriptor Registries
                 \              /
                  Binding Contract
                         ↓
                Operation Pipeline
                         ↓
                Workflow Contract
                         ↓
                Workflow Runtime
                         ↓
       Server Composition / Durable Capabilities
                         ↓
                   HTTP / UI
```

PostgreSQL implementations depend on Store contracts and do not depend on Workflow. Workflow depends on durable capability interfaces, never PostgreSQL implementations.

## 15. Reverse Dependency Prohibition

The following foundations must not import Workflow or Operation Pipeline modules:

- Assets;
- Provider Request;
- Provider Adapter;
- Provider Client;
- Materializer;
- Durable Transaction;
- Durable Store;
- PostgreSQL Driver;
- PostgreSQL Store;
- Reconciliation Store.

Reconciliation Runtime may consume a versioned reconciliation request contract but must not depend on a concrete Workflow implementation.

## 16. Stage Model

Foundation V1 defines the following ordered stage model:

1. `input-validation`
2. `binding-resolution`
3. `adapter-request`
4. `asset-resolution-plan`
5. `asset-resolution`
6. `provider-upload-gate`
7. `materialization`
8. `provider-submit`
9. `response-normalization`
10. `output-ingestion-plan`
11. `output-ingestion`
12. `result-persistence`
13. `completed`

An accepted path may leave synchronous execution after Provider Upload or Provider submit and later resume through a saved stage and exact binding identity.

The model is monotonic. A terminal stage cannot return to a non-terminal stage. Cancellation, failure, acceptance unknown, and reconciliation-required are explicit outcomes rather than hidden control flow.

## 17. Stage Progression Rules

- A stage begins only after its predecessor's required result is authoritative.
- Failed validation does not invoke the next capability.
- A child failure does not create a partial success unless the contract explicitly defines a partial result.
- Accepted does not mean completed.
- Provider submission is not repeated merely because its result is unavailable.
- Output Ingestion starts only from a normalized result and a valid Expected Output contract.
- Terminal Workflow result publication follows successful durable persistence.
- Commit unknown never produces a new terminal result without authoritative lookup.

## 18. Cancellation

Workflow checks cancellation before every externally observable or irreversible stage. A child capability receives an explicit cancellation capability or signal where supported.

Cancellation does not authorize rollback of an already accepted Provider operation. Such outcomes route to lookup or reconciliation according to the saved lifecycle state.

## 19. Idempotency

Workflow coordinates separate idempotency namespaces for materialization, Provider generation, Output Ingestion, and final result persistence.

Operation Pipeline may calculate a deterministic semantic fingerprint for one bound attempt. It does not own durable idempotency records. Same-key semantic mismatch is a conflict and must not invoke the Provider again.

## 20. Safe Diagnostics

Workflow and Pipeline diagnostics may contain:

- operation;
- stage;
- safe status;
- reason code;
- descriptor identity and version;
- safe counts and classes.

They must not contain credentials, endpoints, headers, request bodies, prompts, Asset access values, Provider references, raw Store errors, SQLSTATE, SQL, tenant identity, or raw protected identity.

## 21. Forbidden Dependencies

Workflow and Operation Pipeline foundation modules must not directly depend on:

- Next.js Route handlers;
- React, Hooks, Components, or browser APIs;
- Provider HTTP implementations;
- endpoint configuration values;
- credential values;
- concrete Upload runtime where only a capability is required;
- concrete Output Storage or Registry;
- PostgreSQL Driver, Pool, Client, SQL, or migration;
- concrete Reconciliation Store;
- scheduler timer, queue, worker, or webhook;
- filesystem or process environment;
- module-global mutable runtime state.

## 22. Production Connection Boundary

This Foundation does not connect Production credentials, Provider endpoints, PostgreSQL connections, Runtime Bundle, Composition Root, HTTP routes, Workers, Schedulers, or Webhooks.

Any future Production binding requires a separate contract, explicit server-only composition, and its own validation evidence.

## 23. Exact Foundation Boundaries

### 23.1 Workflow Contract Foundation

Contains only Workflow input, result, stage, issue, audit, policy, and capability types plus static boundary tests and documentation.

### 23.2 Operation Pipeline Contract Foundation

Contains only Pipeline input, result, binding, descriptor, issue, audit, and dependency capability types plus tests and documentation.

### 23.3 Operation Binding Foundation

Contains immutable binding descriptors, compatibility validation, exact lookup, and an injected executable binding registry. It contains no Workflow lifecycle logic.

### 23.4 Operation Pipeline Runtime Foundation

Contains single-attempt pipeline execution and operation-specific bridge composition. It contains no retry loop, durable Store implementation, HTTP, UI, or Production connection.

### 23.5 Workflow Runtime Foundation

Contains orchestration and stage progression over injected capabilities. It contains no concrete Provider, Materializer, Upload, Ingestion, Store, or PostgreSQL implementation imports.

### 23.6 Server Composition Foundation

Connects versioned executable dependencies. It is separate from all five preceding foundations and remains out of scope until explicitly authorized.

## 24. Existing Code Classification

The current uncommitted `lib/workflows` implementation is a mixed reference composition and is not the approved Workflow Foundation boundary.

The current uncommitted `lib/operationPipelines/operationPipelineRegistry.ts` combines descriptor and executable ownership. It must be separated before either Registry foundation is committed.

Existing implementation may be preserved as migration evidence, but its current shape is not automatically grandfathered into Foundation V1.

## 25. Backward Compatibility

Existing synchronous Reference Workflow behavior may be retained through an adapter over the new Workflow Runtime. Compatibility does not permit direct concrete imports in the new Foundation.

Existing saved binding IDs must remain exact and must not be silently remapped. V1 contracts remain available while a versioned successor is introduced.

## 26. Versioning

The following are independently versioned:

- Workflow Contract;
- Stage model;
- Operation Pipeline Contract;
- Operation Binding Contract;
- descriptor shape;
- executable binding shape;
- Pipeline audit and result;
- Workflow audit and result.

Unknown major versions are rejected. A Registry must not upgrade a saved binding automatically.

## 27. Failure and Unknown Outcome Policy

Failure classification must retain the child capability's safe meaning. Workflow may project it to a Workflow reason code but must not reconstruct hidden detail.

Unavailable means the attempt could not safely complete. Acceptance unknown means Provider acceptance cannot be established. Commit unknown means durable commit outcome cannot be established. These states are not interchangeable.

Blind retry and automatic repair are prohibited.

## 28. Test Boundaries

Each future Foundation must provide:

- a static dependency boundary test;
- behavior tests for its owned decisions;
- compatibility tests against already committed Foundation contracts;
- mutation and copy-isolation tests for public data;
- safe-diagnostic tests;
- deterministic execution tests;
- tests proving forbidden child calls remain at zero after validation failure.

End-to-end tests do not replace the independent Contract, Binding, Pipeline, and Workflow matrices.

## 29. Future Commit Sequence

The approved sequence is:

1. Workflow / Operation Pipeline Decision Contract.
2. Required dependency foundations not yet committed: Output Ingestion and Provider Upload / Gate contracts.
3. Operation Pipeline Contract Foundation.
4. Operation Binding Foundation.
5. Operation Pipeline Runtime Foundation.
6. Workflow Contract Foundation.
7. Workflow Runtime Foundation.
8. Workflow Descriptor Registry Foundation.
9. Server Composition Foundation.
10. Entry Point / API integration.
11. UI / Browser integration.
12. Production Provider and PostgreSQL binding, only under separate authorization.

Commit order may not be collapsed when doing so would mix Contract, executable runtime, composition, HTTP, UI, or Production connection ownership.

## 30. Commit Candidate for This Decision

The exact candidate is:

```text
docs/WORKFLOW_OPERATION_PIPELINE_FOUNDATION_V1.md
```

No Production file, test, package file, configuration file, migration, or lockfile belongs to this Decision Contract commit.

Recommended commit message:

```text
docs(workflow): define workflow operation pipeline foundation
```

## 31. Readiness Matrix

| Area | Status |
| --- | --- |
| Architecture decision | Complete |
| Workflow ownership | Fixed |
| Operation Pipeline ownership | Fixed |
| Binding ownership | Fixed |
| Descriptor / executable separation | Fixed |
| Retry ownership | Fixed |
| Persistence ownership | Fixed |
| Reconciliation ownership | Fixed |
| Stage model | Fixed |
| Production implementation | Not started under this contract |
| Runtime composition | Forbidden in this phase |
| Production connection | Forbidden |

## 32. Stop Conditions

Implementation must stop if it requires:

- changing a committed Materializer or Provider Client Contract without versioning;
- adding executable values to a descriptor;
- importing concrete PostgreSQL or Provider transport into Workflow;
- inventing an Output Ingestion or Upload capability not yet contracted;
- changing the stage model without a versioned decision;
- broadening this Foundation into HTTP, UI, Scheduler, Worker, Webhook, or Production composition.

## 33. Final Decision

Workflow is the lifecycle orchestrator. Operation Pipeline is a fixed, single-attempt execution capability. Binding owns component compatibility and exact executable selection. Descriptor discovery and executable binding are separate registries. Workflow owns bounded retry decisions; durable capabilities own persistence mechanics; Reconciliation Runtime owns bounded unknown-outcome observation.

The next implementation step is not the current mixed Workflow runtime. Required dependency contracts and the Operation Pipeline Contract Foundation must be completed in the approved sequence.
