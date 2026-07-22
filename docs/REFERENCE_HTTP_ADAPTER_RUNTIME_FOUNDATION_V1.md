# Reference HTTP Adapter Runtime Foundation V1

## Purpose

This foundation adapts the provider-neutral `HttpRequestEnvelope` contract to the Generation Job Entry contract and projects the result back to an `HttpResponseEnvelope`.

## Ownership

The runtime owns envelope validation, an explicit inbound-header allowlist, safe request/body/metadata/correlation projection, one injected Generation Job Entry invocation, deterministic result and audit projection, and immutable snapshots.

## Non-ownership

It does not own native HTTP objects, Next.js routes, authentication implementation, server composition, workflow execution, providers, uploads, queues, workers, persistence, retries, polling, clocks, random values, networking, or filesystem access.

## Dependency boundary

Dependencies flow from the HTTP Adapter Runtime to the type-only HTTP Adapter and Generation Job Entry contracts. The executable Generation Job capability is supplied explicitly. No runtime, registry, singleton, or default dependency is constructed.

## Validation and projection

V1 accepts only the `generation-job` route with the `create` method, structured content, bounded bodies, and the `content-type`, `request-id`, and `correlation-id` inbound header classifications. Invalid input is rejected before capability invocation. Accepted, completed, partial, cancelled, recovery-required, rejected, failed, thrown, and unsupported dependency outcomes are projected into safe deterministic results.

## Security and failure boundary

Raw provider references, storage locators, receipts, credentials, tokens, stack traces, and dependency exception messages are never projected. Retry and reconciliation execution remain outside this runtime.

## Versioning

The foundation implements version `1.0` envelopes, audits, request bodies, and response bodies. Contract evolution must remain additive or introduce an explicit new version.
