# Reference Server Composition Runtime Foundation V1

## Ownership

The runtime validates a composition definition, resolves injected capability descriptors, enforces required and optional dependency semantics, assembles the public capability projection, and returns an immutable ready, degraded, or unavailable snapshot with ordered audit evidence.

## Dependency injection

Workflow Entry, health, and additional server capability descriptors are supplied explicitly. The runtime does not create or execute Workflow, Workflow Entry, Operation Pipeline, Provider, Materializer, or Output Ingestion implementations.

## Resolution

Dependency declarations are evaluated by declaration order and stable slot identity. A candidate is resolved only when both dependency and capability identities match. Missing, incompatible, and unavailable candidates remain safe classification results. A required failure makes the composition unavailable; an optional omission makes it degraded.

## Capability assembly

The assembled result contains descriptor copies only. It exposes supported classifications and provision status, never executable callbacks or implementation instances. Duplicate capability identities are rejected before assembly.

## Lifecycle and audit

Successful resolution projects `ready`; optional omissions or degraded descriptors project `degraded`; validation or required dependency failures project `unavailable`. Audit entries are append-ordered and use deterministic zero-based sequence numbers.

## Security and purity

The runtime performs no HTTP, filesystem, network, environment, clock, randomness, timer, queue, worker, or polling operation. Inputs are copied during construction and every result is deeply frozen.

## Non-ownership

HTTP adapters, Next.js routes, Workflow APIs, Generation Job entry points, browser/UI integration, server startup, process lifecycle, and production composition remain later foundations.
