# FFmpeg Process Infrastructure Adapter Foundation V1

## Purpose and architecture

This foundation safely performs one FFmpeg process attempt and normalizes the outcome.

`Media Execution -> FFmpeg Process Capability -> ReferenceFFmpegProcessAdapter -> command validation / spawn / monitor / classification`

It owns command projection validation, `spawn`, process waiting, bounded stdout/stderr observation, exit classification, timeout termination, AbortSignal cancellation, safe normalization, immutable decisions, and deterministic audit.

It does not own media-operation policy, source or workspace resolution, input materialization, output collection, cleanup, ZIP/archive generation, retry scheduling, workflow progression, HTTP projection, provider communication, persistence, or production composition.

## Contract

The type-only contract defines a request, an FFmpeg command projection, a safe decision, classifications, safe reason codes, retry advice, audit, and capability. Command tokens are passed as an argv array directly to `spawn`; they are never assembled into or exposed as a shell command.

The public decision never contains a child process, PID, raw stdout/stderr, command string, executable path, filesystem path, shell argument, environment, exit signal, exception, message, or stack. It exposes only zero/non-zero/not-observed and empty/present/not-observed classifications.

## Validation and argument safety

Validation rejects missing identities, missing arguments, unsupported executable classifications, invalid timeouts, duplicate option tokens, and tokens containing newline, null, `&&`, `||`, `;`, `>`, or `<`. Invalid requests never invoke the process capability.

The only executable classification in V1 is `ffmpeg`. The runtime always invokes `spawn("ffmpeg", tokens, { shell: false, stdio: ["ignore", "pipe", "pipe"] })`. stdin is ignored. stdout and stderr are observed only to produce safe presence classifications.

## Exit, timeout, cancellation, and error normalization

- exit code zero becomes `success`;
- non-zero becomes `failed`;
- timer termination becomes `timeout`;
- AbortSignal termination becomes `cancelled`;
- synchronous or emitted spawn errors become `spawn-failure`;
- monitor/termination dependency errors become `dependency-failure`.

Timeout and cancellation request one `SIGTERM`. This foundation does not escalate signals, poll, retry, or schedule workflow work. Raw process output and failures never cross the decision boundary.

## Dependency injection and determinism

The reference runtime has safe defaults for `spawn` and timers. Tests may explicitly inject equivalent capabilities. There is no default registry, singleton, clock reading, random value, UUID, filesystem, network, database, provider SDK, or environment read.

Given the same request and the same process events, decision and audit are identical. Decisions and nested audit values are deeply frozen and independently allocated.

## Security boundary and limitations

Shell execution is disabled. Tokens are never concatenated into a command string. This syntactic token policy does not determine whether an arbitrary FFmpeg option is semantically permitted; higher media-operation policy and composition must provide an allowlisted projection. V1 does not conceal paths inside the private argv passed to the child, but never returns them publicly. It does not guarantee forceful termination if the child ignores `SIGTERM`, nor does it clean output artifacts.

## Testing and replacement

Boundary tests lock type-only and infrastructure constraints. Behavior tests cover success, non-zero exit, spawn failure, timeout, cancellation, invalid/unsafe input, output redaction, deep freeze, isolation, and determinism. Production composition may replace the spawn/timer capabilities without changing the public result contract.

## Commit slicing

Recommended commits:

1. contract, contract boundary, and this document;
2. reference runtime and runtime/behavior tests;
3. multi-cut integration requirements.
