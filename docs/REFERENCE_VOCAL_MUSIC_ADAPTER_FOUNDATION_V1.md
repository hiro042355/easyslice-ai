# Reference Vocal / Music Adapter Foundation V1

## 1. Status, version, and purpose

Status: implemented and validation-gated. Version: V1.

This document defines the V1 foundation boundary for the deterministic
Reference Vocal and Reference Music adapters. The adapters translate
provider-neutral request contracts into reference-provider request shapes and
normalize reference-provider responses and failures into shared projections.

## 2. Ownership

The foundation owns:

- immutable capability descriptors;
- input validation;
- deterministic request construction;
- response normalization;
- safe error normalization;
- normalized generation-result projection;
- frozen adapter instances;
- pure helper composition; and
- compatibility type re-exports from the Provider Request Contract.

## 3. Non-ownership

The foundation does not own:

- Provider Client lifecycle or transport;
- credentials or environment configuration;
- HTTP, upload, filesystem, queue, retry, or persistence behavior;
- workflow orchestration;
- materialization;
- provider registration; or
- production runtime composition.

## 4. Dependency direction

The adapters consume shared domain projections, the type-only Provider Request
Contract, shared provider types, and pure adapter utilities. Runtime imports
from Provider Clients, materializers, workflows, upload modules, registries, or
transport modules are forbidden.

- `lib/providerRequests/types.ts` owns the provider-neutral and
  operation-specific request DTOs.
- `lib/providers/types.ts` owns shared provider capability, validation, mapping,
  and normalized-result projections.
- `lib/providers/adapterUtils.ts` is the only runtime dependency and owns pure,
  shared mapping and safe-normalization helpers.

## 5. Capability and validation

Each adapter publishes a versioned, frozen capability descriptor. Validation
must reject unsupported contract or decision-schema versions and invalid
constraints before a provider request is returned. Validation diagnostics are
bounded reason-code projections and must not expose credentials or transport
details.

## 6. Request construction

Request builders are deterministic functions of their explicit input. They
map, clamp, omit, or approximate fields only through documented reason codes.
They do not read clocks, randomness, environment variables, files, network
state, or mutable registries.

The Vocal adapter maps lyrics, language, voice mode, phrasing, expression, and
optional reference assets. The Music adapter keeps `use-lyrics` distinct from
instrumental `none`: lyrics are required in the former and omitted from the
provider request in the latter.

## 7. Normalization and projection

Response normalization produces shared normalized generation results. Output
identifiers are bounded opaque identifiers. Unsafe URL-shaped identifiers,
unapproved metadata keys, and raw provider error messages are not projected.
Error normalization returns a safe category and retry projection without
transport ownership.

## 8. Compatibility

Provider request DTOs remain owned by the Provider Request Contract. The
adapter modules retain type-only compatibility re-exports so existing callers
can migrate without changing runtime dependency direction. Existing adapter
IDs, versions, capability semantics, request DTO shapes, reason codes, and
normalized result shapes remain stable within V1.

## 9. Security boundary

The modules must have no side effects at import time beyond constructing frozen
constant values. Secrets, credentials, raw provider payloads, raw URLs, and
unbounded error messages must not cross the normalized boundary.

## 10. Versioning and readiness

Breaking request, capability, or projection changes require a new versioned
contract or adapter. V1 is ready when boundary tests, behavior tests,
materializer capability regression, scoped TypeScript compilation, and the
exact-file snapshot dependency audit all pass. This foundation alone is not a
Provider Client runtime or production provider integration.

Current production implementation:

- `lib/providers/referenceVocalAdapter.ts`
- `lib/providers/referenceMusicAdapter.ts`

Exact validation tests:

- `tests/providerAdapters/referenceVocalMusicAdapterBoundary.test.ts`
- `tests/providerAdapters/referenceVocalMusicAdapters.test.ts`

The exact commit candidate is those four files plus this document. Future
Provider Client integration will own transport and lifecycle. Future
materializer integration will own asset representation. Neither integration is
implemented or registered by this foundation.
