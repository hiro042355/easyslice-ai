# Temporary Workspace Infrastructure Adapter Foundation V1

## Ownership

This Foundation owns validation, ownership checks, opaque reservation, workspace directory creation, lookup, lifecycle projection, cleanup execution, safe failure normalization, deterministic audit, and immutable results.

It does not own file copying, binary I/O, media processing, FFmpeg, archive generation, network, database, provider integration, HTTP, workflow, or route composition.

## Contract

The type-only contract exposes opaque workspace references only. Absolute or relative paths, directory and file names, temporary-root values, drives, URLs, locators, inode data, and filesystem metadata are forbidden.

## Lifecycle and operations

States are `reserved`, `prepared`, `active`, `cleanup-required`, `cleaned`, and `failed`. The capability exposes `reserve`, `prepare`, `lookup`, and `cleanup`. Duplicate reservation, invalid input, ownership mismatch, and unsupported policy short-circuit before filesystem work.

## Infrastructure boundary

The reference adapter may use only filesystem directory creation/removal, path joining, and the operating-system temporary root for workspace ownership. It returns no resolved location. Each operation performs at most one corresponding filesystem mutation.

## Cleanup and audit

Cleanup is explicit. Cleanup failure preserves the preceding workspace state and adds a safe cleanup classification. Audit contains sequence, state, reason, and cleanup classification only; paths, directory names, exceptions, and stacks are excluded.

## Security

References are restricted to a safe opaque-reference alphabet before path composition. Results are copied and deeply frozen. The adapter has no process, media, archive, network, database, clock, randomness, timer, singleton, or global registry dependency.
