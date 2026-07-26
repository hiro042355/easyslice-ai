# Workspace and FFmpeg Contract Extraction Foundation V1

## Purpose

This Foundation promotes existing module-private infrastructure dependency types to the established public Contract modules. It enables a future Server Runtime Assembly to type explicit Workspace filesystem and FFmpeg spawn/timer dependencies without duplicating Adapter-local shapes.

## Workspace extraction

`WorkspaceFilesystem` moves unchanged from `referenceTemporaryWorkspaceAdapter.ts` to `workspace/types.ts`. Its `mkdir(location)` and `rm(location)` methods, Promise return types, constructor option, default implementation, and runtime semantics remain unchanged.

## FFmpeg extraction

`ProcessLike`, `SpawnCapability`, and `TimerCapability` move unchanged from `referenceFFmpegProcessAdapter.ts` to `ffmpegProcess/types.ts`. Spawn arguments, shell and stdio constraints, process observation, signal handling, scheduling handles, constructor defaults, and runtime semantics remain unchanged.

## Adapter boundary

The Reference Adapters import the extracted types from their public Contract modules. They retain their existing default filesystem, spawn, and timer implementations. No constructor, method, decision, validation, execution, timeout, cancellation, or cleanup behavior changes.

## Non-ownership

This Foundation creates no implementation, common filesystem abstraction, locator, archive builder, Runtime Binding, Server Runtime Assembly, Route, HTTP projection, Blob conversion, authentication, environment lookup, singleton, or global state. Materialization and ZIP Packaging contracts are unchanged.

## Explicit dependency boundary

A future Assembly may import these types and pass compatible infrastructure implementations explicitly. This Foundation does not determine paths, roots, executable locations, commands, filenames, archive names, or dependency lifecycles.

## Side effects and compatibility

Both Contract modules remain type-only. Extraction performs no construction or I/O during import. Existing Adapter consumers retain the same constructor shapes and behavior.

## Validation

Boundary tests verify public exports and removal of private duplicates. Existing Workspace and FFmpeg behavior suites prove parity. Scoped TypeScript compilation and source audits verify that Materialization, ZIP Packaging, Runtime Binding, HTTP, Route, and singleton boundaries remain unchanged.
