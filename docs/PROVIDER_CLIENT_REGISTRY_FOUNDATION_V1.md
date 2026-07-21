# Provider Client Registry Foundation V1

## 1. Status, version, and purpose

Status: implemented and validation-gated. Version: V1.

This foundation publishes an immutable static catalog of Provider Client
descriptors and a defensive lookup for the Reference Provider Client fixture.

## 2. Exact boundaries

Production:

- `lib/providerClients/providerClientRegistry.ts`

Tests:

- `tests/providerClients/providerClientRegistryBoundary.test.ts`
- `tests/providerClients/providerClientRegistry.test.ts`

## 3. Static registry design

Registry content is fixed during module initialization. There is no dynamic
registration, unregister, reset, environment registration, credential
registration, network discovery, mutable Map, or mutable Set.

## 4. Descriptor ownership

The Reference descriptor owns registry contract and capability versions,
provider ID, client ID, client and provider API versions, transport capability,
opaque endpoint configuration reference, static availability, and a factory
binding. It does not own an instantiated client.

The descriptor, nested capability, internal catalog, and exported catalog are
frozen. Snapshot construction preserves the factory binding while defensively
copying and freezing data fields.

## 5. Lookup semantics

Lookup is by safe client ID. A known ID returns a fresh frozen snapshot.
Unknown, empty, whitespace-only, URL-like, URI-like, path-like, or CRLF-bearing
IDs return `undefined`. Internal catalog objects are never returned directly.

Repeated lookups are deterministic and independent. Caller mutation cannot
change the internal catalog, nested capability, later lookup, or catalog size.

## 6. Factory binding

The descriptor binds `createReferenceProviderClient` without invoking it during
module initialization. Every call creates an independent Reference client with
instance-local idempotency state. The registry stores no client instance.

## 7. Availability semantics

`availability: "available"` means only that the deterministic Reference fixture
factory is present. It does not mean:

- production credential readiness;
- actual provider endpoint availability;
- environment or deployment readiness;
- Workflow readiness; or
- production transport readiness.

## 8. Non-ownership

This foundation owns no provider selection, fallback, priority routing,
credential resolution, transport execution, retry/poll loop, Adapter Registry,
Provider Registry, Workflow, Materializer, Upload, Output Ingestion,
persistence, or dynamic provider loading.

## 9. Foundation relationships

The Registry consumes the tracked Reference Provider Client Runtime Foundation
and Provider Client Contract Foundation. It does not modify their contracts or
runtime behavior. The broader dynamic Provider Registry remains separate.

## 10. Security and purity

The module contains no API key, token, authorization header, credential value,
secret store, log, environment access, filesystem, network, HTTP, persistence,
clock, randomness, crypto randomness, timer, mutable global state, import-time
client creation, or external registration side effect.

## 11. Versioning and validation

Descriptor contract, capability version, lookup key, or availability meaning
changes require a versioned decision. Validation requires the two exact tests,
Runtime and Contract compatibility regressions, scoped TypeScript compilation,
and an exact-file snapshot dependency audit.

## 12. Exact commit candidate and future work

The exact candidate is the production file, two tests, and this document. A
future dynamic Provider Registry Foundation may add policy-controlled provider
selection and configuration discovery under a separate contract. It must not
reinterpret this Reference availability as production readiness.
