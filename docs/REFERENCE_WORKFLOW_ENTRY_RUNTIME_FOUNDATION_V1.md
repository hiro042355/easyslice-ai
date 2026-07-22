# Reference Workflow Entry Runtime Foundation V1

## Ownership

The runtime validates a transport-neutral entry request, consumes an authorization decision and idempotency classification, selects a workflow definition through an injected registry capability, invokes an injected workflow capability, and projects a secret-free entry result and ordered audit.

## Non-ownership

It does not own HTTP, Next.js routes, server composition, workflow APIs, browser integration, uploads, providers, materializers, output ingestion, operation pipeline internals, persistence, retry scheduling, queues, workers, or polling.

## Dependency direction

External adapters depend on the Workflow Entry Contract and Runtime. The Runtime depends only on the Workflow Entry Contract and Workflow Contract types. Registry and workflow execution are supplied explicitly as capabilities; the runtime does not create them and defines no default or global registry.

## Selection and invocation

Exact selection uses the requested workflow identity. Latest-compatible selection deterministically chooses the greatest registered version for the requested workflow id. Invocation receives the selected definition and a contract-shaped invocation request; implementation internals are not exposed.

## Results

Workflow terminal results are projected to completed, partial, failed, cancelled, or recovery-required entry results. Validation, authorization, semantic conflict, and lookup failures stop before invocation. Reconciliation is a recommendation projection only.

## Determinism and security

Audit entries use append order and zero-based sequence numbers. Inputs and outputs are copied and returned snapshots are deeply frozen. No clock, randomness, environment value, credential, provider reference, storage locator, raw receipt, or dependency error is exposed.

## Future composition

HTTP adapters, workflow APIs, server composition, and persistence must remain separate later foundations. They may adapt their transports to this public API but must not be added to this runtime.
