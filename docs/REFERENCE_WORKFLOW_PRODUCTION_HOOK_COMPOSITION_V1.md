# Reference Workflow Production Hook Composition V1

## 1. Purpose

This contract defines the React-independent composition seam that assembles the committed reference-workflow Hook dependencies from explicitly injected production authorities. It is a composition foundation, not a production workflow entry point.

## 2. Composition owner

`createProductionReferenceWorkflowHookDependencies` owns dependency validation and assembly only. The existing Hook owns React commit-phase acquisition, the Holder owns Controller lifetime, and the Controller owns workflow orchestration. The factory does not own authentication, authorization, polling, provider selection, API behavior, or deployment.

## 3. Input authorities

The caller must explicitly supply a `WorkflowUiApiClient`, authenticated-session state with an opaque partition, a sessionStorage-compatible storage port, Hook timer and environment authorities, the existing poll scheduler and policy, idempotency-key factory, clock, TTL, and operation. No authority is obtained from a global browser object or manufactured by the factory.

## 4. Authenticated partition policy

The partition is opaque, non-secret, authenticated-session scoped, and externally supplied. It must be 16–256 characters and contain no control characters. Raw UID, email, username, account or tenant identifiers, cookies, access or refresh tokens, authorization headers, and credentials are not partition inputs. The factory neither derives nor defaults a partition. The value reaches only the committed Browser Session V2 adapter as namespace authority and is never stored in the Session V2 body.

## 5. Anonymous and unavailable authentication

Only `authenticated` with a valid opaque partition can compose durable recovery. `anonymous` and `unavailable` fail closed with `authentication-required`. Missing or invalid authenticated partitions fail closed. There is no memory, anonymous, empty, default, or global persistence fallback.

## 6. Browser Session Store ownership

The factory instantiates `createReferenceWorkflowBrowserSessionStore`; it does not reproduce schema, expiry, keying, cleanup, failure-latch, or partition-isolation behavior. The returned recovery store exposes the adapter's existing best-effort delete boundary to the product composition owner.

## 7. WorkflowUiApiClient injection

`WorkflowUiApiClient` is mandatory and injected. This phase implements no fetch client, route, bootstrap client, provider client, or fake client. Missing or structurally invalid API authority fails closed.

## 8. Dormant Holder and Controller lifecycle

Successful composition creates one existing Holder graph in `dormant` state. Composition performs zero Controller constructions, acquisitions, environment subscriptions, API calls, and timer schedules. React rendering and effects are absent. The existing Hook remains the sole commit-phase acquisition owner.

## 9. Recovery authority

Browser Session V2 data is a recovery hint only. Recovery remains: browser hint → existing Controller `recover` → authenticated `queryResult` → server truth. The factory does not read recovery state or query a server.

## 10. Partition rotation and logout

Each externally supplied partition creates a distinct adapter namespace and composition. There is no cross-partition fallback, migration, or hidden global state. Auth/product composition owns logout: it must dispose the old composition and invoke existing best-effort deletion where appropriate before replacing the authenticated session or partition.

## 11. Fixture prohibition

The production module's complete runtime dependency closure contains no Hook fixture factory, fixture API client, bootstrap fixture client, in-memory fixture store, static or fake environment, test helper, developer route, or prototype panel. Composition uses the committed Controller and Holder primitives directly rather than passing through the fixture-capable dependency factory. `DEVELOPER_FIXTURE_PROMOTION = NO`.

## 12. Public API and error vocabulary freeze

The discriminated composition result is local to the production composition module. Its reasons describe internal configuration failure and do not extend `WorkflowUiPublicError`, workflow API DTOs, public error codes, or shared workflow types.

## 13. Explicit non-goals

This phase does not mean that production workflow UI, production API client, workflow API routes, auth projection, Asset Delivery, provider integration, or launch readiness is complete. It adds no product UI wiring, React lifecycle, authentication implementation, server authorization, cloud access, or deployment behavior.

## 14. Deferred production gaps

Deferred work includes selecting and implementing the production API client and routes, projecting an authenticated opaque partition, product logout/disposal wiring, product UI integration, Asset Delivery, provider integration, and end-to-end production launch evidence. Each requires separate ownership and review.

## 15. Acceptance evidence

Evidence is attributed to the boundary that establishes it:

- Focused tests establish authenticated success, fail-closed auth/API/storage/runtime validation, partition isolation and rotation, absence of partition data in Session V2 bodies, restricted-field denial, dormant composition, and the absence of recovery or activation ownership in this factory. Results are production composition 8/8, Browser Session V2 16/16, committed Hook 21/21, and Hook fetch 3/3.
- Runtime import-closure inspection establishes zero fixture, test, or developer runtime dependencies from the production factory.
- Accepted lifecycle validation establishes zero composition-time Controller construction or activation, Holder acquisition, environment subscriptions, timer schedules, and API calls, with the Holder remaining dormant.
- Exact Git diff and file-scope review establish that the shared public workflow API and error vocabulary, frozen committed core, and package files are unchanged, and that the candidate scope is exactly three additions. Frozen-core modifications and package changes are zero.
- Clean baseline-versus-candidate differential validation establishes zero candidate TypeScript diagnostics, zero candidate-file ESLint errors or warnings, identical baseline/candidate TypeScript diagnostics of 9/9, identical ESLint results of 31 errors and 48 warnings, PASS/PASS builds, and zero regression delta.
