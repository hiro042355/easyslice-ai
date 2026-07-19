# PostgreSQL Reconciliation Foundation Validation

## Command

Run the PostgreSQL Reconciliation Store Adapter Foundation V1 validation with:

```text
npm run validate:postgresql-reconciliation-foundation
```

This is the formal validation entry point for this Foundation only. It is
independent from repository-wide lint and application build validation.

The command must be launched as an npm script. The runner validates
`npm_execpath` and starts that npm CLI JavaScript file with the current Node
executable. It does not invoke `npm.ps1`, `npm.cmd`, a shell, or a hard-coded
npm installation path. A missing, invalid, or unavailable `npm_execpath`
causes a safe bootstrap failure before any validation phase starts.

## Prerequisite

Docker must already be available with Linux container support. The runner does
not start Docker Desktop, install packages, retry failed phases, or remove
Docker resources. Existing PostgreSQL test harnesses own ephemeral container
startup and deterministic teardown.

## Foundation scope and order

The runner executes these existing npm scripts sequentially:

1. `test:postgresql-environment`
2. `test:postgresql-reconciliation-migration`
3. `test:postgresql-reconciliation-alignment-migration`
4. `test:postgresql-driver`
5. `test:postgresql-transaction`
6. `test:durable-workflow-stores`
7. `test:slice-a-postgresql-stores`
8. `test:postgresql-reconciliation-stores`
9. `test:reconciliation-runtime`
10. `test:production-workflow-runtime`
11. `typecheck`

`test:postgresql-foundation` and `test:postgresql-environment` target the same
test file. The validation entry point uses only
`test:postgresql-environment`.

Workflow API, browser integration, React Hook, HTTP Panel, Provider, Scheduler,
Worker, and production connection suites are outside this Foundation boundary.
They are not included merely as a repository-wide precaution.

Foundation success guarantees the PostgreSQL environment and migrations,
Driver, Durable Transaction V2, durable Store contracts, Slice A Stores,
Reconciliation Stores, Reconciliation Runtime, Production Runtime foundation,
and TypeScript validation represented by these eleven phases. It does not
guarantee repository-wide lint or a Next.js application build.

## Repository validation

Run the formal repository gate with either command:

```text
npm run validate
npm run validate:repository
```

Both commands start `scripts/validateRepository.mjs`. The Repository Validation
runner is fail-fast and executes:

1. `validate:postgresql-reconciliation-foundation`
2. `lint`
3. `build`

The first phase composes the independently runnable Foundation gate. The
repository-specific phases then apply `eslint .` and `next build` to the
repository and application. Future repository Full Regression phases can be
added to this Repository Validation runner without expanding the Foundation
boundary. A Repository Full Regression phase is not currently defined.

## Failure behavior

Each phase inherits standard input, output, and error streams. The runner stops
at the first non-zero exit or terminating signal, preserves the failing exit
status, and does not run later phases. It reports complete success only after
all phases pass.

## Completion meaning

Verification Matrix Complete, Foundation Validation Complete, and Repository
Validation Complete are separate decisions. The Foundation is Validation
Complete when its eleven-phase entry point finishes successfully. Repository
Validation is complete only when the composed Foundation gate, repository lint,
and application build all finish successfully.
