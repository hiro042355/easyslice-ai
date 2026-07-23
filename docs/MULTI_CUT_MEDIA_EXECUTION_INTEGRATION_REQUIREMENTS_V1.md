# Multi-cut Media Execution Integration Requirements V1

## Scope

`app/api/multi-cut/route.ts` remains unchanged. The following numbered requirements define its future migration to Media Execution Adapter capabilities.

1. **Current execution flow:** The route parses clips, discovers a fixed input, constructs and executes FFmpeg commands, reads outputs, builds a ZIP, returns bytes, and deletes temporary outputs.
2. **Current input discovery:** The current fixed downloaded input is discovered through direct temporary-filesystem access; this must be replaced by an opaque upload reference.
3. **Temporary workspace ownership:** An injected workspace adapter owns allocation, isolation, lifecycle, and opaque workspace references.
4. **Input materialization ownership:** An injected materialization adapter resolves an opaque upload reference into an infrastructure-local input without returning a path.
5. **FFmpeg execution ownership:** Actual FFmpeg and ffprobe execution belongs only to infrastructure.
6. **FFmpeg adapter boundary:** The adapter owns executable discovery, safe argument construction, invocation, termination observation, and normalization.
7. **Process invocation boundary:** `child_process`, spawn, exec, and execFile remain inside the future process adapter.
8. **stdout normalization:** Raw stdout is discarded after conversion to an allowlisted classification.
9. **stderr normalization:** Raw stderr is discarded after conversion to an allowlisted safe reason code.
10. **Exit-code normalization:** Exit codes and signals are interpreted by the process adapter and never exposed in Production Contracts.
11. **Timeout boundary:** Timeout enforcement and process termination belong to infrastructure; core runtime receives only a timed-out classification.
12. **Cancellation boundary:** Cancellation signalling belongs to infrastructure; core runtime receives only a cancellation projection or classified result.
13. **ZIP generation ownership:** Archive creation is an infrastructure responsibility.
14. **ZIP adapter boundary:** The packaging adapter owns archive entries, binary assembly, and archive-specific failure normalization.
15. **Output artifact collection:** Generated outputs cross the boundary only as ordered opaque output artifact references.
16. **Cleanup ownership:** The cleanup adapter owns resource deletion and receives only an opaque workspace reference.
17. **Cleanup failure policy:** Cleanup failure is audited safely and never overwrites the completed, failed, unavailable, cancelled, or timed-out media result.
18. **Opaque artifact reference boundary:** Workspace, input, output, and package locators never leave infrastructure as paths, URLs, buckets, or object keys.
19. **Sensitive Boundary relationship:** Authenticated upload references pass through Sensitive Boundary scope and ownership validation before Media Operation or Media Execution.
20. **Media Operation Runtime relationship:** Media Operation selects and validates the operation; Media Execution performs one injected abstract execution attempt without implementing I/O.
21. **HTTP Adapter relationship:** HTTP receives only a separately projected safe decision and never receives infrastructure details or internal artifact locators.
22. **Generation Job Entry relationship:** Generation Job Entry may initiate or classify work through public contracts but cannot inspect execution capabilities or references.
23. **Retry relationship:** Media Execution returns retry classification only; scheduling and retry loops belong to workflow or another external owner.
24. **Idempotency relationship:** Caller-supplied request and operation identities support future durable idempotency; the adapter owns no cache or request ledger.
25. **Responsibilities removed from Route:** Future migration removes temporary-path discovery, command construction, process execution, archive generation, binary file collection, cleanup, and raw failure handling.
26. **Migration prerequisites:** Opaque upload projection, server composition, five infrastructure adapters, cancellation/timeout policy, idempotency ownership, and leakage regressions must exist first.
27. **Infrastructure adapter candidates:** Workspace, input materialization, FFmpeg process, ZIP packaging, and cleanup adapters are separate future candidates.
28. **Commit slicing proposal:** Contract, reference adapter, this document, individual infrastructure adapters, composition, and route migration remain independent commits.

## Planned Route removals

- `os.tmpdir`
- fixed input path
- filesystem discovery
- `mkdir`, `readFile`, and `unlink`
- command construction
- `child_process` execution
- FFmpeg invocation
- ZIP invocation
- stdout and stderr handling
- temporary output collection
- cleanup
- raw exception normalization

## HTTP projection candidates

| Internal result | Candidate safe HTTP projection |
| --- | --- |
| `invalid` | rejected / 400 |
| ownership or policy `rejected` | rejected / 403 |
| process `unavailable` | unavailable / 503 |
| process `failed` | rejected or unavailable / 500 |
| `timed-out` | unavailable / 504 candidate |
| `cancelled` | rejected / 409 or internal 499-equivalent classification |
| completed with cleanup failure | completed main response plus safe cleanup diagnostic |

No HTTP Production Contract is changed here. Public responses must exclude paths, commands, stdout, stderr, artifact locators, workspace references, provider responses, and raw exceptions.
