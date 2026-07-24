# ZIP Packaging Infrastructure Adapter Foundation V1

## Purpose and placement

This foundation packages already-generated output artifacts into one ZIP archive.

`Media Execution -> Packaging Capability -> ReferenceZipPackagingAdapter -> output locator / archive locator / filesystem / archive builder`

It owns request validation, output discovery, regular-file validation, deterministic archive-entry naming validation, archive creation, destination collision rejection, exclusive write, safe normalization, immutable decisions, and deterministic audit.

It does not own output generation, workspace creation/lifecycle/cleanup, input materialization, FFmpeg execution, output ingestion, upload/download, HTTP projection, retry execution, provider communication, persistence composition, or workflow progression.

## Contract and opacity

The type-only contract exposes opaque output and archive references, a fresh `Uint8Array` archive-byte projection on successful packaging, output count, safe classifications, safe reason codes, retry advice, and deterministic audit. It never exposes an archive/workspace path, filename or directory list, ZIP implementation, stream, Buffer, filesystem exception, message, or stack.

Opaque identities use a restricted alphanumeric, underscore, and hyphen alphabet. Invalid or duplicate output identities are rejected before dependency invocation.

## Explicit dependencies

The runtime receives output and archive locators. Filesystem and archive-builder capabilities have reference defaults and remain explicitly replaceable for tests or production composition. Locator results are copied and never projected publicly.

The output locator supplies an internal location and archive-entry name. Entry names must be safe leaf names and unique. The archive locator receives the opaque archive reference and deterministic `${operationIdentity}.zip` name. It owns location mapping, not workspace lifecycle.

The archive builder is the authoritative source of V1 response bytes. The adapter writes one copy to the selected archive location and returns a separate fresh copy in the successful decision. It never rereads the written archive to construct the response projection.

## Naming and ordering

V1 naming is `operationIdentity.zip`; clocks, timestamps, UUIDs, and randomness are forbidden. Output order in the request determines ZIP entry order. Directory enumeration is not used.

## Collision and write policy

V1 supports only `reject-existing`. A pre-write inspection improves safe classification, and the final write opens the destination with `wx` so an existing archive is never overwritten. This does not claim complete elimination of filesystem TOCTOU or crash-atomic archive persistence. A platform write failure may leave an incomplete newly-created archive for external recovery; cleanup is outside this adapter.

## Error normalization and retry

Missing/non-regular outputs, locator failure, collision, archive build failure, and archive write failure are mapped to safe reasons. Raw paths, Node error codes, exceptions, and archive-library failures never cross the boundary.

- packaged: `retry-not-required`
- invalid/rejected: `retry-not-allowed`
- already-exists: `retry-requires-policy-change`
- unavailable: `retry-safe`
- failed: `retry-external-policy`

No retry loop or scheduler is implemented.

## Immutability, determinism, and security

Decision, archive projection, audit collection, and audit entries are deeply frozen and independently allocated. Archive bytes remain an owned typed-array value and never share backing memory with builder or filesystem inputs. Mutable locator, filesystem, and builder outputs are copied. There is no child process, FFmpeg, network, provider, HTTP, database, environment read, clock, random value, UUID, directory creation, or cleanup.

## Testing and replacement

Tests lock the type-only contract and runtime infrastructure boundary. Behavior coverage includes real deterministic ZIP creation, ordering/content, invalid and duplicate output rejection, collision preservation, missing/non-regular output, locator/build/write normalization, unsafe entry names, deep freeze, isolation, and determinism.

## Commit slicing

Recommended commits:

1. contract, contract boundary, and this document;
2. reference runtime and runtime/behavior tests;
3. multi-cut integration requirements.
