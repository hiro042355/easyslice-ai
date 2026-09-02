# Production Workflow API CSRF Authority V1

## Status

This document records the Owner-approved security design and the narrow contract foundation implemented by this slice. It does not claim that production CSRF is operational.

## Owner-approved design

- PostgreSQL is the future durable authority for Production Workflow API CSRF Security-domain state. Workflow business tables are not CSRF authority.
- A forward-only migration after V000006 is required, but is not authorized or implemented in this slice.
- At most four CSRF tokens may be active for one exact authenticated session. Issuance that would exceed the ceiling must durably revoke the oldest active token and insert the new token as one atomic operation.
- Tokens bind to the trusted authenticated `sessionId`. They cannot survive session rotation, logout, or authenticated-session expiry and cannot transfer between sessions. A user ID or browser partition is not sufficient authority.
- The maximum token lifetime is 30 minutes. Effective expiry is `min(issuedAt + 30 minutes, authenticated session expiresAt)`, and `now >= expiresAt` is expired.
- The token format is `csrf1.<token-id>.<secret>` using canonical unpadded base64url. The token ID has 128 bits of random entropy and the secret has 256 bits.
- Persisted proof is a versioned, domain-separated SHA-256 digest compared at a fixed 32-byte length with timing-safe equality. V1 requires no server pepper.
- Raw tokens and secrets must never be durably persisted or logged. Browser persistent storage is not required or authorized.
- Public Workflow API DTOs and error vocabulary do not change. The existing injected Workflow Fetch CSRF provider remains the client seam.

## Implemented in this slice

- Backend-neutral, server-private policy constants, opaque types, persistence-safe material, closed results, and durable authority interfaces.
- An atomic-issuance authority contract that states the four-token ceiling without defining a database transaction API.
- Strict bounded V1 parsing with canonical encoding and exact decoded lengths.
- Token generation through injected entropy plus an explicit Node `randomBytes` production adapter.
- Explicitly framed, domain-separated SHA-256 digesting and fixed-length timing-safe comparison.
- Pure effective-expiry calculation and fail-closed expiry classification.
- Deterministic token and contract tests, including static runtime-closure checks.

The persistence-safe material contains only token ID, digest metadata and bytes, exact session binding, issuance and expiry times, and lifecycle state. It contains no raw token, raw secret, browser identity, request content, credential, SQL, row, or transaction object.

## Deferred

- PostgreSQL schema, table and index names, constraints, SQL, row representation, locking, CAS, database-clock queries, and connection management
- Forward-only migration after V000006
- PostgreSQL repository adapter and durable transaction implementation
- CSRF bootstrap route and response implementation
- Origin/security route adapter and mutation-route integration
- Authentication lookup, principal authorization, and workflow idempotency integration
- Runtime composition and production UI CSRF bootstrap composition
- Production workflow service/runtime, provider integration, Asset Delivery, and launch readiness

No process-local, reference, fixture, browser, provider, or cloud fallback is permitted for production correctness.

## Future route semantics

The approved future bootstrap direction is authenticated, exact-same-origin `POST /api/v1/workflows/csrf` with an empty body. It returns a server-private security response containing CSRF version, raw token, and expiry. Bootstrap does not require an existing CSRF token and is not a raw-token recovery mechanism.

Mutation routes must validate authentication, origin/fetch metadata, bounded CSRF header shape, token format, and durable CSRF authority before parsing the bounded DTO body, authorizing the principal, reserving workflow idempotency, or invoking workflow services. CSRF rejection therefore creates no workflow idempotency reservation and calls no workflow service.

Private CSRF outcomes project onto the existing public vocabulary: invalid, expired, revoked, or wrong-session proof becomes `403 unauthorized`; invalid authentication becomes `401 unauthenticated`; durable authority unavailability becomes `503 temporarily-unavailable`; malformed internal authority results become `500 internal-error`.

## Security invariants

- `ACTIVE_TOKEN_CEILING = 4`
- `RAW_TOKEN_SERVER_PERSISTENCE = 0`
- `RAW_TOKEN_LOGGING = 0`
- `PUBLIC_WORKFLOW_ERROR_DELTA = NONE`
- `WORKFLOW_UI_API_CLIENT_PUBLIC_DELTA = NONE`
- `POSTGRESQL_RUNTIME_IMPORTS = 0` in this foundation
- Cleanup timing is not required for validation correctness.
- Successful issuance must be multi-instance and restart safe once the deferred PostgreSQL adapter is implemented.
