# Media Execution Composition Foundation V1

## Purpose

Media Execution Composition connects existing workspace, input materialization, FFmpeg process, ZIP packaging, response representation, and cleanup capabilities. It owns their deterministic order and no infrastructure implementation.

## Architecture

The order is reserve and prepare workspace, materialize input, execute FFmpeg, package outputs, copy the archive into response-owned bytes, clean the workspace, and project a safe final decision.

## Ownership

The Composition owns sequencing, dependency validation, primary-result precedence, cleanup degradation projection, ordered audit, immutable decision projection, and one response-owned `Uint8Array`.

## Non-Ownership

It does not implement process spawning, command execution, ZIP construction, workspace creation, filesystem traversal, file deletion, HTTP, Next.js, routes, provider access, retry algorithms, timeout algorithms, or cleanup algorithms.

## Dependency Direction

The Composition imports only the type contracts of Temporary Workspace, Input Materialization, FFmpeg Process, and ZIP Packaging. Every executable dependency is injected. There is no default dependency, singleton, registry, or ambient environment lookup.

## Public Contract

`MediaExecutionCompositionInput` carries the already-authorized requests for each capability. `MediaExecutionCompositionDependencies` carries five injected capabilities. `MediaExecutionCompositionDecision` exposes only safe classifications, a response-owned archive when successful, cleanup classification, and ordered audit.

## Response Ownership

ZIP Packaging returns an opaque archive reference. `ResponseRepresentationCapability` resolves that reference within infrastructure and returns bytes. Composition copies those bytes into a new `Uint8Array` before cleanup. No workspace, archive, output, or filesystem path crosses the public decision boundary.

## Cleanup Sequencing

After workspace reservation succeeds, the runtime performs all remaining primary work inside `try` and invokes the injected workspace cleanup capability from `finally`. Cleanup therefore follows success, materialization failure, FFmpeg failure, timeout, cancellation, packaging failure, response-read failure, and unexpected dependency failure.

## Cleanup Failure Policy

Cleanup failure never overwrites the primary classification or reason. It changes only `cleanupClassification` and the cleanup audit entry. A completed primary operation remains completed. A failed, timed-out, or cancelled primary operation retains that classification.

## Failure Semantics

Missing dependencies are invalid before execution. Workspace failures stop later capabilities. Materialization, FFmpeg, packaging, and response-representation failures stop subsequent primary stages. Thrown dependency errors become safe `dependency-failure`; raw errors are not retained.

## Security Boundary

The decision excludes paths, filesystem exceptions, child-process objects, Node `Buffer`, streams, command output, credentials, provider data, and stacks. Audit contains only versioned stage, classification, reason, cleanup classification, and deterministic sequence.

## Determinism and Immutability

Capability invocation and audit ordering are fixed. The runtime uses no clock, random source, timer, network, or process environment. Decisions and audit containers are deeply frozen, while response bytes are isolated copies owned by each decision.

## Versioning

All public Composition structures use version `1.0`. Adding streaming response ownership, persisted response artifacts, retry scheduling, or crash recovery requires a separately versioned contract.

## Validation

Boundary tests prove the absence of infrastructure implementation and forbidden imports. Behavior tests cover success, every primary failure boundary, timeout, cancellation, cleanup after terminal outcomes, cleanup degradation, missing dependencies, deterministic ordering, deep freeze, and copy isolation.
