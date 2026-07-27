# Trusted Materialization Context Provider Capability Architecture V1

## 1. Status

Accepted architecture decision. This document defines ownership and lifecycle for a future Trusted Materialization Context Provider Capability. It does not define or implement the capability contract.

## 2. Context

`WorkflowMaterializationEntryInput` already contains the three execution values required by Production Workflow Materialization:

- `AuthorityLocatorRuntimeBindingInput`;
- `InputMaterializationV2Request`;
- `InputMaterializationContext`.

`MultiCutRouteRequest` and `AuthenticatedRequestContext` do not contain enough information to construct those values. A second data wrapper with the same three fields would duplicate the Workflow input without establishing where trusted values originate.

In this decision, “trusted” means only that a value is supplied through an explicitly configured server composition boundary rather than copied from an unauthenticated public payload. It does not mean that authorization, ownership, locator, workspace, or materialization policy has already succeeded.

## 3. Existing Findings

Production Workflow Materialization Composition currently wires Authority/Locator binding, handoff, Materialization composition, and Materialization binding. It accepts a complete `WorkflowMaterializationEntryInput`; it does not create one.

Production Workflow Materialization Execution delegates a complete input to that composition and adds no input construction.

Authority, Locator, and Materialization compositions each own their runtime-specific provider/facade wiring. They do not own route request interpretation or cross-domain Workflow input construction.

The existing Workflow Entry trusted-context adapter projects principal-aware materialization context for another boundary, but it does not supply the complete three-value dependency set required here.

No existing capability owns request-scoped acquisition and assembly of all three values.

The existing `MultiCutSourceArtifactHandoff` contract carries an existing
`SourceArtifactAuthorityResolutionInput` across the Upload/Source boundary. It
does not create a source artifact, calculate ownership, manufacture
authorization evidence, or perform Authority evaluation. Its current primary
consumer is the future Context Provider.

The architecture layering review concluded that Source Artifact Handoff is a
trusted provider-input boundary, not an independently evolving architecture
layer or executable capability. The existing contract remains valid and is not
removed, but it must not acquire provider behavior or a second provider
abstraction.

The same review concluded that execution-target allocation and execution
identity policy do not justify separate public foundations. Logical identity
allocation is part of the Context Provider's supply responsibility and may be
delegated to an explicitly injected strategy internal to the provider
composition. Identity policy belongs to this decision.

## 4. Problem Statement

The future Multi-cut Request Adapter must remain a deterministic field mapper. If it manufactures authority input, source references, resolution context, workspace references, materialized artifact references, ownership projections, collision policy, or execution context, it would own policy and environment resolution.

Production Composition must also remain a composition root rather than becoming a request-data builder.

The missing boundary is therefore a capability that supplies already established request-scoped materialization dependencies from explicit server-side sources, with clear failure and lifecycle semantics.

## 5. Decision

Adopt a dedicated, stateless Trusted Materialization Context Provider Capability.

The capability is constructed and injected by Production Composition, then invoked once per route request after transport parsing and authentication and before the Multi-cut Request Adapter.

The provider returns the existing three dependency values required to construct `WorkflowMaterializationEntryInput`. It does not return `WorkflowMaterializationEntryInput` itself.

The Request Adapter remains the sole owner of creating the final Workflow input and assigning `workflowMaterializationEntryInputVersion`.

The minimal architecture is:

```text
Multi-cut Route Contract
  -> Trusted Materialization Context Provider
       -> MultiCutSourceArtifactHandoff trusted input
       -> internal, injected identity-allocation strategy
  -> Multi-cut Request Adapter
  -> WorkflowMaterializationEntryInput
  -> Production Workflow Materialization Execution
```

`MultiCutSourceArtifactHandoff` and the identity-allocation strategy are
supporting boundaries inside this flow. They are not additional architecture
layers.

No separate Source Artifact Provider Capability, Execution Target Allocation
Capability, or Execution Identity Allocation Policy ADR is introduced.

## 6. Capability Ownership

The capability owns:

- receiving explicit request-scoped public, authenticated, and execution-dependency inputs;
- verifying its own capability/input contract version and required top-level presence;
- obtaining the three existing values from injected, explicitly scoped server dependencies;
- accepting the existing `MultiCutSourceArtifactHandoff` as its trusted source
  input without reinterpreting its nested Authority input;
- supplying request-scoped logical `WorkspaceReferenceProjection` and
  `MaterializedArtifactReference` identities through an explicitly injected
  identity-allocation strategy;
- keeping operation identity, idempotency identity, retry stability, namespace,
  and deterministic-derivation rules at this provider boundary;
- returning immutable references or ownership-safe copies according to the nested contracts;
- classifying provider-boundary absence, incompatibility, or unavailability;
- deterministic invocation and result projection.

The capability does not own:

- authentication or authorization decisions;
- Authority evaluation;
- Locator execution;
- workspace creation or lookup;
- artifact creation;
- physical workspace reservation or preparation;
- filesystem collision detection;
- filename, path, extension, output-basename, or media-type generation;
- ownership calculation;
- collision-policy selection;
- materialization execution;
- Workflow input construction;
- defaults, retries, fallback, caching, or environment discovery.

## 7. Provider Ownership

The dedicated Context Provider is the owner.

Production Composition owns only construction and DI wiring of the provider capability. It does not absorb provider behavior.

Workflow Entry is not the owner because it should consume a completed Workflow input and coordinate execution, not discover infrastructure context.

Authority Composition is not the owner because workspace, materialization request, and execution context are outside Authority ownership.

Locator and Materialization compositions are also not owners because neither individually owns the complete cross-boundary dependency set.

## 8. Provider Input

The future Provider Contract must first prove that its input can be expressed
entirely with existing contracts. Its input is expected to contain these
explicit categories:

1. The versioned `MultiCutRouteRequest`, as received without defaults or normalization.
2. The existing `AuthenticatedRequestContext`, supplied separately from the public DTO.
3. The existing `MultiCutSourceArtifactHandoff`, supplied by the trusted
   Upload/Source boundary.
4. The request/idempotency identity and other request-scoped values already
   available through existing server contracts and required for deterministic
   logical identity allocation.

The identity-allocation strategy and production dependency snapshot are
constructor dependencies supplied by Production Composition. They are not
trusted values copied from the public request, and they must not be wrapped as
request data merely to hide DI.

The Provider Contract preflight must determine whether the existing contracts
can express every required input directly. It must not introduce an
`ExecutionDependency`, `TrustedMaterializationExecutionContext`, or other
wrapper that restates established fields without adding a real boundary.

Environment is not a per-request input. Configuration and environment-specific capabilities are explicit constructor dependencies wired by Production Composition. The provider must not read `process.env`, filesystem state, globals, or implicit request-local state.

The route request is input only where an existing field has an explicit correspondence. It must not be used to infer trusted identity, source, workspace, ownership, or policy.

## 9. Provider Output

The provider does not return `WorkflowMaterializationEntryInput`.

The provider's supply responsibility is limited to the existing values needed
to construct `WorkflowMaterializationEntryInput`:

- `AuthorityLocatorRuntimeBindingInput`;
- `InputMaterializationV2Request`;
- `InputMaterializationContext`.

These fields retain their existing names, types, optionality, ownership, and version semantics. Their nested fields are not duplicated or reclassified.

The Provider Contract preflight must decide the smallest valid return shape. It
must prefer reuse of an existing tuple/object shape or individual capability
returns when those forms preserve classified failure and version semantics. A
dedicated result is permitted only when it is required to distinguish provider
success/failure or record capability provenance; it must not become a second
domain model containing the same fields as `WorkflowMaterializationEntryInput`.

The future Multi-cut Request Adapter combines a successful provider result with route and authentication inputs and constructs `WorkflowMaterializationEntryInput` deterministically.

The provider and its identity strategy may allocate logical opaque references.
They do not create the referenced workspace or artifact, resolve a physical
location, or assert that the target exists.

## 10. Failure Ownership

The provider owns only failures at its own supply boundary:

- unsupported provider/input version;
- missing required request category;
- missing configured execution dependency;
- incompatible dependency capability;
- dependency unavailable before any domain execution;
- identity-allocation strategy unavailable;
- required operation/request/idempotency identity unavailable;
- deterministic identity-derivation invariant violation;
- malformed provider result;
- contained internal provider failure.

The provider does not classify domain outcomes for:

- Authority allow/deny decisions;
- Locator authorized, rejected, revoked, expired, ownership mismatch, or workflow mismatch results;
- workspace existence, creation, cleanup, or containment;
- workspace reservation or preparation;
- source or materialized artifact existence;
- filesystem or physical-name collision;
- collision-policy outcomes;
- Materialization decisions;
- Workflow execution.

Those failures remain owned by their existing runtime and result contracts. The provider must not pre-execute those capabilities to discover an outcome.

The provider also does not own archive generation, HTTP status projection, or
Workflow business failure. The future Provider Contract must reuse an existing
failure envelope when its semantics match. This decision does not authorize a
new failure contract.

## 11. Lifecycle

Production Composition creates one provider instance from explicit immutable dependencies.

The provider instance may be reused across requests only if it is stateless. Every invocation receives all request-scoped inputs explicitly and returns a new immutable result wrapper.

The provider owns no mutable singleton, global registry, hidden cache, request cache, timer, background task, or implicit environment handle.

The provider and injected strategy are stateless. They must not use a global
counter, random value, clock value, or hidden filesystem state to allocate
identities. A retry carrying the same formally supplied idempotency identity
must be able to reuse the same execution identities. Different request
identities must not accidentally share target identities.

Nested values preserve their existing ownership rules. The provider does not deep-clone opaque capability objects or change nested identity. It copies only where an existing contract requires ownership isolation.

The provider has no destruction lifecycle. Cleanup and disposal remain the responsibility of the injected dependency owner. If a future dependency requires disposal, that lifecycle belongs to Production Composition, not the request invocation.

## 12. Dependency Direction

The formal direction is:

```text
Route transport parsing
  -> Authentication boundary
  -> Trusted Materialization Context Provider Capability
       -> MultiCutRouteRequest contract
       -> AuthenticatedRequestContext contract
       -> MultiCutSourceArtifactHandoff contract
       -> existing request/idempotency identity contract
       -> internal injected identity-allocation strategy
       -> existing Authority/Locator/Materialization input contracts
  -> Multi-cut Request Adapter
       -> successful Provider result
       -> WorkflowMaterializationEntryInput
  -> Production Workflow Materialization Execution
```

Production Composition depends on the Provider Contract and wires its implementation. The Provider Contract may depend on existing neutral contracts but never on runtime implementations.

Workflow Entry, Authority Runtime, Locator Runtime, Materialization Runtime, Route Contract, and authentication contracts have zero reverse dependency on the provider.

The identity-allocation strategy is an implementation dependency injected
inward by Production Composition. It is not imported by Route, Workflow,
Authority, Locator, or Materialization contracts.

## 13. Compatibility

`WorkflowMaterializationEntryInput` remains unchanged.

Production Workflow Materialization Composition and Execution remain unchanged until the provider is wired at a higher server-composition boundary.

Existing callers that already construct a complete Workflow input continue to work. Provider adoption is additive and opt-in.

There is no automatic conversion, fallback, or default path from public route data. The provider must not reinterpret existing versions.

## 14. Migration

The approved implementation sequence is:

1. Refine this Provider Capability decision with the architecture-layering result.
2. Perform a Provider Contract preflight proving that all input, output, identity, and failure semantics can reuse existing contracts.
3. Add the Provider Contract containing its capability, minimum input, success/failure result, and version semantics.
4. Add an internal deterministic reference identity-allocation strategy.
5. Add a deterministic reference provider and boundary/compatibility tests.
6. Add a production identity-allocation strategy that implements only the logical identity rules in this decision.
7. Add a production provider implementation backed only by explicit injected dependencies.
8. Add Production Composition wiring for the provider and its strategy.
9. Add the Multi-cut Request Adapter consuming a successful provider result.
10. Add the Result Projector.
11. Add Route Adapter composition.
12. Integrate the Route.
13. Perform end-to-end validation.

“Provider Capability” and “Provider Contract” are not separate implementation layers: the capability interface is part of the Provider Contract and must be defined before any provider implementation.

The following independent foundations are not added:

- Source Artifact Provider Capability;
- Execution Target Allocation Capability;
- Execution Identity Allocation Policy ADR.

## 15. Rejected Alternatives

- A `TrustedMaterializationExecutionContext` data wrapper duplicating `WorkflowMaterializationEntryInput` is rejected as redundant.
- Returning `WorkflowMaterializationEntryInput` directly from the provider is rejected because it transfers adapter ownership to the provider.
- Making Production Composition build request values is rejected because composition must remain wiring-only.
- Making Workflow Entry discover dependencies is rejected because Workflow Entry consumes an execution input.
- Making Authority, Locator, or Materialization Composition the owner is rejected because each has a narrower domain.
- Reading environment, filesystem, singleton, registry, or hidden request state is rejected.
- Letting the Request Adapter infer or default missing execution values is rejected.
- Promoting Source Artifact Handoff into an executable provider capability is
  rejected because it is a pass-through trust boundary.
- Publishing an Execution Target Allocator capability is rejected because its
  only established consumer is the Context Provider and it would add a
  pass-through layer.
- Adding a separate Execution Identity Allocation Policy ADR is rejected
  because identity rules are part of this provider's input, lifecycle, and
  supply policy.
- Generating identities in the Route Adapter is rejected.
- Embedding request mapping in Production Composition is rejected.
- Treating a filesystem path as a `SourceArtifactReference` is rejected.
- Promoting deterministic fixture constants to production defaults is rejected.

## 16. Risks

- The request-scoped Execution Dependency source is not yet formally defined.
- Existing upload or source-selection boundaries may not expose every required value through a single capability.
- Passing the entire route request may create accidental coupling unless the Provider Contract limits use to explicitly mapped fields.
- “Trusted” may be misunderstood as authorized or validated; its provenance-only meaning must be repeated in the future contract.
- A provider result that merely repackages caller-supplied values without a real supply boundary would recreate the redundant-wrapper problem.
- Incorrect lifecycle wiring could retain request-scoped values across invocations.
- Existing server contracts may not yet provide a formal request/idempotency
  identity suitable for deterministic allocation.
- Treating a logical identity as a filename or path would couple this boundary
  to filesystem policy.
- Combining logical identity collision with physical filesystem collision would
  transfer Materialization policy to the provider.
- A dedicated provider result could still become a prohibited
  `WorkflowMaterializationEntryInput` wrapper if the preflight does not justify
  its provenance or failure semantics.

## 17. Non-goals

This decision does not:

- add TypeScript contracts or implementations;
- decide Authority, Locator, workspace, ownership, collision, or Materialization policy;
- create source artifacts, physical workspaces, or materialized artifacts;
- reserve, prepare, write, delete, or clean up a workspace;
- define filesystem paths, filenames, extensions, output basenames, or media types;
- authenticate or authorize;
- execute Workflow Materialization;
- implement the Request Adapter, Result Projector, or route integration;
- change existing Workflow, Composition, Execution, Route, or runtime contracts;
- define caching, retry, fallback, persistence, filesystem, or HTTP behavior.

It does define the logical identity constraints under which an injected
strategy may allocate opaque workspace and materialized-artifact references:

- the Route Adapter and Workflow Execution do not generate operation identity;
- the provider or its injected strategy uses a formally supplied
  request/idempotency identity;
- the same idempotency identity may reuse the same execution identities across
  retries;
- different request identities must not share target identities;
- workspace and materialized-artifact identities use distinct, versioned
  namespaces;
- identical formal seeds produce identical identities;
- global counters, clocks, randomness, and hidden state are forbidden;
- logical identity collision is separate from filesystem collision;
- the existing Materialization collision-policy owner remains unchanged.

## 18. Stop Conditions

Stop before implementing the Provider Contract if:

- provider input cannot be represented using existing contracts;
- the formal request/idempotency identity source is not identified;
- `MultiCutSourceArtifactHandoff` cannot be supplied by the production route boundary;
- existing contracts cannot supply all three required output values without generation or inference;
- provider input requires raw filesystem paths, environment lookup, implicit global state, or runtime implementation types;
- identity allocation requires filesystem existence checks, reservation, or preparation;
- collision-policy selection would move into the provider or strategy;
- producing the values requires Authority, Locator, workspace, or Materialization execution;
- success output must duplicate nested contract fields rather than hold existing types directly;
- the failure channel cannot reuse or minimally compose existing failure semantics;
- the provider would have no supply behavior beyond returning values already passed together by its caller;
- Production Composition cannot wire the provider and strategy through explicit DI;
- Route, Workflow, Production Workflow Materialization Composition, or Production Execution must change during the Provider Contract Foundation;
- the provider output becomes a same-shape wrapper for `WorkflowMaterializationEntryInput`.
