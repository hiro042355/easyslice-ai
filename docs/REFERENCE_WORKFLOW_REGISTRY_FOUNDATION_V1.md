# Reference Workflow Registry Foundation V1

## Status

Foundation V1 defines an explicitly instantiated, definition-only Workflow Registry.

## Ownership

The Registry validates and stores versioned Workflow Definitions, rejects duplicate workflow identity/version pairs, performs exact identity and version lookup, enumerates definitions deterministically, and returns immutable secret-free snapshots.

## Non-ownership

The Registry does not create or execute Workflow Runtime, Operation Pipeline, Provider, Materializer, Upload, or Output Ingestion capabilities. It owns no Server Entry, Server Composition, retry, reconciliation, HTTP, SQL, queue, worker, polling, process, or deployment behavior.

## Construction

Callers explicitly construct `ReferenceWorkflowRegistry`. No default registry, singleton, global registry, or module-level catalog exists. Definitions are registered through `register()`.

## Identity and lookup

Uniqueness is the exact pair of workflow ID and workflow version. Duplicate registration is rejected without first-entry-wins replacement. `getByIdentity()` and `getVersion()` require exact values and return `undefined` for unknown definitions.

## Validation

Validation covers contract and identity shape, stage ownership, stage and order uniqueness, Pipeline reference shape, dependency endpoints, duplicate dependencies, and dependency cycles. Issues use deterministic zero-based sequence order.

## Deterministic enumeration

Snapshots sort first by workflow ID and then by workflow version. Registration order is not observable through enumeration.

## Immutability and projection

Definitions are copied through an allowlisted projection when stored and returned. Snapshots and nested definitions are deeply frozen. Extra caller fields are not retained, preventing accidental secret or runtime-object projection.

## Security boundary

The Registry performs no network, filesystem, environment, clock, random, timer, database, queue, or process access. Definition shapes contain no credentials, tokens, Provider references, signed URLs, storage locators, receipts, raw errors, or stack traces.

## Production connection

Workflow Runtime binding, Registry lifecycle persistence, Server Entry, Server Composition, and deployment connection require separate foundations.
