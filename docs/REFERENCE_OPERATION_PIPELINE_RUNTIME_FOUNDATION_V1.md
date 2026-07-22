# Reference Operation Pipeline Runtime Foundation V1

## Status

Foundation V1 defines a deterministic, single-attempt reference runtime over the versioned Operation Pipeline Contract and Operation Binding Foundation.

## Ownership

The runtime accepts a Pipeline Definition, validates declarative binding edges, orders stages deterministically, invokes explicitly injected operation capabilities once, propagates cancellation markers, aggregates retry recommendations, aggregates ordered audit evidence, and returns an immutable Pipeline result snapshot.

## Non-ownership

The runtime does not own Workflow orchestration, Provider or Materializer execution, Output Ingestion implementation, Upload, HTTP, SQL, queues, polling, retry scheduling, background workers, process lifecycle, or production composition.

## Dependency injection

Every operation and cancellation capability is supplied to the constructor. There is no default registry, singleton, global registry, or default dependency. Operation implementation and selection remain composition responsibilities.

## Execution model

One `execute()` call performs one attempt. Stages are ordered by declared numeric order and then stage ID. Binding mappings project predecessor output fields into successor input fields. A required operation failure stops the attempt. An optional operation failure is recorded and permits a degraded completed projection. No operation is retried internally.

## Cancellation

Cancellation is checked before the pipeline, before each operation, and after each operation. Cancellation after an irreversible external effect does not imply rollback; the injected operation and its owning durable capability retain outcome authority.

## Retry recommendation

The runtime aggregates advice only. Precedence is `reconcile`, `wait`, `retry`, then `do-not-retry`. Workflow or another policy owner decides whether and when another attempt occurs.

## Audit and immutability

Visited stages, reason codes, transition count, final stage, stage outputs, and optional failures are projected in deterministic order. Results and nested snapshots are copied and deeply frozen. Raw credentials, Provider references, storage locators, and dependency errors are not part of this Foundation.

## Security boundary

The runtime performs no network, filesystem, environment, clock, random, timer, database, or process access. It imports only the Operation Pipeline Contract and Operation Binding Foundation.

## Versioning

Runtime snapshots use version `1.0`. Changes to ordering, cancellation points, retry precedence, result shape, or binding projection require a versioned contract decision.

## Production connection

Production composition and Workflow integration are not authorized by this Foundation. They require a separate binding/composition foundation after runtime validation.
