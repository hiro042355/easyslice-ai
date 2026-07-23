# Input Materialization Foundation V1

## Purpose and placement

This foundation places one validated source artifact into an already-existing execution workspace and returns only an opaque materialized-artifact reference.

`Media Execution Adapter -> Input Materialization Capability -> Filesystem Input Materialization Adapter -> explicit locator/filesystem capabilities`

Temporary Workspace owns workspace lifecycle. This adapter owns neither workspace creation nor cleanup.

## Ownership

Owned responsibilities are request, policy, ownership, and opaque-reference validation; source and workspace resolution; regular-file and workspace-directory validation; destination containment and collision checks; one exclusive file copy; safe result normalization; deterministic audit; immutability; and copy isolation.

Non-owned responsibilities are workspace reservation/lifecycle/cleanup, upload/download/remote fetch, media probing or conversion, FFmpeg/ffprobe/process execution, archive creation, output ingestion, HTTP projection, retry scheduling, cancellation execution, timeout execution, persistence, and workflow progression.

## Public contract and opaque references

The contract exposes source, workspace, and materialized artifact identities only as opaque references. It exposes safe classifications, reason codes, retry advice, availability, and deterministic audit. It never exposes a path, filename, extension, drive, separator, filesystem metadata, binary body, stream, command, stdout/stderr, provider locator, URL, exception, message, or stack.

References use `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`. Validation occurs before locator use or path construction.

## Explicit dependency injection

The runtime receives:

- a source artifact locator, mapping an opaque source identity to an internal location;
- a workspace locator, mapping an opaque workspace identity to an internal location;
- an optional filesystem capability implementing inspection and exclusive copy.

Internal locations never cross the decision boundary. There is no singleton, default registry, ambient locator, or hard-coded source/workspace location.

## Validation and ownership order

The deterministic sequence is request, policy, ownership, reference, source resolution, workspace resolution, source inspection, workspace inspection, containment, collision, copy, and projection. Failure stops later stages; eligible capabilities are invoked at most once.

Tenant, ownership, workspace, and operation projections must agree. Mismatches return only `ownership-mismatch`; expected and actual identities are not disclosed.

## Source and destination safety

The source must exist and be a regular file according to `lstat` semantics. Directories, symbolic links, and other entries are rejected. The workspace must already exist and be a directory.

The destination is resolved beneath the resolved workspace. Containment uses `path.relative`, rejects an empty relative value, parent traversal, and absolute relative results, and therefore avoids sibling-prefix mistakes. Opaque validation provides an earlier independent traversal barrier.

V1 supports only `reject-existing`. Copy uses exclusive creation (`COPYFILE_EXCL`) so no implicit overwrite occurs. A pre-copy collision check improves diagnostics; the exclusive copy remains the collision authority. This does not claim atomic end-to-end materialization or eliminate all filesystem TOCTOU conditions. A failed platform copy may require infrastructure-specific recovery; the adapter never reports false success.

## Error and retry normalization

Raw filesystem and locator failures are collapsed into safe source/workspace unavailability, dependency failure, existing destination, or copy failure. Node error codes may be inspected internally but are never projected.

- materialized: `retry-not-required`
- invalid/rejected: `retry-not-allowed`
- already-exists: `retry-requires-policy-change`
- unavailable: `retry-safe`
- failed: `retry-external-policy`

The adapter makes one attempt and never schedules or executes retries.

## Audit, immutability, and determinism

Audit contains sequence, stage, safe classification, reason, and retry classification only. Decisions, nested audit entries, and returned references are deeply frozen. Inputs and locator outputs are copied at capability boundaries. No clock, environment, timer, randomness, UUID, or global mutable registry participates, so identical inputs and capability outcomes yield identical decisions.

## Security boundary and limitations

No network, database, provider SDK, shell, process, archive, directory creation, cleanup, binary read/write API, or stream is used. V1 handles one local regular file only. It does not hash, deduplicate, probe, transform, batch, recursively copy, or materialize directories. It does not guarantee crash-atomic copy or recovery of a partially written platform-level copy.

## Replacement and testing

Future source/workspace resolvers or filesystem adapters may replace injected capabilities without changing the opaque public contract. Tests cover type-only boundaries, forbidden runtime dependencies, dangerous references, ownership, source/workspace types, symlinks, containment, collision/copy errors, sensitive-value suppression, deep freeze, isolation, determinism, and real-file copy/cleanup.

## Commit slicing

Recommended history:

1. contract, contract boundary, and this document;
2. filesystem runtime and runtime/behavior tests;
3. multi-cut integration requirements.
