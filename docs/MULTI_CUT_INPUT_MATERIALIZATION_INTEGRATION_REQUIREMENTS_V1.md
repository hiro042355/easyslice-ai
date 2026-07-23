# Multi-cut Input Materialization Integration Requirements V1

## Current route audit

`app/api/multi-cut/route.ts` currently selects a fixed `downloaded.mp4` beneath `os.tmpdir()`. The Route owns construction and an `access`-based existence check, but does not verify that the input is a regular file or reject a symlink. It does not copy/materialize the input into a request-scoped workspace. The `.mp4` name and extension are fixed and no input collision policy exists. The raw input path is interpolated directly into both FFmpeg command variants. Filesystem failures are reduced to a 404 during `access`, while later process/read/cleanup behavior remains coupled to the Route. Output paths are separately created beneath `os.tmpdir()`, read into memory for ZIP generation, and unlinked in `finally`.

## Requirement checklist

1. Replace fixed `os.tmpdir()/downloaded.mp4` input discovery with an opaque source artifact reference.
2. Move ownership of source location resolution out of the Route and into an injected source locator.
3. Replace the current existence-only check with safe existence and regular-file validation.
4. Remove workspace destination construction from the Route.
5. Remove destination filename selection from the Route and use an opaque materialized reference.
6. Keep extension and filename details internal; neither is part of the public contract.
7. Replace implicit/unspecified overwrite behavior with explicit `reject-existing`.
8. Perform exactly one bounded filesystem copy; do not read the binary into the Route.
9. Normalize raw filesystem failures before they cross the adapter boundary.
10. Hand the resolved internal materialized location to media execution only inside server composition.
11. Treat Source Artifact Reference as opaque and validate it before locator invocation.
12. Treat Workspace Reference as opaque and validate it before locator invocation.
13. Treat Materialized Artifact Reference as opaque and validate it before path composition.
14. Validate tenant, workspace, operation, and ownership projections before filesystem access.
15. Source locator ownership belongs to infrastructure composition, not the Route.
16. Workspace locator ownership belongs to infrastructure composition, not workspace lifecycle.
17. Accept only a regular source file.
18. Reject symbolic links without following them.
19. Require the located workspace to exist and be a directory.
20. Resolve the destination beneath the workspace and reject traversal and sibling-prefix attacks.
21. Use an explicit collision policy and never overwrite by default.
22. Use exclusive single-file copy and preserve the source.
23. On copy failure, return safe failure and never report a materialized reference as available.
24. Project retry classification only; do not schedule or execute retries.
25. Do not disclose source, workspace, or destination paths.
26. Do not disclose filesystem exceptions, messages, codes, syscalls, or stacks.
27. Temporary Workspace Adapter retains reservation, creation, lifecycle, and cleanup ownership.
28. Media Execution Capability consumes materialized input through its public boundary and does not resolve source artifacts.
29. Remove input discovery/materialization responsibilities from the Route after composition is available.
30. Complete Auth, Upload, Sensitive, Temporary Workspace, and Input Materialization composition prerequisites before migration.
31. Server composition owns construction and injection of locators and the filesystem capability.
32. Preserve scoped regressions for Temporary Workspace, Media Execution, Media Operation, Sensitive, Upload, Auth, HTTP, Generation Job, Workflow, Provider Client, Materializer, Output Ingestion, and Operation Pipeline.
33. Commit the contract, runtime, and integration document as separate dependency-ordered slices.

## Responsibilities to remove from the Route

- fixed input path discovery
- source path construction
- source existence check
- source file-type check
- destination filename construction
- destination path construction
- workspace containment decisions
- input file copy
- overwrite/collision handling
- copy exception normalization
- raw source path handling
- raw destination path handling
- FFmpeg input path preparation

## Adapter non-ownership

- workspace creation, reservation, lifecycle management, and cleanup
- upload handling, provider download, and remote fetch
- FFmpeg, ffprobe, process execution, and command construction
- stdout/stderr handling
- output collection and output ingestion
- ZIP/archive generation
- HTTP projection and Route response creation
- retry scheduling
- cancellation execution
- timeout execution

## Public contract non-disclosure

- source and destination filesystem paths
- workspace root path
- directory name, filename, extension, drive letter, separator, or `os.tmpdir`
- inode, filesystem metadata, file size, or modification time
- command, shell arguments, stdout, or stderr
- provider locator or signed URL
- raw filesystem exception, exception message, or stack
- Buffer or stream
