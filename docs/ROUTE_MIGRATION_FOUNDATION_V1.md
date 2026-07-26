# Route Migration Foundation V1

## Purpose

This foundation fixes the final Multi-Cut Route boundary before implementation migration. It defines what the Route may receive and expose without changing the existing Route runtime.

## Scope

V1 contains a type-only contract, a static boundary test, and this ownership document. Route implementation, Composition wiring, HTTP runtime construction, and UI integration remain future phases.

## Ownership

The final Route owns exactly four responsibilities:

1. authenticate and authorize the request;
2. project the authenticated HTTP request into a Composition input;
3. invoke the injected `MediaExecutionCompositionCapability`;
4. project the safe Composition decision into an HTTP response.

## Non-Ownership

The Route does not own workspace reservation or cleanup, filesystem access, input materialization, FFmpeg process execution, ZIP construction, archive-reference resolution, response ownership transfer, cleanup sequencing, timeout algorithms, retry algorithms, or provider implementation.

It must not call `mkdir`, `rm`, `unlink`, `spawn`, archive libraries, filesystem discovery, or infrastructure adapters.

## Route Lifecycle

The deterministic Route lifecycle is Authentication, Request Projection, Composition Call, and Response Projection. Authentication or request-projection failure stops before Composition. Composition returns one safe decision before HTTP projection begins.

## Composition Boundary

The Route knows the Composition only through `MediaExecutionCompositionCapability` and `MediaExecutionCompositionInput`. It does not import Workspace, Input Materialization, FFmpeg Process, ZIP Packaging, or their runtime implementations.

ZIP Packaging returns fresh archive bytes, and Composition takes an independent copy before workspace cleanup. The Route receives only that response-owned representation and never resolves an archive or workspace reference.

## Failure Projection

Failures expose only a safe status, HTTP status, deterministic headers, safe body, reason code, and ordered audit. Authentication denial, invalid request, failure, timeout, cancellation, and dependency unavailability have explicit safe reason codes.

Filesystem errors, paths, process objects, stdout, stderr, stack traces, archive references, raw `Buffer`, and internal `Uint8Array` values are forbidden.

## Success Projection

A successful projection has status `completed`, HTTP status `200`, deterministic headers, a safe response body, and reason `request-completed`. Binary output is represented as an HTTP-owned `Blob`, not as Composition's internal mutable byte array.

## Migration Plan

1. Commit this type-only boundary.
2. Add a Route Migration projector runtime using explicit Composition dependency injection.
3. Add behavior tests for authentication, request projection, Composition result mapping, and safe HTTP response mapping.
4. Wire the Composition through server composition without a default registry or singleton.
5. Remove workspace, materialization, FFmpeg, ZIP, archive reading, response transfer, and cleanup sequencing from `app/api/multi-cut/route.ts`.
6. Add Route integration and E2E tests before deleting legacy execution code.
7. Roll back if raw infrastructure values cross the Route boundary or the Route retains execution ownership.

## Validation

- the contract contains types and type-only imports;
- imports are limited to the Media Execution Composition contract;
- no infrastructure implementation or runtime function is present;
- the public decision contains only status, HTTP status, headers, body, safe reason, and safe audit;
- forbidden infrastructure and sensitive values have zero static matches;
- scoped TypeScript diagnostics are zero;
- whitespace and merge-marker audits pass.
