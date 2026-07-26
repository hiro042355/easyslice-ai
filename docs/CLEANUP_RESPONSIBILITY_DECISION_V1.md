# Cleanup Responsibility Decision V1

## 1. Purpose

This decision fixes cleanup ownership for the Multi-Cut request lifecycle and determines whether another Cleanup Adapter Foundation is required.

## 2. Scope

The scope is request-scoped workspace cleanup after input materialization, FFmpeg processing, and ZIP packaging. Process termination, individual-artifact recovery, crash recovery, retention, and HTTP response lifetime are distinguished rather than grouped under one cleanup abstraction.

## 3. Existing Runtime Inventory

- Temporary Workspace owns opaque reservation, directory preparation, lookup, lifecycle state, and recursive directory cleanup.
- Input Materialization copies one source into an existing workspace and never deletes source or destination.
- FFmpeg Process owns child-process termination for timeout and cancellation, not filesystem deletion.
- ZIP Packaging creates one archive and explicitly leaves output and partial-archive cleanup outside its boundary.
- Media Execution already accepts an injected `CleanupCapability` and sequences one cleanup attempt after a workspace has been acquired.
- Server Composition resolves injected capabilities but does not currently construct concrete workspace or cleanup adapters.
- Workflow and Operation Pipeline aggregate retry/reconciliation advice; they do not perform filesystem cleanup.

## 4. Current Route Cleanup Audit

The unchanged Route stores each successfully generated output path in `outputPaths`. Its `finally` block calls `unlink` for those paths in insertion order and suppresses every unlink failure. The fixed downloaded input is never deleted. Outputs are cleaned on success, FFmpeg failure after a path was recorded, ZIP failure, and response construction completion, but a failed FFmpeg output is not recorded until after execution and therefore may remain. The ZIP exists only as an in-memory Buffer and is not persisted. Cleanup occurs before the handler returns its `Response`, not after response transmission. Cleanup errors are not exposed, audited, retried, or allowed to replace the primary result. Ownership is ambiguous because output generation, packaging, HTTP projection, and cleanup are all Route concerns.

## 5. Cleanup Taxonomy

1. **Workspace lifecycle cleanup:** recursive removal of the request workspace and everything intentionally placed beneath it.
2. **Individual artifact cleanup:** deletion of one output, partial archive, or orphan without releasing the workspace.
3. **Failure recovery:** reconciliation of an interrupted write or partially committed operation.
4. **Startup recovery:** discovery and cleanup of workspaces left by a previous process.
5. **Retention cleanup:** deletion of durable artifacts after a retention period.
6. **HTTP response lifecycle cleanup:** cleanup coordinated with response-owned bytes, streams, or persisted references.
7. **Cancellation cleanup:** workspace release after cancellation has stopped active process work.
8. **Process termination cleanup:** stopping a child process; this is not filesystem cleanup.

## 6. Ownership Matrix

| Responsibility | Current Owner | Recommended Owner | Runtime Capability | Policy Owner | Route Must Remove | New Foundation Required | Reason |
|---|---|---|---|---|---|---|---|
| workspace reserve | Temporary Workspace | Temporary Workspace | `WorkspaceCapability.reserve` | Media Execution composition | yes | no | Existing opaque lifecycle |
| workspace locate | Temporary Workspace / injected locator | Workspace infrastructure | lookup/locator capability | composition | yes | no | Path remains internal |
| input materialize | Input Materialization | Input Materialization | materialize | Media Execution | yes | no | Single bounded copy |
| FFmpeg spawn | current Route / FFmpeg Process | FFmpeg Process | execute | Media Execution | yes | no | Process-only boundary |
| FFmpeg terminate | none explicitly / FFmpeg Process | FFmpeg Process | timeout/Abort handling | caller cancellation policy | yes | no | Must precede filesystem release |
| output generation | current Route / media process | Media process capability | execute media operation | Media Execution | yes | no | Not cleanup |
| archive creation | current Route / ZIP Packaging | ZIP Packaging | package | Media Execution | yes | no | Does not delete inputs |
| workspace release | Temporary Workspace | Temporary Workspace | `WorkspaceCapability.cleanup` | Media Execution composition | yes | no | Recursive removal already exists |
| individual output unlink | Route | normally none | workspace cleanup | Media Execution composition | yes | no | Redundant inside request workspace |
| partial archive cleanup | none | workspace cleanup for request scope | recursive cleanup | Media Execution composition | yes | no | Archive must remain contained |
| cleanup sequencing | Route / Media Execution | Media Execution composition | injected cleanup capability | Media Execution composition | yes | no | Infrastructure must not choose timing |
| cleanup retry decision | none | higher policy | safe cleanup result | Workflow/composition policy | yes | no | No retry loop in adapters |
| cleanup failure projection | Media Execution | Media Execution | cleanup classification/audit | Media Execution contract | yes | no | Primary result remains authoritative |
| crash orphan recovery | none | future Janitor | future enumeration/lease capability | operations policy | no | future C, not V1 | Outside request lifetime |
| retention cleanup | durable stores / none here | future retention owner | retention-specific capability | retention policy | no | not this foundation | Different resource lifetime |
| HTTP response projection | Route | HTTP adapter/composition | response projection | HTTP lifecycle policy | yes | no | Response bytes/reference must outlive workspace |

## 7. Temporary Workspace Capability Analysis

`WorkspaceCapability.cleanup` is the existing release operation. The runtime transitions an eligible `prepared`, `active`, or `failed` workspace through `cleanup-required`, executes `rm(..., { recursive: true, force: false })`, and projects `cleaned` or a safe failure while restoring the preceding state. Invalid references and ownership mismatches stop before filesystem access.

The capability covers materialized inputs, generated outputs, intermediate files, and archive candidates only when composition locates all of them beneath that workspace. Missing workspaces return `not-found`; an already-cleaned workspace rejects another cleanup, so V1 provides a deterministic exactly-once attempt rather than a generally idempotent success. It does not enumerate orphan workspaces, enforce retention, or decide when cleanup runs.

## 8. Media Execution Composition Analysis

Media Execution already owns sequencing after workspace acquisition. Its `#finishWithCleanup` invokes one injected cleanup attempt after materialization failure, process failure, packaging failure, and successful collection. A pre-workspace validation, cancellation, timeout, or workspace-preparation failure has no acquired workspace to release. Cleanup throw is normalized to `unavailable`.

The existing contract preserves the primary classification and reason. Cleanup failure changes only `cleanupClassification` and the final safe audit entry. That behavior is appropriate for both original failures and successful operations. Concrete composition should adapt the existing Temporary Workspace cleanup capability to Media Execution's narrow `CleanupCapability`; it does not require a second deletion implementation.

## 9. Alternative A — No New Cleanup Adapter

Use Temporary Workspace cleanup for recursive request-workspace release. Media Execution composition owns the timing and exactly-one-attempt guarantee. This has one resource owner, correct dependency direction, high testability, containment through opaque workspace identity, and minimal operational complexity. It is sufficient for current Route migration when every temporary artifact is placed beneath the workspace.

## 10. Alternative B — Artifact Cleanup Adapter

An Artifact Cleanup Adapter could delete selected files without releasing a workspace. It would overlap Temporary Workspace removal, require new artifact-location and authorization rules, increase traversal and symlink risk, and encourage partial lifecycle policies in infrastructure. No current V1 request-lifecycle case requires individual deletion once all artifacts are workspace-contained. Alternative B is rejected.

## 11. Alternative C — Recovery / Janitor Foundation

A Janitor can eventually discover leases or workspaces abandoned by process crash and perform bounded recovery outside a request. That is a distinct operational responsibility and is suitable for crash/startup recovery, but it needs persistence, leases, age policy, ownership verification, and concurrency rules not present in V1. It is not a Route-migration prerequisite and is not implemented now.

## 12. Decision

**Adopt Alternative A. Do not create a new Cleanup Adapter Foundation for Multi-Cut V1.** Bind Media Execution's injected cleanup capability to Temporary Workspace's existing `cleanup()` operation. Media Execution composition decides when to call it; Temporary Workspace alone performs recursive workspace deletion.

## 13. Rejected Alternatives

Alternative B is rejected because it duplicates request-workspace ownership without a concrete V1 failure mode. Alternative C is rejected for the request lifecycle because crash recovery is asynchronous operational maintenance, not per-request cleanup. C remains a future, separately contracted Janitor boundary.

## 14. Failure Semantics

Cleanup is attempted once after an acquired workspace reaches any terminal primary outcome. A failed cleanup never replaces an existing process, packaging, cancellation, timeout, or validation classification. It is represented only through safe cleanup classification, secondary audit, and future policy advice. Raw paths and errors remain private.

## 15. Success Lifecycle

1. Reserve workspace.
2. Materialize input.
3. Execute FFmpeg.
4. Package outputs.
5. Copy the Packaging success bytes into a Composition-owned representation.
6. Project the safe primary result.
7. Release the workspace.

Existing Media Execution currently releases during final result construction. Composition must ensure step 5 is complete before release.

## 16. Failure Lifecycle

1. Reserve workspace.
2. Materialize input.
3. Execute FFmpeg.
4. Classify failure.
5. Skip packaging.
6. Release workspace.
7. Return the original safe failure with cleanup classification.

## 17. Timeout Lifecycle

1. FFmpeg Process requests child termination.
2. FFmpeg Process returns `timeout`.
3. Media Execution composition waits for termination classification.
4. Composition releases the workspace.
5. The timeout result is returned with cleanup classification.

## 18. Cancellation Lifecycle

1. FFmpeg Process handles `AbortSignal`.
2. Process termination completes or is safely classified.
3. Composition releases the workspace.
4. The cancelled result is returned; cleanup cannot overwrite it.

## 19. Packaging Failure Lifecycle

1. Reserve workspace.
2. Materialize input.
3. Execute FFmpeg.
4. Attempt packaging.
5. Classify packaging failure.
6. Release workspace, including any contained partial archive.
7. Return the original safe packaging failure.

## 20. Cleanup Failure Lifecycle

For `FFmpeg failure + cleanup failure`, retain the FFmpeg failure and add safe cleanup degradation. For `operation success + cleanup failure`, retain `completed` as required by the current Media Execution contract, set cleanup classification to `failed` or `unavailable`, and add `cleanup-failure` to audit. Cleanup does not change the primary retry classification. Any cleanup-specific retry decision belongs to future composition/workflow policy and must not cause an adapter retry loop.

## 21. Crash Recovery Boundary

Request cleanup cannot execute after process death. Startup discovery, stale lease judgment, concurrent-owner fencing, and orphan deletion belong to a future Janitor Foundation. Temporary Workspace currently has no enumeration or lease capability, so crash cleanup must not be simulated through request cleanup.

## 22. Retention Boundary

Durable exports and project artifacts have retention lifetimes independent of temporary workspaces. Their deletion belongs to the durable store or a future retention service. A request workspace must never become a substitute durable store.

## 23. Security Requirements

Every temporary artifact must resolve beneath the owned workspace. Cleanup accepts only an opaque validated workspace identity and matching ownership. No public result or audit may contain a path, filename, directory listing, filesystem exception, Node error, syscall, message, or stack. Process termination must complete or be classified before recursive deletion starts.

## 24. Determinism Requirements

For the same primary outcome and cleanup capability result, classification and audit ordering must be identical. Cleanup is invoked at most once after workspace acquisition. Infrastructure uses no clock, random identity, retry loop, or ambient registry to choose lifecycle behavior.

## 25. Future Extension Points

- a separately versioned Janitor contract for crash-orphan discovery and fenced cleanup;
- a retention service for durable artifacts;
- a response-lifecycle capability for stream completion or persisted artifact transfer;
- an explicitly idempotent workspace cleanup V2 if operational retries become required;
- individual artifact recovery only if a concrete non-workspace-owned resource is introduced.

## 26. Route Migration Consequences

The Route removes `outputPaths`, per-output `unlink`, cleanup sequencing, and swallowed cleanup errors. Composition ensures input, outputs, intermediates, and archive candidates share one workspace. Before release, ZIP Packaging returns fresh archive bytes and Composition takes a second owned copy. Blob conversion remains a future Route Response Projector responsibility; paths never cross the boundary.

## 27. Validation Criteria

- no new production cleanup implementation;
- one recursive workspace resource owner;
- Media Execution policy/runtime controls cleanup sequencing;
- process termination and filesystem deletion remain separate;
- success, failure, timeout, cancellation, and packaging failure all have complete lifecycles;
- primary outcomes survive cleanup failure;
- raw filesystem values remain undisclosed;
- crash and retention cleanup remain explicitly outside request scope;
- future composition tests prove one cleanup attempt and response ownership before release.
