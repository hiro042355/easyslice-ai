# Multi-cut Media Operation Integration Requirements V1

## Scope

`app/api/multi-cut/route.ts` remains unchanged by this document. The checklist defines the future extraction of media infrastructure from the route without adding command, path, stdout, stderr, or process details to Production Contracts.

## Required integration checklist

1. **FFmpeg execution ownership:** Actual FFmpeg and ffprobe process execution belongs to a later media infrastructure layer, not the route, core Media Operation Runtime, HTTP Adapter, or workflow.
2. **FFmpeg adapter ownership:** An explicitly injected FFmpeg adapter owns executable discovery, argument construction, process invocation, exit observation, and infrastructure-specific failure normalization.
3. **ZIP ownership:** ZIP assembly is an infrastructure concern and is not owned by Media Operation Contract or its reference runtime.
4. **ZIP adapter ownership:** An explicitly injected archive adapter owns archive entry creation, binary assembly, and archive-specific errors.
5. **Temporary workspace ownership:** An injected workspace capability owns temporary workspace allocation, isolation, lifecycle reference creation, and release.
6. **Cleanup ownership:** An injected cleanup capability owns cleanup execution. Media Operation Runtime may project a cleanup requirement but does not delete files or directories.
7. **Input artifact materialization boundary:** Opaque upload references are materialized into infrastructure-local inputs only inside the injected materialization/workspace boundary. Local paths never return through the Production Contract.
8. **Output artifact reference boundary:** Generated outputs cross the infrastructure boundary only as opaque artifact references. Filesystem paths, archive paths, buckets, object keys, and signed URLs are forbidden.
9. **stdout normalization:** Raw stdout remains inside the infrastructure adapter and is reduced to an allowlisted result classification or safe reason code.
10. **stderr normalization:** Raw stderr remains inside the infrastructure adapter and is reduced to an allowlisted failure classification or safe reason code.
11. **Exit-code classification:** Process exit codes are interpreted only by the FFmpeg adapter and projected as fixed accepted, completed, failed, rejected, or unavailable classifications.
12. **Timeout boundary:** Timeout duration and policy may be declarative inputs, but timers, process termination, and timeout enforcement belong to the infrastructure adapter.
13. **Cancellation boundary:** Cancellation is checked through an injected capability or immutable marker. Process signalling and termination belong to infrastructure, not the core runtime.
14. **Operation audit:** Audit contains only sequence, stage, operation classification, result classification, and safe reason code.
15. **Sensitive value non-disclosure:** Commands, arguments, paths, filenames, creator-style values, stdout, stderr, credentials, locators, exceptions, stacks, and provider responses are forbidden from public and audit projections.
16. **Boundary order:** The mandatory order is `Auth Boundary -> Upload Boundary -> Sensitive Boundary -> Media Operation Capability`. Media execution must not bypass authentication, upload validation, ownership, or sensitive-scope validation.
17. **HTTP Adapter boundary:** HTTP Adapter receives only a safe Media Operation decision. It does not receive commands, paths, binary process output, infrastructure exceptions, or executable dependencies.
18. **Generation Job Entry boundary:** Generation Job Entry may request or project an operation classification through its public contract, but it does not inspect Media Operation Runtime internals or infrastructure adapters.
19. **Retry policy:** The core runtime recommends retry only for `unavailable`. It does not schedule retries or run retry loops; invalid, rejected, and failed are not automatically retried.
20. **Idempotency relationship:** Request and operation identities are supplied by the caller and carried to the capability boundary. Durable idempotency ownership belongs to a later persistence/workflow integration; the reference runtime does not maintain a request ledger or hidden cache.
21. **Responsibilities removed from Route:** Future route migration removes `child_process`, `os.tmpdir`, filesystem discovery, FFmpeg command assembly, process execution, ZIP generation, temporary output ownership, cleanup execution, and raw stdout/stderr/exception handling.
22. **Migration prerequisites:** Sensitive projection, opaque artifact contracts, FFmpeg/archive/workspace/cleanup adapters, timeout and cancellation contracts, safe failure normalization, and dedicated integration tests must exist before route migration.
23. **Commit slicing proposal:** Contract, reference runtime, this document, each infrastructure adapter, server composition, and route integration are separate commits with independent boundary and behavior validation.

## Planned Route removals

The following responsibilities and dependencies are explicitly scheduled for removal from `app/api/multi-cut/route.ts` during later integration:

- `child_process`
- `os.tmpdir`
- filesystem discovery
- FFmpeg command assembly
- process execution
- ZIP generation
- temporary output ownership
- cleanup
- raw stdout handling
- raw stderr handling
- raw exception handling

Their removal is not performed by this Foundation documentation change.

## Production Contract restriction

Production Contracts must continue to use opaque upload, output, and cleanup references. They must not add fields for commands, shell arguments, local or temporary paths, stdout, stderr, exit-output text, ZIP internals, or raw exceptions.

## Migration prerequisites

1. Commit and validate Sensitive Boundary before Media Operation Contract.
2. Introduce explicit FFmpeg, archive, workspace, materialization, and cleanup adapters.
3. Define declarative timeout and cancellation contracts.
4. Define durable idempotency ownership outside the reference runtime.
5. Normalize process and archive failures at their infrastructure boundary.
6. Compose capabilities through explicit server composition.
7. Add integration tests for ownership, policy, timeout, cancellation, retry recommendation, idempotency classification, cleanup, and non-disclosure.
8. Preserve HTTP behavior through a separately validated route migration.
