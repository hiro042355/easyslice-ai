# Multi-Cut Media Execution Composition Integration Requirements V1

1. The Route must delegate media execution sequencing to Media Execution Composition.
2. The Route must not reserve a workspace directly.
3. The Route must not prepare a workspace directly.
4. The Route must not materialize input artifacts directly.
5. The Route must not execute FFmpeg directly.
6. The Route must not package outputs directly.
7. The Route must not read an archive path directly.
8. The Route must not clean a workspace directly.
9. Composition must receive every executable capability through dependency injection.
10. Composition must reject a missing Workspace capability before execution.
11. Composition must reject a missing Input Materialization capability before execution.
12. Composition must reject a missing FFmpeg Process capability before execution.
13. Composition must reject a missing ZIP Packaging capability before execution.
14. Composition must reject a missing Response Representation capability before execution.
15. Workspace infrastructure remains the only owner of workspace creation.
16. Workspace infrastructure remains the only owner of recursive workspace deletion.
17. Input Materialization remains the only owner of filesystem copying.
18. FFmpeg Process remains the only owner of child-process execution.
19. FFmpeg Process remains the only owner of process timeout enforcement.
20. FFmpeg Process remains the only owner of process cancellation handling.
21. ZIP Packaging remains the only owner of archive construction.
22. Response Representation infrastructure remains the only owner of archive-reference resolution.
23. Composition owns only deterministic capability ordering.
24. Workspace reservation must precede preparation.
25. Workspace preparation must precede input materialization.
26. Input materialization must precede FFmpeg execution.
27. FFmpeg success must precede ZIP packaging.
28. ZIP packaging success must precede response representation.
29. Response ownership transfer must complete before cleanup.
30. Response-owned archive V1 must be a `Uint8Array`.
31. Composition must copy response bytes into a decision-owned representation.
32. ZIP Packaging must continue to return only an opaque archive reference.
33. A public decision must not contain a workspace path.
34. A public decision must not contain an archive path.
35. A public decision must not contain an output path.
36. A public decision must not contain a filesystem exception.
37. A public decision must not contain a child-process object.
38. A public decision must not contain a Node `Buffer`.
39. A public decision must not contain a stream.
40. A public decision must not contain raw stdout.
41. A public decision must not contain raw stderr.
42. A public decision must not contain credentials or provider data.
43. Cleanup must run after successful response ownership transfer.
44. Cleanup must run after materialization failure when workspace reservation succeeded.
45. Cleanup must run after FFmpeg failure.
46. Cleanup must run after FFmpeg timeout.
47. Cleanup must run after FFmpeg cancellation.
48. Cleanup must run after packaging failure.
49. Cleanup must run after response-representation failure.
50. Cleanup must run after an unexpected post-reservation dependency failure.
51. Cleanup must be attempted once per Composition execution.
52. Composition must not retry cleanup.
53. Composition must not implement cleanup.
54. Process termination must complete or be classified before workspace cleanup begins.
55. Cleanup failure must not overwrite a completed primary result.
56. Cleanup failure must not overwrite a failed primary result.
57. Cleanup failure must not overwrite a timeout result.
58. Cleanup failure must not overwrite a cancellation result.
59. Cleanup degradation must be represented only by `cleanupClassification` and safe audit.
60. Cleanup failure must not change primary retry semantics.
61. The Route must remove its `finally`-owned unlink sequence during migration.
62. The Route must remove per-output cleanup tracking during migration.
63. The Route must remove direct filesystem discovery during migration.
64. The Route must remove FFmpeg command execution during migration.
65. The Route must remove ZIP generation during migration.
66. The Route must remove cleanup-error suppression during migration.
67. The Route may project the safe Composition decision into HTTP only after Composition returns.
68. HTTP response construction must consume response-owned bytes, not workspace files.
69. HTTP status mapping remains an HTTP Adapter responsibility.
70. Authentication must complete before Composition invocation.
71. Upload authorization and source validation must complete before Composition invocation.
72. Sensitive-value projection must complete before media execution.
73. Composition must not import Route, Next.js, React, or HTTP implementations.
74. Composition must not import Provider SDKs or provider runtimes.
75. Composition must not use network or ambient environment access.
76. Composition must not use a default capability registry or singleton.
77. Audit entries must have deterministic zero-based sequence values.
78. Equivalent capability outcomes must produce equivalent safe decisions.
79. Decisions and audit containers must be immutable.
80. Separate executions must not share mutable response bytes.
81. Future Route wiring tests must prove all direct execution and cleanup responsibilities are removed.
82. Future integration tests must prove response bytes remain valid after workspace cleanup.
83. Future E2E tests must cover success, FFmpeg failure, packaging failure, timeout, cancellation, and cleanup degradation.
84. Rollback is required if response ownership occurs after cleanup or raw paths become observable.
85. Rollback is required if cleanup can replace the primary result.
86. Rollback is required if Composition gains spawn, ZIP, workspace, or filesystem implementation.
87. Commit slicing should separate Composition contract/runtime, tests, integration documentation, and later Route migration.
88. Route migration must not be included in the Composition Foundation commit.
89. Crash recovery remains outside the request lifecycle and outside this Foundation.
90. Retention cleanup remains outside the request lifecycle and outside this Foundation.
