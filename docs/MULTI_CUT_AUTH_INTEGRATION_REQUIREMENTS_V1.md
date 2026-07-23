# Multi-cut Authentication Integration Requirements V1

## 1. Existing authentication

`app/api/multi-cut/route.ts` currently performs no authentication or authorization. It reads a body and directly performs filesystem, process, media, and response operations.

## 2. Current responsibility

There is no current auth responsibility to preserve. Creator-style logging is not authentication and must not be treated as identity evidence.

## 3. Unimplemented risk

The route can trigger resource-intensive processing without a verified caller, tenant ownership, workspace permission, request accountability, or safe denial boundary.

## 4. Credential projection

The future outer route/session adapter may extract a session, bearer, or service credential, but must immediately convert it to an opaque `AuthenticationCredentialProjection`. It must not pass the raw header, cookie, token, JWT, password, signed value, or provider session.

## 5. Raw credential destruction boundary

Raw credential material terminates inside the future credential verifier/session adapter. The Auth Boundary, Next Route Adapter, HTTP Adapter, logs, audits, retries, and idempotency records receive no raw value.

## 6. Authentication invocation position

Invoke Authentication after transport-level body limits and route classification but before upload lookup, filesystem access, process execution, HTTP Adapter invocation, or existence-revealing resource lookup.

## 7. Authorization invocation position

Invoke Authorization only after an authenticated subject is available and before resolving the requested workspace, upload, job, or media operation. Authentication failures invoke Authorization zero times.

## 8. Safe HTTP Adapter identity

Only `AuthenticatedRequestContext`-derived safe request/caller classification proceeds to HTTP composition. Raw subject, tenant, credential, and policy internals must not enter public HTTP bodies or headers.

## 9. Tenant and workspace ownership

The server derives tenant and workspace scope from trusted subject/policy data. Client-submitted tenant or workspace values are untrusted hints and cannot establish ownership. Subject, resource, and policy tenant references must match.

## 10. Unauthenticated response

Project `unauthenticated` as a fixed safe rejected response with HTTP 401. Do not reveal credential presence, expiry, revocation, issuer, or resource existence.

## 11. Forbidden response

Project `forbidden` as a fixed safe rejected response with HTTP 403. Do not distinguish missing resource, wrong tenant, wrong owner, or missing permission publicly.

## 12. Unavailable response

Project auth dependency unavailability as a fixed safe unavailable response with HTTP 503. Do not fall back to anonymous or allow.

## 13. Invalid response and audit

Invalid auth projection returns rejected/400 before capability invocation. Audit contains safe ordered classifications and reason codes only; no identity, tenant, credential reference, raw exception, or policy content.

## 14. Retry and idempotency

Transport retries must reuse an authoritative request/idempotency identity. Authentication and authorization are re-evaluated when policy-sensitive execution begins; retry ownership remains outside the Auth Runtime. An unavailable decision is not an allow decision.

## 15. Migration prerequisites

Commit the Auth Contract and Runtime, define the credential verifier/session adapter, define trusted tenant/workspace resolution, wire explicit composition, isolate upload/media capabilities, and add route-level security regression before modifying `multi-cut`.

## 16. Deletion candidates

After migration, remove unauthenticated direct processing, route-local identity assumptions, sensitive body logging, direct filesystem/process orchestration, duplicate denial mapping, and any default auth fallback.

## 17. Commit slicing proposal

Use separate commits for Auth contracts, Reference Auth Runtime, this integration document, credential/session verification, composition wiring, thin-route migration and regression, then obsolete route behavior removal.

## HTTP composition decision

Auth decisions belong before the HTTP Adapter. Do not expand the current HTTP Adapter contract with tokens, cookies, sessions, or provider auth types. Composition maps unauthenticated to 401, forbidden to 403, unavailable to 503, and invalid to 400; only allowed requests call the HTTP Adapter.
