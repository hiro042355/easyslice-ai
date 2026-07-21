# Materializer Registry Foundation V1

## 1. Purpose
This contract defines the immutable descriptor registry for the three Reference Request Materializers.

## 2. Status
Foundation V1 is an approved static discovery contract, not a production runtime binding.

## 3. Scope
The registry owns a catalog, deterministic listing, exact lookup, uniqueness, copy isolation, and safe metadata.

## 4. Current Gap
The Materializer Contract and Reference Runtime existed without a bounded descriptor discovery layer.

## 5. Terminology
A descriptor is safe metadata. A registration associates materializer identity, profile, and availability.

## 6. Architecture Decision
V1 is descriptor-only. Executable instances, factories, and runtime dispatch are excluded.

## 7. Descriptor-only Ownership
The registry owns registration, ordering, availability, uniqueness, list, and lookup behavior.

## 8. Explicit Non-ownership
It does not own Provider selection, credentials, endpoints, network calls, Workflow binding, retries, persistence, or execution.

## 9. Dependency Direction
The registry depends on the Materializer Contract, immutable Reference Profiles, and pure copy/freeze utilities. Runtime Materializers do not depend on it.

## 10. Descriptor Model
Descriptors expose only materializer identity, Provider compatibility metadata, operation, profile version, and static availability.

## 11. Descriptor Field Ownership
Materializer identity owns `materializerId` and `materializerVersion`; Profiles own Provider compatibility fields; the registry owns `availability`.

## 12. Reference Profile Projection
`providerId`, `providerApiVersion`, `operation`, and `profileVersion` are projected from immutable Profiles, not duplicated literals.

## 13. Materializer Identity
`materializerId` is stable descriptor identity. `materializerVersion` must match the associated Profile.

## 14. Availability Semantics
`available` means registered and eligible for static descriptor discovery only.

## 15. Disabled Semantics
`disabled` remains visible through list and ID audit lookup but is excluded from provider-operation selection.

## 16. Catalog Construction
The catalog is synchronously constructed from fixed registrations during module initialization and deeply frozen.

## 17. Duplicate Policy
Initialization rejects duplicate `materializerId` and `(providerId, operation)` keys. First-entry-wins is forbidden.

## 18. Descriptor Identity
Only `materializerId` is descriptor identity. Versions and Provider fields are not globally unique.

## 19. Selection Key
The selection key is the exact `(providerId, operation)` pair and is unique in V1.

## 20. List API
`listMaterializers()` returns all descriptors in Vocal, Music, MV order as a fresh deeply frozen copy.

## 21. ID Lookup API
`getMaterializerDescriptorById()` performs exact lookup and may return available or disabled descriptors.

## 22. Provider and Operation Lookup API
`getMaterializerDescriptor()` performs exact lookup and returns only an available descriptor.

## 23. Unknown and Invalid Input
Unknown, empty, oversized, newline-bearing, or NUL-bearing values return `undefined`; normalization and fallback are forbidden.

## 24. Ordering and Determinism
Catalog order is fixed. Clock, randomness, environment, network, and caller state cannot affect results.

## 25. Copy Isolation
Every public result is detached from internal registrations and sibling results.

## 26. Immutability
Internal and returned arrays and descriptors are deeply frozen.

## 27. Security Boundary
The module is synchronous, local, secret-free, and has no filesystem, network, logging, timer, or environment access.

## 28. Sensitive Data Exclusion
Descriptors contain no credentials, endpoints, request bodies, asset IDs, access URLs, tokens, or Provider handles.

## 29. Runtime Boundary
The registry imports no executable Materializer and cannot call `materialize()`.

## 30. Provider Readiness Non-claim
Availability does not assert Provider, endpoint, credential, quota, network, or submission readiness.

## 31. Production Readiness Non-claim
Registration does not assert deployment, Composition Root, Workflow, or production readiness.

## 32. Factory Exclusion
Factories, `createMaterializer()`, executable lookup, and mutable registration APIs are excluded.

## 33. Future Runtime Binding
A future executable binding requires a separately versioned Runtime Binding Contract keyed by `materializerId`.

## 34. Backward-compatible Extension
Future binding preserves V1 descriptor shapes and lookup semantics. Functions must not enter JSON-copy descriptor data.

## 35. Versioning
V1 uses `materializerVersion` and `profileVersion`; no unused registry, catalog, or descriptor version is added.

## 36. Failure Policy
Invalid lookup returns `undefined`. Invalid static registration fails initialization with a safe value-free error.

## 37. Test Matrix
Tests cover content, ordering, Profile projection, lookup, disabled behavior, duplicates, freeze, and mutation isolation.

## 38. Static Boundary Matrix
Static tests reject Workflow, Provider Client, upload, ingestion, executable Materializer, dynamic import, environment, filesystem, and network dependencies.

## 39. Readiness Matrix
Descriptor discovery is ready. Runtime binding, Provider readiness, Production Composition, and deployment are not started.

## 40. Commit Boundary
The Foundation contains the Registry module, Registry boundary and behavior tests, and this contract only.

## 41. Non-goals
Provider routing, capability negotiation, dynamic plugins, runtime dispatch, health checks, and persistence are non-goals.

## 42. Open Decisions
Executable binding, disabled lifecycle ownership, and future multi-Materializer selection require separate versioned decisions.

## 43. Final Decision
Foundation V1 is a descriptor-only, immutable, lookup-only Registry. Factory inclusion is rejected.
