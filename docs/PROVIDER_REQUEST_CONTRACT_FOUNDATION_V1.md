# Provider Request Contract Foundation V1

## 1. Status

Status: Complete

Version: 1.0

This document describes the implemented Provider Request Contract Foundation V1. It does not promise future runtime integrations as current capabilities.

## 2. Purpose

The foundation provides a provider-neutral, type-only source of truth for:

- the supported provider operation identifiers;
- the materialized provider request envelope;
- the executable provider request alias;
- the Reference Vocal request DTO;
- the Reference Music request DTO;
- the Reference MV request DTO; and
- request-owned supporting literal and instruction types.

It separates durable request shapes from Provider Client lifecycle types and Reference Provider Adapter implementations.

## 3. Ownership

`lib/providerRequests/types.ts` owns:

- `ProviderOperation`;
- `MaterializedProviderRequest<TBody>`;
- `ExecutableProviderRequest<TBody>`;
- all `ReferenceVocal*` request types;
- `MusicLyricsMode`;
- all `ReferenceMusic*` request types; and
- `ReferenceMVGlobalDirection`, `ReferenceMVSceneInstruction`, and `ReferenceMVRequest`.

These definitions are the sole V1 source of truth for their shapes.

## 4. Non-Ownership

The Provider Request Contract does not own:

- Provider Client lifecycle or execution;
- credentials or credential resolution;
- provider jobs, polling, cancellation, or retry policy;
- transport requests, responses, or error handling;
- asset upload;
- request materialization behavior;
- Provider Adapter validation, building, or normalization;
- workflow orchestration;
- HTTP routes or fetch clients;
- persistence;
- filesystem access; or
- runtime registries.

## 5. Dependency Direction

The implemented dependency direction is:

```text
assets / director decision / emotion / MV contracts
                         |
                         v
              Provider Request Contract
                         |
               +---------+---------+
               |                   |
               v                   v
       Provider Client types   Materializers
                                   |
                                   v
                         Reference Provider Adapters
                                   |
                                   v
                      Provider runtime / Workflow
```

Consumers may depend on the Provider Request Contract. The Provider Request Contract must not depend on consumers.

## 6. Permitted Dependencies

V1 permits only type-only imports from:

- `lib/assets/types.ts`;
- `lib/directorDecisionEngine.ts`;
- `lib/emotionEngine.ts`; and
- `lib/mvContracts.ts`.

Adding another dependency requires a contract-boundary review. A permitted dependency must not create a reverse dependency on `lib/providerRequests`.

## 7. Forbidden Dependencies

The contract must not import:

- `lib/providerClients/**`;
- `lib/materializers/**`;
- Reference Provider Adapter implementations;
- `lib/providerUploads/**` or related upload modules;
- workflows or Reference Workflow modules;
- HTTP, fetch, or route modules;
- filesystem modules;
- persistence modules; or
- environment readers.

Dynamic imports and `require()` are forbidden.

## 8. Type-Only Policy

The module exports TypeScript types only.

It must not export executable functions, classes, enums, constants, mutable objects, registries, or initialization code. It must not perform work at module load time.

The following are forbidden:

- runtime side effects;
- network or HTTP access;
- upload execution;
- persistence;
- credential access;
- retry execution;
- workflow orchestration;
- provider execution;
- filesystem access;
- environment access;
- clock reads;
- random-value generation; and
- mutable global state.

## 9. ProviderOperation

`ProviderOperation` is the V1 allowlist:

```text
generate-vocal
generate-music
generate-mv
```

Adding, removing, or renaming an operation is a versioned contract change.

## 10. MaterializedProviderRequest

`MaterializedProviderRequest<TBody>` is a sensitive provider-neutral envelope containing:

- request version;
- provider identifier;
- provider API version;
- provider operation;
- typed body;
- materialized asset-access count;
- optional earliest asset expiry; and
- a complete materialization proof with zero unresolved assets.

The type does not authorize provider submission. It does not contain credentials, retry policy, correlation policy, job state, or transport behavior.

## 11. ExecutableProviderRequest

`ExecutableProviderRequest<TBody>` is a V1 type alias of `MaterializedProviderRequest<TBody>`.

The alias preserves the existing public vocabulary. It does not introduce an execution capability or runtime object.

## 12. Vocal Request DTO

`ReferenceVocalRequest` and its supporting Vocal types describe the adapter-produced Vocal request shape. The DTO includes:

- schema version;
- language and lyrics;
- duration and output format;
- performance direction;
- section timeline;
- peak and outro treatment; and
- optional logical asset identifiers.

The Contract does not validate, build, materialize, submit, or normalize the request.

## 13. Music Request DTO

`ReferenceMusicRequest` and its supporting Music types describe the adapter-produced Music request shape. The DTO includes:

- schema version;
- duration and output format;
- output and lyrics modes;
- tempo;
- performance direction;
- section timeline;
- peak and afterglow treatment;
- optional lyrics; and
- an optional logical reference-audio identifier.

`MusicLyricsMode` is owned by this Contract because it is part of the request DTO shape.

## 14. MV Request DTO

`ReferenceMVRequest`, `ReferenceMVGlobalDirection`, and `ReferenceMVSceneInstruction` describe the adapter-produced MV request shape. The DTO includes:

- schema version;
- duration and output settings;
- a logical audio asset identifier;
- global visual direction;
- scene instructions;
- peak treatment; and
- afterglow treatment.

The Contract does not own scene planning, scene gating, Adapter behavior, or Provider execution.

## 15. Compatibility Re-Export Policy

Existing public type import paths remain supported through type-only re-exports:

- `lib/providerClients/types.ts` re-exports the provider operation and request-envelope types;
- `lib/providers/referenceVocalAdapter.ts` re-exports Vocal request types;
- `lib/providers/referenceMusicAdapter.ts` re-exports Music request types;
- `lib/providers/referenceMVAdapter.ts` re-exports MV request types; and
- `lib/providers/types.ts` re-exports `MusicLyricsMode`.

Compatibility re-exports must not duplicate the type definitions and must not introduce runtime exports.

## 16. DTO Shape Compatibility

The extraction changes ownership and import direction only. It does not change:

- property names;
- required or optional properties;
- literal values;
- nested object shapes;
- array element shapes;
- schema versions;
- provider identifiers;
- provider API versions; or
- Adapter runtime behavior.

Consumers must not reinterpret the extraction as a schema upgrade.

## 17. Versioning Policy

V1-compatible additions may be made only when they preserve all existing assignability and security boundaries.

The following require an explicit versioned contract decision:

- removal or rename of an exported type;
- narrowing or widening that changes accepted DTOs;
- operation allowlist changes;
- request schema-version changes;
- materialization-proof changes;
- changes to sensitivity ownership; or
- addition of runtime capabilities.

Compatibility aliases must not be used to conceal an incompatible DTO change.

## 18. Validation Policy

The foundation is validated through:

- static inspection of the Contract source;
- enforcement of the permitted type-only dependency allowlist;
- rejection of forbidden runtime and upper-layer dependencies;
- verification of required type exports;
- verification of tracked compatibility re-exports;
- detection of duplicate tracked DTO definitions;
- Materializer capability regression tests; and
- TypeScript compilation using the repository `tsconfig.json`.

Boundary validation reads repository source only. It does not modify source files or create temporary repository artifacts.

## 19. Current Integration

The tracked Reference MV Adapter imports its request types from this Contract and preserves its previous type exports.

The tracked shared Provider types module imports and re-exports `MusicLyricsMode`.

Provider Client, Vocal Adapter, Music Adapter, and Materializer worktree consumers already reference the Contract, but their untracked implementations are not part of the Provider Request Contract Foundation commit boundary.

## 20. Future Integration

Future Provider Client and Materializer commits may consume this Contract without moving request ownership back into their modules.

Future work must not be documented as currently implemented until its own implementation and validation are complete. In particular, this foundation does not provide:

- a Production Provider Client;
- Production credentials;
- Provider transport;
- upload execution;
- workflow composition; or
- deployment readiness.

## 21. Security Boundary

The Contract contains structural type information only. It must not expose:

- credential values;
- connection strings;
- signed URLs;
- upload tokens;
- provider job references;
- raw provider responses;
- request payload values;
- filesystem paths; or
- environment values.

Sensitivity is preserved by the `Sensitive` request-envelope type and is not weakened by compatibility re-exports.

## 22. Foundation Boundary

The Provider Request Contract Foundation commit owns exactly:

- the type-only Contract source;
- tracked Reference MV type import and compatibility re-export changes;
- tracked `MusicLyricsMode` ownership and compatibility re-export changes;
- the Contract boundary test; and
- this document.

Provider Client, Vocal Adapter, Music Adapter, and Materializer implementations remain outside this commit boundary.
