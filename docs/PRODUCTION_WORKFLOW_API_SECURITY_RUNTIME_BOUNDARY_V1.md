# Production Workflow API Security and Runtime Boundary V1

## Scope

This document defines the server-private Boundary Foundation used before production workflow routes are composed. It covers trusted principal projection, bounded request parsing, committed DTO validation, idempotency-header reconstruction, and strict workflow response projection.

It does not claim that the workflow API is production ready.

## Trusted principal boundary

Only a server-verified `AuthenticatedContext` may enter principal projection. Injected server policies resolve tenant, region, and workflow permissions. Browser JSON, raw browser identity claims, email, Browser Session V2 partitions, anonymous users, and global/default users are not authorities. Every projected principal must pass the committed `validatePrincipal` contract and contain the permission for the requested command.

Authentication failure maps to the existing `unauthenticated` workflow error with HTTP 401. An authenticated request that cannot be safely authorized maps to the existing `unauthorized` workflow error with HTTP 403.

## Request boundary

The request reader accepts JSON only, treats Content-Length as an early rejection hint, and still counts streamed bytes. Start requests are capped at 524,288 bytes, with the committed 131,072-byte limit applied to non-MV starts. Poll, result, and cancel requests are capped at 8,192 bytes. Reading stops when the applicable absolute limit is exceeded.

The boundary rejects empty bodies, malformed UTF-8, BOM-prefixed input, invalid or non-object JSON, unknown DTO keys, wrong versions, invalid references, command smuggling, and body `idempotencyKey` smuggling. The validated `Idempotency-Key` header is reconstructed into the existing committed request DTO. This phase does not reserve, replay, persist, or generate idempotency keys.

## Response boundary

Only committed workflow result and error DTOs may be emitted. The projector validates the internal envelope and its HTTP status, discards arbitrary internal headers, emits JSON with no-store security headers, canonicalizes public error messages, and converts malformed internal results into `500 internal-error` without exposing exception text.

## Explicitly deferred

The following are not implemented by this foundation:

- operational CSRF issuance or store;
- a CSRF bootstrap endpoint;
- durable idempotency backend or schema;
- production workflow service;
- production runtime composition;
- the five workflow route handlers;
- production UI wiring;
- provider integration;
- Asset Delivery;
- launch readiness.

Existing reference, fixture, developer, and process-local workflow route candidates are not runtime dependencies or production authorities for this foundation.
