# Multi-Cut Workspace and FFmpeg Contract Extraction Requirements V1

1. Extract the existing Workspace filesystem type.
2. Preserve the name `WorkspaceFilesystem`.
3. Preserve the `mkdir` method.
4. Preserve the `mkdir` parameter.
5. Preserve the `mkdir` Promise return type.
6. Preserve the `rm` method.
7. Preserve the `rm` parameter.
8. Preserve the `rm` Promise return type.
9. Export the type from `workspace/types.ts`.
10. Remove the private duplicate from the Workspace Adapter.
11. Import the public type into the Workspace Adapter.
12. Preserve the Workspace constructor signature.
13. Preserve optional Workspace filesystem injection.
14. Preserve optional Workspace root configuration.
15. Preserve the default Workspace filesystem.
16. Preserve Workspace reserve behavior.
17. Preserve Workspace prepare behavior.
18. Preserve Workspace lookup behavior.
19. Preserve Workspace cleanup behavior.
20. Preserve Workspace failure normalization.
21. Extract the existing FFmpeg process-like type.
22. Preserve the name `ProcessLike`.
23. Preserve stdout and stderr projections.
24. Preserve error observation.
25. Preserve close observation.
26. Preserve process termination.
27. Extract the existing spawn type.
28. Preserve the name `SpawnCapability`.
29. Preserve the executable parameter.
30. Preserve immutable argument tokens.
31. Preserve shell false.
32. Preserve pipe stdio configuration.
33. Preserve the process-like return type.
34. Extract the existing timer type.
35. Preserve the name `TimerCapability`.
36. Preserve schedule callback semantics.
37. Preserve schedule milliseconds.
38. Preserve opaque timer handles.
39. Preserve cancel semantics.
40. Export FFmpeg infrastructure types from `ffmpegProcess/types.ts`.
41. Remove private FFmpeg type duplicates.
42. Import public FFmpeg types into the Adapter.
43. Preserve the FFmpeg constructor signature.
44. Preserve optional spawn injection.
45. Preserve optional timer injection.
46. Preserve default spawn behavior.
47. Preserve default timer behavior.
48. Preserve request-owned executable classification.
49. Preserve FFmpeg argument validation.
50. Preserve timeout behavior.
51. Preserve cancellation behavior.
52. Preserve exit classification.
53. Preserve safe process-output classification.
54. Do not add a common filesystem abstraction.
55. Do not modify Materialization contracts.
56. Do not modify ZIP Packaging contracts.
57. Do not modify locator contracts.
58. Do not modify archive builder contracts.
59. Do not modify Runtime Binding.
60. Do not add Server Runtime Assembly.
61. Do not add infrastructure implementations.
62. Do not access environment variables.
63. Do not add HTTP dependencies.
64. Do not add Route dependencies.
65. Do not add Blob dependencies.
66. Do not add a singleton.
67. Do not add module-level mutable state.
68. Do not add import-time construction.
69. Verify Workspace boundary tests.
70. Verify Workspace behavior parity.
71. Verify FFmpeg boundary tests.
72. Verify FFmpeg behavior parity.
73. Verify scoped TypeScript diagnostics are zero.
74. Verify Materialization source is unchanged.
75. Verify ZIP Packaging source is unchanged.
76. Verify Runtime Binding source is unchanged.
77. Verify dependency direction remains Adapter to Contract.
78. Verify `git diff --check` passes.
79. Verify merge markers remain absent.
80. Roll back if extraction changes runtime behavior.
