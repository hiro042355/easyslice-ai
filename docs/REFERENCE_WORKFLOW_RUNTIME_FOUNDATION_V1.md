# Reference Workflow Runtime Foundation V1

## Status

Foundation V1 defines a deterministic single-attempt Workflow Runtime over the Workflow Contract and the public Operation Pipeline Contract.

## Ownership

The runtime receives a Workflow Definition, validates its static stage graph, resolves declarative Pipeline references through an injected capability, invokes each resolved Pipeline once, progresses required and optional stages deterministically, propagates cancellation, aggregates retry and reconciliation recommendations, creates ordered audit evidence, and projects an immutable Workflow result.

## Non-ownership

It does not own a Workflow Registry, Server Entry, Server Composition, Provider or Materializer execution, Upload, Output Ingestion execution, Pipeline implementation, HTTP, SQL, queues, workers, polling, retry scheduling, reconciliation execution, or process lifecycle.

## Pipeline boundary

Workflow sees only versioned Pipeline identities and the public `execute` contract. It does not inspect Pipeline Runtime internals, bindings, operation capabilities, or concrete implementations. Resolution is explicitly injected; there is no default or global registry.

## Stage progression

Stages are ordered by declared order and then stage ID. A required stage failure stops the attempt. An optional stage failure is retained in a partial result and later stages may continue. A recovery-required Pipeline outcome stops immediately and returns a Workflow recovery recommendation.

## Cancellation

Cancellation is checked before the Workflow, before each stage, and after each stage. Cancellation never implies rollback of an already authoritative Pipeline result.

## Retry and reconciliation

The runtime aggregates recommendations only. It contains no retry loop, timer, scheduler, polling instruction, reconciliation call, or repair action.

## Audit and immutability

Audit entries use deterministic zero-based sequence order. Results, stage outputs, audit entries, and snapshots are copied and deeply frozen. Public projections contain no credentials, Provider references, signed URLs, storage locators, receipts, raw errors, or stack traces.

## Security boundary

The runtime performs no network, filesystem, database, environment, clock, random, timer, queue, or process access.

## Production connection

Workflow Registry, Entry, Server Composition, durable lifecycle persistence, and deployment connection require separate foundations and are not authorized here.
