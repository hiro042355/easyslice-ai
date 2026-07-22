# Reference Generation Job Entry Runtime Foundation V1

## Ownership

The runtime validates one Generation Job request, selects an injected Workflow Entry capability exposed by an injected Server Composition result, projects a contract-shaped invocation, invokes the capability at most once, and returns a safe immutable Generation Job result and ordered audit.

## Dependency injection

Server Composition evidence and one Workflow Entry execution capability are explicit dependencies. The runtime does not create a composition, registry, Workflow Runtime, Workflow Entry Runtime, Provider, Materializer, Operation Pipeline, or Output Ingestion implementation.

## Validation

Validation covers request and job identities, selection and versions, public input, context and attempt identities, allowlisted ordered metadata, priority, scheduling classification, resume identity, and cancellation identity. Invalid requests stop before invocation.

## Invocation

A valid admitted request is copied into a Workflow Entry envelope with deterministic metadata ordering, preserved correlation and attempt identities, and an optional resume projection. Cancellation and unavailable or policy-rejected composition states stop before invocation. The injected capability is called no more than once.

## Results

Accepted, completed, partial, failed, cancelled, recovery-required, and rejected Workflow Entry results are converted to Generation Job projections. Dependency exceptions and unsupported result shapes become allowlisted failures without raw error disclosure. Recovery is recommended through an opaque reference; it is not executed here.

## Purity and security

The runtime uses no HTTP, polling, queue, worker, scheduler, persistence, filesystem, network, environment, clock, randomness, or timer. Inputs and dependency results are not mutated, result values are copied, and returned snapshots are deeply frozen.

## Non-ownership

HTTP adapters, Next.js routes, background processors, Provider polling, Output Ingestion execution, persistence, CAS, retry loops, server startup, and browser/UI integration remain later foundations.
