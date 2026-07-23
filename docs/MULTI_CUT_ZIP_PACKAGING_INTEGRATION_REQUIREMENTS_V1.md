# Multi-cut ZIP Packaging Integration Requirements V1

## Current Route audit

`app/api/multi-cut/route.ts` currently creates `AdmZip` directly, stores generated output paths in an array, reads every output into a Buffer, and constructs archive entry names from clip index, output format, sanitized title, start, and end. It does not enumerate a directory. Duplicate archive-entry and archive-destination collision policy are not explicit. The ZIP is converted directly to an in-memory response Buffer named `clips.zip`; no archive artifact is persisted. Output cleanup is coupled to the Route through `unlink` in `finally`. Archive-library or filesystem exceptions are not normalized into a packaging contract, while raw output paths remain Route-local process state.

## Requirement checklist

1. Replace Route-owned `AdmZip` construction with an injected Packaging Capability.
2. Move output artifact discovery out of the Route.
3. Preserve explicit output order; do not depend on directory enumeration.
4. Replace raw output paths with opaque output artifact references.
5. Move archive-entry naming out of the Route.
6. Validate every archive-entry name as a safe leaf name.
7. Reject duplicate archive-entry names.
8. Replace fixed `clips.zip` behavior with deterministic operation identity naming.
9. Do not use timestamps in archive naming.
10. Do not use UUIDs or randomness in archive naming.
11. Treat archive identity as an opaque reference.
12. Validate archive identity before locator invocation.
13. Support only `operation-identity` naming in V1.
14. Support only `reject-existing` collision policy in V1.
15. Never overwrite an existing archive implicitly.
16. Use an exclusive final archive write.
17. Validate every output exists.
18. Accept only regular output files.
19. Reject output directories and symbolic links.
20. Normalize output locator failures safely.
21. Normalize archive locator failures safely.
22. Normalize archive-builder failures safely.
23. Normalize archive-write failures safely.
24. Never expose archive or workspace absolute paths.
25. Never expose output filename or directory lists.
26. Never expose Buffer, stream, or ZIP implementation details.
27. Never expose raw filesystem exceptions, messages, or stacks.
28. Project retry classification only; do not execute retries.
29. Keep output cleanup outside the Packaging Adapter.
30. Keep workspace lifecycle outside the Packaging Adapter.
31. Keep FFmpeg and media processing outside the Packaging Adapter.
32. Let Media Execution own packaging-stage sequencing.
33. Let Server Composition inject locators, filesystem, and archive-builder capabilities.
34. Remove ZIP responsibilities from the Route only after composition and HTTP projection are available.
35. Preserve Auth, Upload, Sensitive, Workspace, Input Materialization, FFmpeg Process, Media, HTTP, Generation Job, Workflow, Provider, Materializer, Output Ingestion, and Pipeline regressions.
36. Commit contract, runtime, and integration requirements in dependency order.

## Responsibilities to remove from the Route

- ZIP library construction
- output path collection for packaging
- output file reads for ZIP creation
- archive-entry naming
- archive-entry collision decisions
- archive creation and Buffer projection
- fixed archive response naming
- archive exception handling

## Adapter non-ownership

- media output generation
- output directory enumeration
- workspace creation, reservation, lifecycle, or cleanup
- output cleanup or deletion
- input materialization
- FFmpeg/process execution
- upload, download, or provider communication
- output ingestion or persistence workflow
- HTTP response creation
- retry scheduling
- workflow or pipeline progression
- production composition

## Public contract non-disclosure

- archive absolute path
- workspace path
- output filename or directory list
- ZIP implementation
- stream or Buffer
- source file contents
- raw filesystem or archive exception
- exception message or stack
