# Media Execution Adapter Foundation V1

## Purpose and ownership

The Media Execution Adapter sequences one abstract media execution attempt through explicitly injected workspace, materialization, process, packaging, and cleanup capabilities. It owns structural, ownership, and policy validation; stage sequencing; invocation control; safe failure classification; deterministic audit; retry projection; and immutable results.

It does not own filesystem access, path discovery, temporary-directory creation, process execution, FFmpeg, ffprobe, ZIP implementation, binary I/O, HTTP projection, workflow orchestration, retry execution, clocks, or persistence.

## Dependency direction

`Media Operation Runtime -> Media Execution Adapter -> Infrastructure Capability Contracts`

The Contract depends type-only on Media Operation classification. Infrastructure implementations depend on the capability contracts; lower foundations never import Media Execution.

## Opaque references

Workspace, input artifact, output artifact, and package artifact records contain opaque references and ownership references only. No path, filename, URL, bucket, object key, provider locator, command, argument, stdout, stderr, signal, or binary type is represented.

## Stages

Execution is ordered as `workspace-prepare`, `input-materialize`, `media-process`, optional `package-output`, `collect-output`, and `cleanup`. Packaging is required for `zip-export`; other V1 operations may omit it.

Each capability is invoked at most once. Invalid input, ownership mismatch, policy rejection, pre-classified cancellation, and pre-classified timeout invoke no capability. A failed stage prevents all later execution stages. Once a workspace exists, cleanup remains eligible.

## Timeout, cancellation, and retry

Timeout and cancellation arrive as externally classified projections. The adapter creates no timer or abort controller and performs no elapsed-time calculation. Invalid and rejected results are not retryable; unavailable is retry-safe; cancelled requires a new request; failed and timed-out defer to external retry policy. The adapter never retries.

## Cleanup

Cleanup is an explicit stage. It receives only an opaque workspace reference and runs at most once after workspace creation. Cleanup failure is recorded independently and never overwrites the main execution classification.

## Safe result and audit

The safe result contains the operation, execution and retry classifications, safe reason, output count, package availability, cleanup classification, opaque output/package references, and deterministic audit. It is an internal result, not an HTTP response.

Audit contains sequence, stage, operation, decision, reason, cleanup, and retry classifications only. It excludes every reference and identity value as well as infrastructure output and exceptions.

## Immutability and security

Capability inputs and returned records are copied and deeply frozen. No ambient state, singleton, clock, random source, timer, filesystem, network, process, environment, provider, database, HTTP, or workflow dependency is used.

## Versioning

Records use explicit `1.0` versions. Infrastructure implementations and server composition are separate foundations. Adding raw infrastructure details or weakening ownership, invocation, cleanup, or audit rules requires a new contract version.
