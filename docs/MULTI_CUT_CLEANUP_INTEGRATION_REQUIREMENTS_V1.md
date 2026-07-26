# Multi-Cut Cleanup Integration Requirements V1

## Requirement checklist

1. Remove the Route's `finally` ownership of request-resource cleanup.
2. Remove direct per-output `unlink` calls from the Route.
3. Remove the Route's `outputPaths` cleanup tracking responsibility.
4. The Route must not choose cleanup ordering.
5. Use Temporary Workspace `cleanup()` as the V1 workspace release capability.
6. Treat workspace release as recursive cleanup of contained temporary artifacts.
7. Place materialized input beneath the owned request workspace.
8. Place generated outputs beneath the owned request workspace.
9. Place intermediate files beneath the owned request workspace.
10. Place temporary archive candidates beneath the owned request workspace.
11. Media Execution composition owns request-lifecycle sequencing.
12. Infrastructure adapters must not decide when workflow cleanup occurs.
13. Invoke workspace cleanup only after a workspace has been acquired.
14. Attempt cleanup after successful media execution.
15. Attempt cleanup after input-materialization failure when a workspace exists.
16. Attempt cleanup after FFmpeg failure.
17. Attempt cleanup after ZIP Packaging failure.
18. Attempt cleanup after FFmpeg timeout termination is classified.
19. Attempt cleanup after cancellation termination is classified.
20. Do not delete workspace files while FFmpeg may still be running.
21. Separate child-process termination from filesystem cleanup.
22. FFmpeg Process owns timeout and AbortSignal process termination.
23. FFmpeg Process must not delete artifacts or workspaces.
24. Input Materialization must not delete its source.
25. Input Materialization must not delete its materialized destination.
26. ZIP Packaging must not delete source outputs.
27. ZIP Packaging must not clean a partial archive.
28. Temporary Workspace alone owns recursive request-workspace removal.
29. Normal composition must not individually unlink outputs before workspace release.
30. Use an exactly-once cleanup attempt under the current V1 lifecycle.
31. Do not add an adapter-level cleanup retry loop.
32. A cleanup retry decision belongs to composition or workflow policy.
33. Cleanup failure must not replace an existing FFmpeg failure.
34. Cleanup failure must not replace an existing packaging failure.
35. Cleanup failure must not replace timeout or cancellation.
36. Operation success plus cleanup failure remains completed under the current Media Execution contract.
37. Project cleanup failure through safe cleanup classification.
38. Record only a safe `cleanup-failure` secondary audit reason.
39. Keep the primary operation retry classification unchanged by cleanup failure.
40. Never disclose a source, output, archive, or workspace path.
41. Never disclose a filename or directory listing in cleanup results.
42. Never disclose raw filesystem exceptions, codes, syscalls, messages, or stacks.
43. Validate opaque workspace identity before filesystem removal.
44. Validate tenant and ownership projections before filesystem removal.
45. Preserve traversal and sibling-prefix protections at workspace location boundaries.
46. Preserve symlink-safe workspace containment policy.
47. A missing workspace must produce a safe `not-found` result.
48. An already-cleaned workspace follows the current deterministic rejected transition.
49. Cleanup failure must restore the preceding workspace lifecycle state.
50. Workspace cleanup must not delete a source artifact outside the workspace.
51. Workspace cleanup must not delete durable imported or exported artifacts.
52. Copy Packaging archive bytes into a Composition-owned `Uint8Array` before workspace release.
53. ZIP Packaging must not own HTTP response or stream lifetime.
54. HTTP projection must not expose a workspace-backed reference after release.
55. Composition V1 uses owned bytes; streams and persisted references require a later versioned contract.
56. Crash-orphan cleanup remains outside the request lifecycle.
57. Do not block Route migration on a future startup Janitor.
58. A future Janitor requires leases, ownership fencing, bounded discovery, and concurrency policy.
59. Retention cleanup remains outside the request lifecycle.
60. Durable artifact retention belongs to its store or retention service.
61. Server Composition injects the workspace cleanup capability.
62. Server Composition does not duplicate the workspace deletion implementation.
63. Media Execution calls the injected narrow cleanup capability.
64. Workflow may aggregate cleanup retry advice but must not execute an implicit retry loop.
65. Operation Pipeline must not directly access workspace filesystem internals.
66. Future composition tests must cover success cleanup exactly once.
67. Future composition tests must cover FFmpeg failure cleanup exactly once.
68. Future composition tests must cover packaging failure cleanup exactly once.
69. Future composition tests must cover timeout cleanup after termination.
70. Future composition tests must cover cancellation cleanup after termination.
71. Future composition tests must prove primary failure priority over cleanup failure.
72. Future composition tests must prove completed plus cleanup degradation behavior.
73. Future composition tests must prove raw path and exception non-disclosure.
74. Future E2E tests must prove no request workspace remains after a successful buffered response.
75. Future E2E tests must prove failed requests do not leave contained outputs.
76. Streaming E2E tests, if adopted, must delay release until stream completion or abort.
77. Route migration removes fixed output cleanup and swallowed unlink failures.
78. Route migration preserves only transport parsing and response projection responsibilities.
79. Commit the decision and integration requirements as a docs-only slice.
80. Commit future composition wiring separately from contracts and infrastructure adapters.
81. Roll back migration if response data still depends on workspace files at release time.
82. Roll back migration if any temporary artifact is created outside the owned workspace.
83. Roll back migration if process termination is not observed before recursive cleanup.
84. Roll back migration if cleanup failure overwrites the primary result.
85. Roll back migration if paths or filesystem errors enter public decisions or audit.

## Route responsibilities to remove

- `outputPaths` cleanup tracking
- the `finally` cleanup loop
- direct `unlink`
- cleanup ordering
- swallowed cleanup-error policy
- decisions about whether success or failure triggers cleanup

## Adapter non-ownership

- Input Materialization does not delete source or destination artifacts.
- FFmpeg Process terminates processes but does not delete filesystem artifacts.
- ZIP Packaging creates an archive but does not delete outputs or partial archives.
- Temporary Workspace removes its owned workspace but does not decide workflow timing.
- HTTP adapters do not perform workspace deletion.

## Composition boundary

Media Execution composition acquires the workspace, sequences capabilities, waits for process termination, transfers the result into response ownership, and attempts workspace cleanup exactly once. It preserves the primary result if cleanup degrades. Server Composition supplies the existing workspace cleanup implementation through the narrow Media Execution cleanup capability.

## Out-of-scope cleanup

Startup crash recovery belongs to a future Janitor Foundation. Durable retention belongs to durable storage policy. Neither is a requirement for replacing the current Route's per-request `unlink` behavior.
