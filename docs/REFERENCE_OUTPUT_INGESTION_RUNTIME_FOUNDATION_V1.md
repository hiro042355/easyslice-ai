# Reference Output Ingestion Runtime Foundation V1

## Purpose and scope

This foundation executes one validated `OutputIngestionPlan` as one ingestion attempt. It orchestrates injected capabilities and projects deterministic `OutputIngestionResult` or safe `OutputIngestionRecoveryRequiredV2` values.

## Ownership

The executor owns bundle-to-plan validation, ordered per-item capability calls, required/optional outcome classification, duplicate reuse, journal lookup and write, cleanup requests, provenance recording, cancellation markers, and safe result/audit projection.

It does not own plan construction, provider or materializer selection, generation, credentials, endpoints, retry budgets, backoff, scheduling, workflow progression, reconciliation, HTTP, UI, PostgreSQL, storage implementations, workers, queues, polling, or webhooks.

## Injected capabilities

`ProviderOutputFetcher`, `ContentInspector`, `ContentScanner`, `MediaSanitizer`, `DuplicateAssetLookup`, `AssetStoreWriterV2`, `ImportedAssetRegistryV2`, `IngestionJournalV2`, `ProvenanceStoreV2`, and `CleanupSchedulerV2` are mandatory. The executor has no default, hidden, singleton, or fixture dependency.

## Attempt and ordering

One `execute` call is one attempt. The order is bundle validation, Journal create-or-replay, cancellation check, fetch, inspect and validation, scan, sanitize, duplicate lookup, Journal intent CAS, Store V2, Registry V2, Provenance V2, terminal Journal CAS, then result projection. A duplicate skips Store and Registry. Registry failure requests Cleanup V2. The executor never repeats a mutation or schedules another attempt.

## Results and safety

Required failure prevents completion. Optional failure may produce `partial` while preserving successful assets. Issues and audits contain safe enums and counts, not provider references, locators, credentials, endpoints, raw metadata, errors, or stacks. Returned values are copies isolated from journal and dependency state.

## Cancellation and unknown outcomes

Only existing context cancellation stages are honored. No new cancellation state machine or timer is introduced. Retry advice is projected from capability results; Workflow owns retry policy. On mutation `outcome-unknown`, the executor performs exactly one authoritative lookup. A committed observation continues with its receipt and replay evidence. An unavailable observation returns `recovery-required` and stops. Semantic conflict, corruption, stale revision, wrong prior stage, and terminal preservation stop safely. The executor does not own bounded recovery or `still-unknown`.

## Journal and replay

Each item receives a deterministic protected Journal identity and versioned mutation identities. `createIfAbsent` precedes side effects. Completed terminal records replay their isolated safe result without invoking capabilities. Stage changes use revision CAS with an explicit prior stage. A non-terminal replay that cannot be resumed without Recovery evidence returns `recovery-required` or a safe failure; it is never blindly restarted.

## Persistence ordering

Store and Registry intent are recorded before mutation. Acknowledged or authoritatively confirmed Storage receipt is required before Registry. Acknowledged or confirmed Registry receipt is required before Provenance. Raw receipts and locators remain restricted and are not projected into issues or audits. Cleanup scheduling is idempotent and an unknown cleanup acknowledgement follows the same single-lookup rule.

## Fixture and production boundary

Reference fixtures are composed only by tests or a future composition module. This executor imports no concrete fixture. Production composition and connection remain out of scope.

## Verification

Boundary tests verify explicit dependency injection and forbidden imports. Behavior tests cover completion, partial and required failure, cancellation stages, Journal replay and CAS conflicts, mutation unknown outcomes, authoritative recovery, recovery-required projection, semantic conflict, corruption, unavailable dependencies, cleanup, deterministic ordering, invocation bounds, and safe diagnostics.
