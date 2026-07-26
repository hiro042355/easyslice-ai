# Multi-Cut Production Reference Authority Decision V1

## 1. Context

`SourceArtifactLocatorCapability` resolves an opaque Source Artifact reference to an Adapter-internal filesystem location. The current Repository defines the invocation and validation boundary but does not identify the Production authority that issues, owns, persists, or invalidates that reference.

This ADR separates established facts from plausible but undocumented relationships. It does not select an authority where Repository evidence is insufficient.

## 2. Existing Contract

`locateSource()` accepts only `{ opaqueReference: string }` and returns only `{ location: string }`, synchronously or asynchronously. The Contract carries no tenant, subject, request, operation, authorization decision, lifetime, revision, registry identity, storage classification, or replay evidence.

The Input Materialization request separately contains request, operation, Source, Workspace, materialized-artifact, tenant, and ownership projections. The Adapter validates those projections before invoking the Source Locator, but passes only the opaque Source reference to it.

## 3. Existing Evidence

- Input Materialization rejects malformed Source references before Locator invocation.
- Source references use a restricted opaque identifier syntax.
- Input Materialization compares authenticated, request, Source, Workspace, and operation ownership projections before resolution.
- A resolved Source must exist and be a regular file.
- Locator failures are normalized to safe `source-unavailable` results.
- Physical Source locations do not enter Materialization decisions, Composition decisions, Runtime Binding results, Route contracts, or HTTP projections.
- Temporary Workspace owns request-scoped Workspace lifecycle, not Source-reference issuance.
- Media Execution Composition and Runtime Binding receive capabilities and do not resolve Source references.
- Route Migration excludes filesystem lookup and physical-location ownership.
- Upload, pending-upload, accepted-persistence, Workflow Entry, and Workflow API areas define opaque references, ownership projections, stores, or vaults for their own domains.
- `ReferenceWorkflowApiReferenceVault` demonstrates a domain-specific issuer/resolver with ownership and revocation, but it does not declare ownership of `SourceArtifactLocatorCapability` references.
- No committed Contract maps an Upload, accepted-persistence, Workflow API, or other reference directly to `OpaqueSourceArtifactReference`.

## 4. Decidable Facts

The following are already decided by Repository contracts:

1. The Source Locator consumes an opaque reference, not a public path.
2. Location resolution occurs behind the Input Materialization dependency boundary.
3. Input Materialization invokes the Locator only after request and ownership validation.
4. Input Materialization, not the Locator, performs regular-file inspection.
5. Input Materialization owns Source-to-Workspace copy orchestration and containment checks.
6. Locator failure must be projected safely without raw location or exception disclosure.
7. Composition, Runtime Binding, Assembly descriptors, Route, and HTTP do not receive the resolved location.
8. Temporary Workspace is not the Source-reference issuer merely because it owns Workspace cleanup.
9. Possession of an opaque reference alone is not documented as authorization.

## 5. Inferred but Undocumented Facts

The following relationships are supported by adjacent architecture but are not formal Source-authority decisions:

- An upstream Upload or persistence boundary is a plausible issuer because Source artifacts must exist before Input Materialization.
- A persistence-owned authority is a plausible durable resolver because accepted and pending workflows already separate opaque references from internal state.
- Tenant and ownership checks likely must remain consistent between issuance and resolution because Input Materialization requires matching ownership projections.
- Source references likely require lifecycle state beyond syntax validation because adjacent reference systems support active, revoked, pending, or terminal states.
- Durable or cross-process execution likely requires a durable authority rather than a request-local map.

These statements are not adopted decisions. Their status is `UNRESOLVED`.

## 6. Undecidable Decisions

The Repository alone does not decide:

- reference issuer: `UNRESOLVED`;
- authoritative Source-reference owner: `UNRESOLVED`;
- registry owner: `UNRESOLVED`;
- persistence mechanism or durability class: `UNRESOLVED`;
- uniqueness domain and collision policy: `UNRESOLVED`;
- reference scope across request, operation, tenant, user, region, or process: `UNRESOLVED`;
- tenant and user ownership model: `UNRESOLVED`;
- authorization enforcement owner at resolution: `UNRESOLVED`;
- lifetime and expiration: `UNRESOLVED`;
- stale-reference classification: `UNRESOLVED`;
- replay classification: `UNRESOLVED`;
- Source replacement semantics: `UNRESOLVED`;
- deletion and revocation semantics: `UNRESOLVED`;
- durable and cross-process resolution: `UNRESOLVED`;
- local filesystem mapping policy: `UNRESOLVED`;
- Source-to-Workspace association before materialization: `UNRESOLVED`;
- binding between a Source reference and a request or operation: `UNRESOLVED`.

## 7. Authority Candidates

No candidate is adopted by this ADR.

| Candidate | Responsibility | Dependency direction | Security boundary | Durability | Testability | Coupling and migration impact | Principal failure modes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. Route-owned resolution | Route issues or resolves Source references | Route would depend on storage/location internals | Conflicts with the Route Migration filesystem boundary | Request-oriented unless another store is added | HTTP tests become infrastructure tests | High coupling; reverses established Route boundary | Path leakage, authorization duplication, unavailable Route-local state |
| B. Assembly-owned resolution | Assembly owns reference mapping while constructing runtime | Assembly would absorb request-time resolution | Conflicts with construction-only Assembly boundary | Undefined | Requires construction and request lifecycle mixing | High coupling; Locator behavior moves into composition root | Import-time or create-time lookup, hidden configuration, lifecycle ambiguity |
| C. Locator-owned registry resolution | Locator contains or directly owns the registry | Adapter depends only on Locator Contract | Can hide physical location, but authorization context is absent from the current method | Depends on an unselected registry | Locator can be tested independently | Moderate coupling; registry lifecycle becomes Locator concern | Missing, stale, revoked, wrong-owner, unavailable registry |
| D. Persistence-owned reference authority | A durable persistence capability issues and resolves references; Locator delegates | Locator depends on an authority capability supplied by composition root | Can centralize ownership and lifecycle checks | Potentially durable | Authority and Locator can be tested separately | Adds an explicit authority dependency and migration | Conflict, stale revision, unavailable store, authorization mismatch |
| E. Upload-subsystem-owned authority | Upload commits Source references and resolves uploaded artifacts | Materialization consumes an Upload-issued reference through Locator | Aligns issuance with ingestion, but later non-Upload Sources need policy | Depends on Upload persistence | Strong Upload-to-Materialization fixtures possible | Couples all Sources to Upload unless generalized | Upload expiry, incomplete upload, deleted object, provider/storage mismatch |

Repository evidence rules out A and B as compatible with current boundaries. It does not provide enough evidence to choose among C, D, E, or another explicit authority.

## 8. Ownership Boundary

The future authority must own issuance, uniqueness, authoritative state, ownership association, lifecycle, and resolution eligibility. The Locator must not infer those facts from reference syntax.

Input Materialization continues to own request-level ownership projection validation, Source inspection, copy orchestration, destination containment, and result projection. This ADR does not decide whether the authority repeats or strengthens ownership enforcement during lookup.

## 9. Security Boundary

Opaque references must not expose or encode physical location, credentials, tenant internals, provider handles, or authorization evidence. A public caller must not gain authority through possession alone.

The current Locator method lacks an authorization context. Whether authorization is completed before Locator invocation, enforced again by an authority capability, or represented by a restricted lookup context is `UNRESOLVED`. Wrong-owner, missing, stale, revoked, and unauthorized references must remain externally non-disclosing, but their internal classification contract is also `UNRESOLVED`.

## 10. Persistence Boundary

Current contracts do not require in-memory or durable persistence. Adjacent accepted-persistence and Workflow reference stores demonstrate durable or authoritative patterns, but none is assigned to Source artifacts.

The authority's persistence, transaction, concurrency, recovery, and retention semantics are `UNRESOLVED`. This ADR does not choose a database, registry implementation, storage provider, or retention period.

## 11. Locator Boundary

The Locator translates a validated logical reference into the internal location required by Input Materialization. It does not issue references, parse requests, authenticate callers, inspect files, copy artifacts, create Workspaces, choose cleanup timing, or publish locations.

If authority lookup is delegated to the Locator, the delegation must use a separately approved authority Contract. The Locator must not create a hidden registry or derive a path directly from an untrusted reference.

## 12. Assembly Boundary

Server Runtime Assembly may construct or receive an approved Source authority and Production Locator, then inject the Locator into Input Materialization. It must not issue request-specific references, resolve them during construction, or own registry policy.

Assembly validation is limited to dependency completeness and callable shape. Authority and Locator behavior begins during the execution attempt.

## 13. Route Boundary

The Route authenticates, projects a request, invokes a composed capability, and projects an HTTP response. It does not issue Source references, access the authority registry, resolve locations, inspect files, or distinguish sensitive lookup failures.

Any future endpoint that issues a Source reference is a separate Upload or ingestion boundary and is not implicitly owned by the Multi-Cut execution Route.

## 14. Failure Semantics

Current Input Materialization safely projects thrown Locator failures as `source-unavailable` and separately classifies missing or non-regular Sources after inspection.

The authority-level distinction among missing, stale, revoked, unauthorized, corrupted, conflict, and unavailable is not represented by the current Locator Contract. Whether those classifications remain collapsed or require a versioned result Contract is `UNRESOLVED`.

Raw errors, paths, registry records, ownership values, credentials, and tokens must not enter public decisions or audit.

## 15. Replay and Stale Semantics

Input Materialization rejects duplicate request identities within one Adapter instance, but that behavior is not authoritative Source-reference replay protection.

The following remain `UNRESOLVED`:

- whether the same active Source reference may be reused by multiple requests;
- whether replay is scoped by operation, tenant, owner, or idempotency identity;
- how a stale, replaced, expired, revoked, or deleted Source is classified;
- whether Source replacement preserves or invalidates existing references;
- whether resolution must return revision or replay evidence;
- whether stale and unauthorized results are intentionally indistinguishable.

## 16. Required Follow-up Decisions

1. Select the Source-reference issuer and authoritative owner.
2. Define the authority Contract and its dependency direction.
3. Define reference uniqueness and scope.
4. Define ownership data captured at issuance.
5. Define authorization enforcement at resolution.
6. Define lifecycle states, expiration, revocation, deletion, and replacement.
7. Define replay, idempotency, stale, and conflict semantics.
8. Decide request and operation binding.
9. Decide request-scoped versus durable and cross-process resolution.
10. Define safe authority and Locator result classifications.
11. Decide whether the current Locator method is sufficient or requires a versioned lookup context/result.
12. Decide persistence ownership, concurrency, transaction, and recovery boundaries.

## 17. Recommended Decision Order

1. Choose issuer and authoritative owner.
2. Define reference identity, uniqueness, and scope.
3. Define tenant/user ownership and authorization enforcement.
4. Define lifecycle, revocation, deletion, and replacement.
5. Define replay, stale, conflict, and safe failure semantics.
6. Decide durability, concurrency, recovery, and persistence ownership.
7. Decide whether the Locator Contract requires a versioned extension.
8. Decide Production location mapping only after authority semantics are fixed.
9. Implement authority and Locator separately.
10. Integrate them through Server Runtime Assembly.

## 18. Implementation Blocking Status

`BLOCKED`.

The Repository establishes the Source Locator and Input Materialization boundaries but does not identify the Production Source-reference authority. Production Source Locator implementation must not proceed until the issuer, authority, ownership, lifecycle, authorization, replay, stale, and persistence decisions above are approved.
