# Multi-Cut Media Execution Runtime Binding Integration Requirements V1

1. Bind exactly four executable capabilities.
2. Require Workspace capability.
3. Require Input Materialization capability.
4. Require FFmpeg Process capability.
5. Require ZIP Packaging capability.
6. Exclude Response Representation capability.
7. Accept already-constructed capabilities.
8. Do not construct Temporary Workspace adapters.
9. Do not construct Input Materialization adapters.
10. Do not construct FFmpeg Process adapters.
11. Do not construct ZIP Packaging adapters.
12. Do not construct filesystem dependencies.
13. Do not construct locator dependencies.
14. Do not construct archive builders.
15. Do not select an FFmpeg executable.
16. Do not read environment variables.
17. Do not read credentials.
18. Do not create a singleton.
19. Do not create a global registry.
20. Do not create an import-time instance.
21. Validate dependencies before construction.
22. Reject a missing Workspace capability.
23. Reject a missing Materialization capability.
24. Reject a missing FFmpeg capability.
25. Reject a missing Packaging capability.
26. Reject null dependencies.
27. Reject undefined dependencies.
28. Reject non-object dependencies.
29. Reject missing required methods.
30. Permit duplicate dependency object identity.
31. Do not execute Workspace during binding.
32. Do not execute Materialization during binding.
33. Do not execute FFmpeg during binding.
34. Do not execute Packaging during binding.
35. Do not execute Composition during binding.
36. Construct `MediaExecutionCompositionDependencies` only after validation.
37. Construct `ReferenceMediaExecutionComposition` directly.
38. Return its public executable capability.
39. Return a new Composition instance per call.
40. Isolate parallel creation results.
41. Do not mutate dependency objects.
42. Do not wrap dependency capabilities.
43. Allocate a new audit collection per call.
44. Freeze the public binding result.
45. Freeze the public binding audit.
46. Preserve deterministic audit ordering.
47. Normalize malformed dependencies safely.
48. Normalize construction failures safely.
49. Normalize unexpected failures safely.
50. Do not expose raw exceptions.
51. Do not expose dependency objects.
52. Do not expose paths.
53. Do not expose commands.
54. Do not expose process output.
55. Do not import HTTP implementations.
56. Do not import Next.js.
57. Do not import Routes.
58. Do not import Authentication.
59. Do not use Blob.
60. Do not access the filesystem.
61. Do not spawn processes.
62. Do not build ZIP archives.
63. Leave cleanup sequencing in Composition.
64. Leave retry policy outside Binding.
65. Leave timeout policy outside Binding.
66. Leave cancellation policy outside Binding.
67. Leave adapter construction to Server Runtime Assembly.
68. Keep descriptor-only Server Composition separate.
69. Keep Route Migration outside this Foundation.
70. Verify an in-memory four-capability fixture.
71. Verify Packaging bytes produce Composition success.
72. Verify cleanup remains after Packaging.
73. Verify Composition dependency count is four.
74. Verify reverse dependency remains zero.
75. Verify import side effects remain zero.
76. Verify global singleton count remains zero.
77. Verify scoped TypeScript diagnostics are zero.
78. Verify scoped infrastructure regressions pass.
79. Verify `git diff --check` passes.
80. Roll back if Binding requires infrastructure construction.
