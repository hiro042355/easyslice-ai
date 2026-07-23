# Multi-cut FFmpeg Process Integration Requirements V1

## Current Route audit

`app/api/multi-cut/route.ts` currently imports `exec`, promisifies it, and constructs one of two interpolated FFmpeg command strings. It selects operation arguments, embeds raw input/output paths, and runs the command through a shell-capable string API. The Route does not explicitly configure stdin/stdout/stderr, classify exit codes or signals, implement timeout or cancellation, normalize process errors, or project safe stderr classifications. It does not return the raw command or stderr directly, but thrown process errors can retain them internally. Cleanup is limited to unlinking accumulated output paths in `finally`; process termination and cleanup ownership are not separated.

## Requirement checklist

1. Replace Route-owned `exec` usage with an injected FFmpeg Process Capability.
2. Remove FFmpeg command-string construction from the Route.
3. Replace interpolation with an argv token projection.
4. Keep stdin unused through an explicit ignored stdio slot.
5. Observe stdout only for a safe empty/present classification.
6. Observe stderr only for a safe empty/present classification.
7. Normalize exit code zero as success.
8. Normalize non-zero exit without exposing the raw code.
9. Normalize process signals without exposing the raw signal.
10. Add an explicit bounded timeout policy.
11. Accept cancellation through AbortSignal.
12. Normalize synchronous spawn failure.
13. Normalize emitted process errors.
14. Never return raw stderr.
15. Never return raw stdout.
16. Never return a command string.
17. Never return an executable path.
18. Never return a filesystem path.
19. Never expose a PID or child-process handle.
20. Invoke `spawn` with `shell:false`.
21. Reject newline and null characters in argument tokens.
22. Reject `&&`, `||`, semicolon, and redirection separators.
23. Reject duplicate option tokens.
24. Support only the `ffmpeg` executable classification in V1.
25. Keep retry scheduling outside the adapter.
26. Keep workspace lifecycle and cleanup outside the adapter.
27. Keep input materialization outside the adapter.
28. Keep output collection and ingestion outside the adapter.
29. Keep ZIP/archive generation outside the adapter.
30. Let Server Composition inject process and timer capabilities.
31. Let Media Execution own stage sequencing and safe capability invocation.
32. Let Media Operation policy own the semantic allowlist for operations and options.
33. Remove process responsibilities from the Route only after composition is available.
34. Preserve Auth, Upload, Sensitive, Workspace, Input Materialization, Media, HTTP, Generation Job, Workflow, Provider, Materializer, Output Ingestion, and Pipeline regressions.
35. Commit contract, runtime, and integration documentation in dependency order.

## Responsibilities to remove from the Route

- `child_process` and `exec`
- FFmpeg command-string assembly
- argument generation and interpolation
- process creation and waiting
- stdout/stderr handling
- exit-code, signal, timeout, cancellation, and process-error handling
- raw input/output path interpolation
- process-result normalization

## Adapter non-ownership

- source artifact resolution
- workspace creation, reservation, lifecycle, and cleanup
- input materialization
- media-operation policy selection
- retry scheduling or retry loops
- output collection, output ingestion, or persistence
- ZIP/archive generation
- HTTP parsing or response projection
- Route behavior
- provider communication
- workflow or pipeline progression
- production composition

## Public contract non-disclosure

- child process or PID
- raw stdout or stderr
- command string
- executable path
- source, destination, or workspace filesystem path
- shell argument representation
- environment
- raw exit code or signal
- exception, message, or stack
