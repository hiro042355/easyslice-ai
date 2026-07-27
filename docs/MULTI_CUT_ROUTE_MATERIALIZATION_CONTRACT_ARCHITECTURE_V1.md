# Multi-cut Route Materialization Contract Architecture V1

## 1. Status

Accepted architecture decision. This document defines the contract boundaries required to connect the multi-cut HTTP route to Production Workflow Materialization Execution. It does not authorize runtime integration or changes to the current route.

## 2. Context

The repository now contains completed Workflow Materialization contracts and execution foundations, while `app/api/multi-cut/route.ts` still owns transport parsing, media execution, temporary storage, packaging, cleanup, and response construction. A formal boundary is required before those responsibilities can be migrated safely.

The repository also contains generic HTTP envelope contracts, an authentication boundary, and an earlier Media Execution route-migration contract. None of those contracts alone defines the multi-cut HTTP payload, its compatibility behavior, or its mapping to Workflow Materialization.

## 3. Existing System Findings

The current route:

- accepts a JSON body containing `clips`, optional `creatorStyleConfig`, and optional `outputFormat`;
- treats missing or empty `clips` as a `400` response;
- defaults `outputFormat` to `original` unless its value is exactly `shorts`;
- returns a ZIP response with status `200`, `Content-Type: application/zip`, and `Content-Disposition: attachment; filename=clips.zip`;
- returns selected JSON failures with status `400` or `404`;
- performs no explicit authentication or principal projection;
- directly performs filesystem discovery, temporary workspace use, FFmpeg invocation, ZIP packaging, archive reading, and cleanup;
- has no exported request DTO or response projection contract.

`lib/server/httpAdapter/types.ts` provides reusable HTTP-neutral envelopes and projections. `lib/server/authBoundary/types.ts` owns authenticated request context. `lib/server/routeMigration/types.ts` is specifically coupled to Media Execution Composition and does not define the Workflow Materialization boundary. Workflow Materialization owns execution input and result contracts, not HTTP transport contracts.

## 4. Problem Statement

Using a Workflow Materialization input as the HTTP request DTO would couple transport compatibility to workflow evolution. Returning a Workflow Materialization result directly would expose internal classifications and prevent deliberate HTTP status, error, header, and body compatibility decisions. Keeping the mappings inline in the route would leave the boundary implicit and untestable.

The system therefore requires a multi-cut-specific contract boundary between HTTP transport and Workflow Materialization without changing the existing Workflow contracts.

## 5. Decision

Introduce a versioned, multi-cut-specific Route Contract Foundation under the proposed path `lib/server/multiCutRoute/types.ts`.

The future foundation will define:

- a public multi-cut request DTO;
- a request-adapter input that keeps authentication context separate from the public body;
- a classified adapter result;
- a multi-cut HTTP response projection;
- a safe public error projection;
- independent request and response-projection versions.

Separate future implementations will provide:

- a request adapter from the parsed DTO and trusted authentication context to `WorkflowMaterializationEntryInput`;
- a result projector from `WorkflowMaterializationEntryResult` to the multi-cut response projection;
- a thin Next.js route handler that performs transport parsing, invokes the boundaries, and constructs the final HTTP response.

The generic HTTP contract remains reusable infrastructure. It does not become the source of truth for the multi-cut payload.

## 6. Ownership Boundaries

The Route Handler owns:

- receiving the framework request;
- parsing transport bytes, JSON, headers, and cookies;
- invoking the authentication boundary when authentication is enabled;
- invoking the request adapter;
- invoking Production Workflow Materialization Execution;
- invoking the result projector;
- constructing the framework response from the returned projection.

The multi-cut Route Contract owns public request and response shapes, version discriminants, and safe transport classifications.

The Request Adapter owns explicit field mapping and route-boundary mapping validation.

The Result Projector owns HTTP status, public API error codes, safe response body, and public headers.

Workflow Materialization owns business execution, business-stage validation, workflow result semantics, retry recommendations, reconciliation recommendations, and internal audit projection.

## 7. Request Contract Decision

The request DTO is route-specific and versioned. Its V1 compatibility shape preserves:

- `clips` as the required public collection;
- each clip's `start`, `end`, and optional `title`;
- optional `creatorStyleConfig`;
- optional `outputFormat`;
- the existing `shorts` versus `original` interpretation during the compatibility phase.

The DTO must not duplicate `WorkflowMaterializationEntryInput`, authority context, filesystem location, workspace data, provider data, or runtime capability fields. It represents received public data, not trusted execution input.

Route-specific ownership is preferred until a second proven consumer requires exactly the same transport semantics. A generic shared DTO must not be introduced speculatively.

## 8. Authentication Context Decision

Authentication context remains owned by the existing authentication boundary. The multi-cut request DTO must not redefine principal, tenant, ownership, authorization evidence, session, JWT, ACL, or RBAC types.

The future request adapter receives the parsed public DTO and an `AuthenticatedRequestContext` as separate inputs. It may copy trusted values but must not authenticate, authorize, infer identity, or manufacture missing context.

The current route has no authentication behavior. Migration must not silently add authentication. Enabling authentication is a separately approved behavior change and compatibility decision.

## 9. Workflow Input Mapping Decision

The Request Adapter is the only owner of the mapping from route data and trusted context to `WorkflowMaterializationEntryInput`.

It must:

- validate the request contract version;
- validate the public DTO shape needed for mapping;
- copy values deterministically;
- preserve ordering;
- reject missing trusted context when the selected execution contract requires it;
- return classified, safe mapping failures.

It must not:

- execute Workflow Materialization;
- resolve artifacts;
- infer principal, tenant, ownership, workflow identity, or authorization evidence;
- perform filesystem, network, provider, or media operations;
- reconstruct internal workflow objects with undocumented defaults.

## 10. Workflow Result Projection Decision

The Result Projector is the only owner of converting `WorkflowMaterializationEntryResult` into a multi-cut HTTP response projection.

It must preserve safe classifications while preventing internal execution data from becoming public by accident. It must produce immutable status, headers, body, safe reason, public error code, and safe audit fields.

The Workflow result remains unchanged and transport-neutral. The projector must not edit, retry, reconcile, or continue execution.

Binary archive delivery is not assumed to exist in the Workflow result. Route integration must stop if a successful Workflow Materialization result cannot supply an already response-owned public representation through an existing contract.

## 11. HTTP Status Ownership

HTTP status belongs to the Result Projector. The Route Handler only applies the projected numeric status to the framework response.

Workflow Materialization must not contain HTTP status codes. Mapping from completed, partial, failed, cancelled, or recovery-required outcomes to HTTP status is a versioned route policy.

The compatibility projector initially preserves the observable legacy mappings where equivalent outcomes exist: ZIP success as `200`, invalid public input as `400`, and missing public source as `404`. Other execution classifications require an explicit mapping table before runtime migration.

## 12. Error Projection Ownership

Public API error codes, safe reasons, and error bodies belong to the Result Projector and the multi-cut response contract.

Internal exception messages, stack traces, filesystem paths, workspace identifiers, process commands, stdout, stderr, provider references, credentials, raw audit payloads, and internal reason strings are forbidden public fields.

Internal classifications may be mapped to stable public codes, but they must not be exposed verbatim merely because they are currently safe. Public codes are independently versioned API semantics.

## 13. Validation Ownership

Validation is layered:

- the Route Handler owns transport parsing and malformed JSON classification;
- the authentication boundary owns authentication and trusted-context validation;
- the Request Adapter owns request-version, DTO-shape, and mapping-prerequisite validation;
- Workflow Materialization owns business and execution validation;
- the Result Projector owns projection completeness and public-safety validation;
- the Route Handler owns no duplicate business validation.

Failure at a boundary is returned as that boundary's classified result. Raw exceptions must be contained before public projection.

## 14. Dependency Direction

The required dependency direction is:

```text
Next.js Route Handler
  -> Multi-cut Route Contract
  -> Multi-cut Request Adapter
  -> WorkflowMaterializationEntryInput
  -> Production Workflow Materialization Execution
  -> WorkflowMaterializationEntryResult
  -> Multi-cut Result Projector
  -> Multi-cut Route Response Projection
  -> NextResponse / Response construction
```

Authentication context enters the Request Adapter from the existing authentication boundary. Generic HTTP types may be reused by the multi-cut contract where their semantics match, but generic HTTP contracts must not import the multi-cut contract.

Workflow, materialization, authentication, and generic HTTP foundations must have zero reverse dependency on the route, adapter, projector, or Next.js.

## 15. Versioning

The public request uses an explicit `requestVersion` and the public response projection uses an explicit `responseProjectionVersion`. V1 values are `"1.0"`.

The two versions evolve independently. Additive optional fields are allowed only when their absence preserves identical semantics. Renames, required fields, changed defaults, changed error meanings, changed status mappings, or changed binary behavior require a new version.

Unknown versions are rejected explicitly. There is no automatic fallback, implicit promotion, or inference of a newer version from body shape.

## 16. Compatibility

Migration is compatibility-first and versioned.

The first adapter preserves the current public body fields and current `outputFormat` default. `creatorStyleConfig` remains accepted for wire compatibility, but it must not be mapped into Workflow Materialization until its semantic owner and target contract are explicitly established.

The first response projector preserves the current ZIP success headers and current deliberate `400` and `404` JSON failure behavior where the new execution result has equivalent meaning.

Authentication is not introduced silently. Current unauthenticated behavior and a future authenticated version must be treated as distinct deployment decisions.

Mojibake or accidental raw exception text is not a protected compatibility guarantee. It must be replaced by stable safe public error text when the projector is introduced.

## 17. Migration Plan

Migration proceeds through independent, reviewable commits:

1. Add the multi-cut Route Contract Foundation.
2. Add the multi-cut Request Adapter Foundation with compatibility fixtures.
3. Add the multi-cut Result Projector Foundation with an explicit status and error matrix.
4. Add route-boundary composition that injects authentication, adapter, execution, and projector capabilities.
5. Migrate `app/api/multi-cut/route.ts` to parsing, boundary invocation, and response construction only.
6. Remove the route's filesystem, workspace, FFmpeg, ZIP, archive-reading, timeout, retry, response-ownership, and cleanup code after regression and compatibility validation.

Each phase must be independently revertible. Route payload replacement and infrastructure removal must not be combined as a big-bang change.

## 18. Rejected Alternatives

The following alternatives are rejected:

- using `WorkflowMaterializationEntryInput` as the HTTP DTO;
- returning `WorkflowMaterializationEntryResult` as the HTTP response;
- storing HTTP status in a Workflow result;
- passing `Request`, `NextRequest`, `Response`, or `NextResponse` inward;
- allowing the route to call internal Workflow or Materialization runtimes directly;
- manually reconstructing workflow results in the route;
- allowing request adapters or result projectors to access the filesystem;
- creating a generic HTTP contract without demonstrated reuse;
- replacing the public payload in one migration;
- migrating without an explicit compatibility projector and regression suite.

## 19. Risks

- The current route returns a ZIP, while Workflow Materialization may not expose an equivalent response-owned representation.
- `creatorStyleConfig` has no confirmed Workflow Materialization mapping.
- The current route has no authentication, while trusted materialization contexts may require authenticated identity.
- Legacy status and error behavior is only partially normalized.
- Temporary input discovery is an implicit dependency that cannot move into the Request Adapter.
- Binary ownership, copy isolation, and cleanup timing can regress if archive bytes are not owned before cleanup.
- Moving execution while preserving payload compatibility may reveal previously hidden invalid inputs.

## 20. Test Strategy

The future foundations require:

- contract boundary tests proving type-only transport contracts and forbidden dependency absence;
- request-adapter tests for versions, defaults, deterministic mapping, missing trusted context, no inference, and copy isolation;
- result-projector tests for every workflow outcome, HTTP status mapping, API error mapping, headers, binary ownership, sensitive-data exclusion, and copy isolation;
- route tests for malformed JSON, authentication boundary behavior, compatibility request parsing, successful ZIP response, mapped failures, and framework response construction;
- compatibility snapshots for legacy request fields, `outputFormat` behavior, ZIP headers, and approved error bodies;
- reverse-dependency tests proving Workflow and shared foundations do not import route-specific modules.

## 21. Implementation Sequence

The next foundation is the multi-cut Route Contract Foundation at `lib/server/multiCutRoute/types.ts` with its type-only boundary test and architecture-aligned documentation.

After that, implement the Request Adapter, then the Result Projector, then the DI composition boundary, and only then modify the Next.js route. No phase may require edits to completed Workflow Materialization contracts.

## 22. Stop Conditions

Stop before Route integration if:

- the exact meaning or target of `creatorStyleConfig` remains necessary for execution but undecided;
- Workflow Materialization cannot produce or reference a response-owned ZIP/public payload using existing contracts;
- authentication rollout and trusted-context sourcing are not explicitly decided;
- the complete workflow-result-to-HTTP status and public error matrix is not approved;
- route filesystem, media, packaging, and cleanup responsibilities cannot be satisfied by existing foundations;
- mapping requires inferred business identity, ownership, workflow scope, authorization evidence, path, filename, or provider state;
- any completed Workflow, Materialization, HTTP, authentication, or composition contract must be changed merely to accommodate framework transport.

## 23. Non-goals

This decision does not:

- implement the Route Contract, Request Adapter, Result Projector, composition, or route migration;
- change the current route or its current runtime behavior;
- define authentication policy or enable authentication;
- define creator-style business semantics;
- add filesystem, workspace, media, packaging, cleanup, upload, provider, retry, or persistence behavior;
- create a new generic HTTP foundation;
- modify Workflow Materialization contracts or execution;
- authorize Git staging, commit, or push.
