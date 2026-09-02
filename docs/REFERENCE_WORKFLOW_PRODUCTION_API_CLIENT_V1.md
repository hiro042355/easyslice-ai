# Reference Workflow Production API Client V1

## 1. Purpose

This contract defines the React-independent production transport foundation that adapts the committed `WorkflowUiApiClient` boundary to an injected HTTP transport. It is not a workflow orchestrator, route implementation, authentication implementation, or production-readiness claim.

## 2. Five-method boundary

The client implements exactly `start`, `pollUpload`, `pollGeneration`, `queryResult`, and `cancel`. `recover` remains Controller-owned composition that loads Browser Session V2 and uses `queryResult`. `reset` remains a Controller/session-local operation and has no transport method.

## 3. Endpoint mapping

Every invocation performs at most one POST using the committed endpoint authority:

- `start` → `/api/v1/workflows/start`
- `pollUpload` → `/api/v1/workflows/poll-upload`
- `pollGeneration` → `/api/v1/workflows/poll-generation`
- `queryResult` → `/api/v1/workflows/result`
- `cancel` → `/api/v1/workflows/cancel`

Production route implementation and route-side authentication enforcement remain deferred.

## 4. Injected authorities

`createWorkflowFetchClient` receives the committed `WorkflowFetchTransport`, `WorkflowFetchCsrfProvider`, and `WorkflowFetchTimeoutController` authorities. It does not require global `fetch`, a global authentication singleton, React, a Controller, or a Holder. `createWorkflowUiFetchClientAdapter` projects the lower fetch client onto the frozen five-method UI client contract without expanding that contract.

## 5. Request transport

Requests use JSON, `credentials: "same-origin"`, `cache: "no-store"`, the committed JSON Accept and Content-Type headers, and the CSRF token supplied by the injected anti-forgery authority. The Controller supplies the idempotency key; the client validates and transports it separately from the JSON body. The client generates no workflow, session, acquisition, request, or user identity.

The operation-specific committed workflow request validator, serialization boundary, and request-size limits must pass before transport execution. Invalid input fails closed without invoking transport.

## 6. Authentication and privacy

Authentication relies on the external same-origin authenticated browser/server session boundary. CSRF is anti-forgery authority, not identity material. The client does not derive or send raw UID, email, account ID, access token, authorization material, or the opaque Browser Session partition. There is no anonymous or default credential fallback.

## 7. Response validation

The client enforces the committed response byte limit, JSON content type, fatal UTF-8 decoding, JSON object shape, workflow result/error DTO validators, HTTP/result consistency, and the strict `WorkflowApiServiceResult` validator. All five methods share this response contract; no parallel schema vocabulary is introduced.

## 8. Error boundary

Transport rejection maps to the existing `network-unavailable` error, timeout maps to `request-timeout`, and caller abort returns `status: "aborted"`. Invalid JSON, content type, size, schema, status, or envelope maps to `response-invalid`. Valid workflow error DTOs remain response results. A valid service-unavailable boundary maps to the existing `service-unavailable` error. No transport exception crosses the public client boundary and the public workflow error vocabulary is unchanged.

## 9. Ownership exclusions

The client performs zero automatic retries and owns no polling loop, recovery orchestration, Controller construction, Holder acquisition, Browser Session persistence, provider selection, or cloud behavior. Polling, retry policy, reconciliation, cancellation priority, recovery, and idempotency-key reuse remain Controller/Hook responsibilities.

## 10. Runtime closure

The complete production runtime dependency closure must contain no fixture client, fixture bootstrap, fake/static environment, test helper, developer route, prototype UI, or unreviewed runtime prerequisite. Tests use deterministic injected transports and never contact a route, provider, or cloud service.

## 11. Deferred production gaps

This foundation does not implement production workflow routes, route-side authentication enforcement, production UI wiring, authenticated Browser Session partition projection, Asset Delivery, provider integration, or launch readiness. Those remain separately owned and reviewed phases.
