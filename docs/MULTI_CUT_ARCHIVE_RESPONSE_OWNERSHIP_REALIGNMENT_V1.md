# Multi-Cut Archive Response Ownership Realignment V1

## Decision

V1 removes `ResponseRepresentationCapability` from the Media Execution Composition dependency graph. ZIP Packaging already owns archive construction and therefore returns a fresh `Uint8Array` projection with every successful packaged decision. Composition takes a second copy before workspace cleanup. Blob conversion remains owned by a future Route Response Projector.

## Previous problem

The previous flow wrote archive bytes to the workspace, returned only an opaque archive reference, and expected `ResponseRepresentationCapability` to reread that reference. `ArchiveProjection` intentionally contains no path, while the packaging locator also requires a deterministic archive name that was not passed to Response Representation. A Production Response Representation implementation therefore could not resolve the reference without inventing location policy, adding another locator contract, or exposing filesystem information. Even if resolution information were added, rereading bytes already produced by ZIP Packaging would be unnecessary filesystem work.

## Adopted architecture

A successful `PackagingDecision` may include `archiveBytes?: Uint8Array`; the Reference ZIP Adapter always returns a non-empty value on success. Media Execution Composition has exactly four capabilities: workspace, input materialization, FFmpeg process, and ZIP Packaging. Composition treats missing or empty bytes on an otherwise packaged result as Packaging failure, takes an independent copy before cleanup, and has no Response Representation dependency. Runtime binding must supply those four capabilities. HTTP response creation and Blob conversion remain Route Response Projector responsibilities.

## Ownership model

The archive builder owns its source bytes. ZIP Packaging owns separate copies for filesystem write and its successful decision. Composition owns another copy taken before workspace cleanup. The Route Response Projector owns any later HTTP or Blob representation. No returned bytes depend on workspace lifetime or share backing memory with builder or write inputs.

## Explicit non-decisions

V1 does not add a path or filename to `ArchiveProjection`, create an Archive Store, pre-empt durable artifact lookup, or move HTTP and Blob concerns into Composition. It also does not introduce streaming, retention, delayed retrieval, or cross-process archive resolution.

## Risks

V1 holds the complete archive in memory across builder, Packaging, and Composition copies. `Uint8Array` remains mutable even when its containing decision is frozen, so ownership depends on deliberate copy isolation. `archiveBytes` is optional for contract compatibility, which requires Composition to reject missing or empty bytes rather than assume success. A future streaming design will require a versioned ownership and lifetime contract rather than an in-place reinterpretation of these bytes.

## Durable artifacts

This decision is request-scoped. A future requirement for cross-process download, retention, or durable lookup must introduce an explicit Artifact Store contract. It must not be simulated by adding a path to `ArchiveProjection`.

## Future migration triggers

Reconsider an Archive Store or streaming contract when durable download, cross-process access, delayed retrieval, large-archive streaming, retention policy, or resumable download becomes a concrete requirement.

## Rollback conditions

Roll back this V1 ownership model if Packaging cannot provide usable bytes, measured archive size exceeds the accepted memory ceiling, durable storage becomes mandatory, or archive ownership must cross a process boundary. Rollback must preserve opaque public references and must not expose filesystem locations as a shortcut.

## Migration checklist

1. Preserve opaque archive identity.
2. Do not add a filesystem path to `ArchiveProjection`.
3. Do not add a filename to `ArchiveProjection`.
4. Keep archive naming inside ZIP Packaging.
5. Keep archive construction inside ZIP Packaging.
6. Keep archive filesystem writes inside ZIP Packaging infrastructure.
7. Add archive bytes only to successful Packaging results.
8. Represent archive bytes as `Uint8Array`.
9. Never expose Node `Buffer`.
10. Copy archive-builder output before filesystem write.
11. Copy archive-builder output before Packaging projection.
12. Do not share builder backing memory with Packaging results.
13. Do not share filesystem-write backing memory with Packaging results.
14. Do not reread the archive after writing it.
15. Preserve exclusive archive write behavior.
16. Preserve archive collision behavior.
17. Preserve output ordering.
18. Preserve deterministic archive entry ordering.
19. Preserve deterministic archive naming.
20. Preserve Packaging retry classification.
21. Preserve Packaging reason codes.
22. Preserve Packaging audit ordering.
23. Preserve Packaging failure normalization.
24. Do not attach bytes to failed Packaging results.
25. Do not attach bytes to unavailable Packaging results.
26. Do not attach bytes to rejected Packaging results.
27. Do not attach bytes to invalid Packaging results.
28. Treat empty successful bytes as an invalid packaged outcome in Composition.
29. Remove Response Representation from Composition dependencies.
30. Remove `readArchive()` invocation from Composition.
31. Remove response-representation failure projection from Composition.
32. Remove response-representation audit stage from Composition.
33. Add response-ownership projection after Packaging success.
34. Copy Packaging bytes before cleanup.
35. Keep Composition result bytes independent from Packaging bytes.
36. Keep Composition result bytes valid after cleanup.
37. Keep cleanup in `finally`.
38. Preserve cleanup after Packaging failure.
39. Preserve cleanup after FFmpeg failure.
40. Preserve cleanup after timeout.
41. Preserve cleanup after cancellation.
42. Preserve cleanup after materialization failure.
43. Preserve primary failure precedence.
44. Preserve cleanup degradation classification.
45. Preserve safe cleanup audit.
46. Do not change workspace ownership.
47. Do not move cleanup into ZIP Packaging.
48. Do not move cleanup into the Route.
49. Do not add archive reading to the Route.
50. Do not add filesystem lookup to the Route.
51. Do not add HTTP behavior to ZIP Packaging.
52. Do not add Blob behavior to ZIP Packaging.
53. Do not add HTTP behavior to Composition.
54. Do not add Blob behavior to Composition.
55. Leave Blob conversion to the future Route Response Projector.
56. Keep Authentication outside this change.
57. Keep Runtime Binding outside this change.
58. Keep Route migration outside this change.
59. Keep Provider behavior outside this change.
60. Keep external dependencies unchanged.
61. Verify Packaging source-copy isolation.
62. Verify Packaging repeated-call isolation.
63. Verify Composition double-copy isolation.
64. Verify Composition bytes survive cleanup.
65. Verify public path leakage remains zero.
66. Verify public exception leakage remains zero.
67. Verify public Buffer leakage remains zero.
68. Verify Composition dependency count is four.
69. Verify scoped TypeScript diagnostics are zero.
70. Verify ZIP Packaging and Composition regressions pass.
71. Roll back if Packaging rereads the written archive.
72. Roll back if returned bytes share builder memory.
73. Roll back if cleanup occurs before Composition takes ownership.
74. Roll back if paths enter a public contract.
75. Roll back if primary failures are replaced by cleanup failures.
