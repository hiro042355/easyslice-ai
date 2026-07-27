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

## 4. Problem Statement

The future Multi-cut Request Adapter must remain a deterministic field mapper. If it manufactures authority input, source references, resolution context, workspace references, materialized artifact references, ownership projections, collision policy, or execution context, it would own policy and environment resolution.

Production Composition must also remain a composition root rather than becoming a request-data builder.

The missing boundary is therefore a capability that supplies already established request-scoped materialization dependencies from explicit server-side sources, with clear failure and lifecycle semantics.

## 5. Decision

Adopt a dedicated, stateless Trusted Materialization Context Provider Capability.

The capability is constructed and injected by Production Composition, then invoked once per route request after transport parsing and authentication and before the Multi-cut Request Adapter.

The provider returns the existing three dependency values required to construct `WorkflowMaterializationEntryInput`. It does not return `WorkflowMaterializationEntryInput` itself.

The Request Adapter remains the sole owner of creating the final Workflow input and assigning `workflowMaterializationEntryInputVersion`.

## 6. Capability Ownership

The capability owns:

- receiving explicit request-scoped public, authenticated, and execution-dependency inputs;
- verifying its own capability/input contract version and required top-level presence;
- obtaining the three existing values from injected, explicitly scoped server dependencies;
- returning immutable references or ownership-safe copies according to the nested contracts;
- classifying provider-boundary absence, incompatibility, or unavailability;
- deterministic invocation and result projection.

The capability does not own:

- authentication or authorization decisions;
- Authority evaluation;
- Locator execution;
- workspace creation or lookup;
- artifact creation;
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

The future provider input contains three explicit categories:

1. The versioned `MultiCutRouteRequest`, as received without defaults or normalization.
2. The existing `AuthenticatedRequestContext`, supplied separately from the public DTO.
3. A request-scoped Execution Dependency projection supplied by an upstream server boundary.

The Execution Dependency projection must contain or reference the already established inputs needed to obtain the three output values. Its exact fields require a separate Provider Contract audit and must reuse existing source artifact, resolution context, workspace, materialized artifact, ownership, and collision-policy contracts.

Environment is not a per-request input. Configuration and environment-specific capabilities are explicit constructor dependencies wired by Production Composition. The provider must not read `process.env`, filesystem state, globals, or implicit request-local state.

The route request is input only where an existing field has an explicit correspondence. It must not be used to infer trusted identity, source, workspace, ownership, or policy.

## 9. Provider Output

The provider does not return `WorkflowMaterializationEntryInput`.

On success it returns a versioned capability result containing the existing values:

- `AuthorityLocatorRuntimeBindingInput`;
- `InputMaterializationV2Request`;
- `InputMaterializationContext`.

These fields retain their existing names, types, optionality, ownership, and version semantics. Their nested fields are not duplicated or reclassified.

The result wrapper is meaningful because it records capability provenance and separates provider success/failure from Workflow input construction. It is not introduced as an independent execution-context domain model.

The future Multi-cut Request Adapter combines a successful provider result with route and authentication inputs and constructs `WorkflowMaterializationEntryInput` deterministically.

## 10. Failure Ownership

The provider owns only failures at its own supply boundary:

- unsupported provider/input version;
- missing required request category;
- missing configured execution dependency;
- incompatible dependency capability;
- dependency unavailable before any domain execution;
- malformed provider result;
- contained internal provider failure.

The provider does not classify domain outcomes for:

- Authority allow/deny decisions;
- Locator authorized, rejected, revoked, expired, ownership mismatch, or workflow mismatch results;
- workspace existence, creation, cleanup, or containment;
- source or materialized artifact existence;
- collision-policy outcomes;
- Materialization decisions;
- Workflow execution.

Those failures remain owned by their existing runtime and result contracts. The provider must not pre-execute those capabilities to discover an outcome.

## 11. Lifecycle

Production Composition creates one provider instance from explicit immutable dependencies.

The provider instance may be reused across requests only if it is stateless. Every invocation receives all request-scoped inputs explicitly and returns a new immutable result wrapper.

The provider owns no mutable singleton, global registry, hidden cache, request cache, timer, background task, or implicit environment handle.

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
       -> explicit request-scoped Execution Dependency contract
       -> existing Authority/Locator/Materialization input contracts
  -> Multi-cut Request Adapter
       -> successful Provider result
       -> WorkflowMaterializationEntryInput
  -> Production Workflow Materialization Execution
```

Production Composition depends on the Provider Contract and wires its implementation. The Provider Contract may depend on existing neutral contracts but never on runtime implementations.

Workflow Entry, Authority Runtime, Locator Runtime, Materialization Runtime, Route Contract, and authentication contracts have zero reverse dependency on the provider.

## 13. Compatibility

`WorkflowMaterializationEntryInput` remains unchanged.

Production Workflow Materialization Composition and Execution remain unchanged until the provider is wired at a higher server-composition boundary.

Existing callers that already construct a complete Workflow input continue to work. Provider adoption is additive and opt-in.

There is no automatic conversion, fallback, or default path from public route data. The provider must not reinterpret existing versions.

## 14. Migration

The approved implementation sequence is:

1. Add a Provider Contract containing its input, capability, success/failure result, and version semantics.
2. Add a deterministic reference provider and boundary/compatibility tests.
3. Add a production provider implementation backed only by explicit injected dependencies.
4. Add Production Composition wiring for the provider.
5. Add the Multi-cut Request Adapter consuming a successful provider result.
6. Add the Result Projector and route integration in later independent phases.

“Provider Capability” and “Provider Contract” are not separate implementation layers: the capability interface is part of the Provider Contract and must be defined before any provider implementation.

## 15. Rejected Alternatives

- A `TrustedMaterializationExecutionContext` data wrapper duplicating `WorkflowMaterializationEntryInput` is rejected as redundant.
- Returning `WorkflowMaterializationEntryInput` directly from the provider is rejected because it transfers adapter ownership to the provider.
- Making Production Composition build request values is rejected because composition must remain wiring-only.
- Making Workflow Entry discover dependencies is rejected because Workflow Entry consumes an execution input.
- Making Authority, Locator, or Materialization Composition the owner is rejected because each has a narrower domain.
- Reading environment, filesystem, singleton, registry, or hidden request state is rejected.
- Letting the Request Adapter infer or default missing execution values is rejected.

## 16. Risks

- The request-scoped Execution Dependency source is not yet formally defined.
- Existing upload or source-selection boundaries may not expose every required value through a single capability.
- Passing the entire route request may create accidental coupling unless the Provider Contract limits use to explicitly mapped fields.
- “Trusted” may be misunderstood as authorized or validated; its provenance-only meaning must be repeated in the future contract.
- A provider result that merely repackages caller-supplied values without a real supply boundary would recreate the redundant-wrapper problem.
- Incorrect lifecycle wiring could retain request-scoped values across invocations.

## 17. Non-goals

This decision does not:

- add TypeScript contracts or implementations;
- decide Authority, Locator, workspace, ownership, collision, or Materialization policy;
- create source, workspace, or artifact references;
- authenticate or authorize;
- execute Workflow Materialization;
- implement the Request Adapter, Result Projector, or route integration;
- change existing Workflow, Composition, Execution, Route, or runtime contracts;
- define caching, retry, fallback, persistence, filesystem, or HTTP behavior.

## 18. Stop Conditions

Stop before implementing the Provider Contract if:

- the request-scoped Execution Dependency owner is not identified;
- existing contracts cannot supply all three required output values without generation or inference;
- provider input requires raw filesystem paths, environment lookup, implicit global state, or runtime implementation types;
- producing the values requires Authority, Locator, workspace, or Materialization execution;
- success output must duplicate nested contract fields rather than hold existing types directly;
- the provider would have no supply behavior beyond returning values already passed together by its caller;
- `WorkflowMaterializationEntryInput`, Production Composition, Production Execution, or the Architecture Decision must be changed to introduce the provider.
