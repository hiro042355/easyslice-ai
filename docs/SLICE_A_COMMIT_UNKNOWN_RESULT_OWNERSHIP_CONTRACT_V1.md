# Slice A Commit Unknown Result Ownership Contract V1

## 1. Status

This document is the normative V1 ownership decision for Slice A commit-unknown reconciliation.

## 2. Scope

This Contract defines ownership of transaction `unknown-outcome`, authoritative Store lookup results, and the workflow-level `still-unknown` outcome.

It does not authorize Production connection, Runtime Composition, migration, schema, Statement, Store API, or Provider behavior changes.

## 3. Inputs

The decision is constrained by:

- `DURABLE_WORKFLOW_STORE_ARCHITECTURE_DECISION_CONTRACT_V1.md`;
- `PRODUCTION_WORKFLOW_TRANSACTION_CAPABILITY_ASYNC_SCOPE_CONTRACT_V1.md`;
- `SLICE_A_DURABLE_STORE_CAPABILITY_POSTGRESQL_IDENTITY_STATEMENT_CONTRACT_V1.md`;
- `SLICE_A_POSTGRESQL_CORRUPTION_VERIFICATION_CONTRACT_V1.md`;
- Durable Transaction V2 `commit-unknown` behavior;
- PostgreSQL Driver `unknown-outcome` behavior;
- Slice A atomic authoritative lookup behavior.

## 4. Current Gap

The Driver and Transaction layers represent loss of commit acknowledgement.

The Slice A Store performs one authoritative observation of the Final Result, Result Reference, and Outbox invariant.

The Store result union currently contains `still-unknown`, but the Store implementation has no runtime branch capable of producing it.

No existing Contract assigns temporal, repeated, or cross-attempt uncertainty to the Store.

Treating a type-only member as implemented runtime semantics is prohibited.

## 5. Terms

`unknown-outcome` means that commit acknowledgement was lost and rollback is not proven.

`authoritative lookup` means one bounded database observation of the three-record invariant.

`unavailable` means that the authoritative observation could not be obtained safely.

`still-unknown` means that the reconciliation owner cannot reach a terminal conclusion after applying its bounded temporal policy.

## 6. Option 1 — Store Runtime Outcome

Option 1 makes `still-unknown` a direct Store lookup result.

It would require a new distinction between an unavailable read and a completed read that remains temporally inconclusive.

The current single-statement count lookup has no safe information with which to make that distinction.

Implementing this option would require new runtime semantics, dedicated verification, and potentially new Statements or observation policy.

Option 1 is rejected for V1.

## 7. Option 2 — Remove from V1 Store Union

Option 2 limits Store lookup to `committed`, `not-committed`, `corrupted`, and `unavailable`.

This accurately describes the current Store implementation.

Removing the union member requires a versioned type and Contract migration plus consumer regression analysis.

Option 2 is compatible with this ownership decision but is deferred to a separate type-versioning Contract.

## 8. Option 3 — Reconciliation Ownership

Option 3 keeps one authoritative Store observation bounded to database facts.

The Reconciliation owner performs bounded repeat policy, elapsed-time policy, escalation, and final uncertainty classification.

The Reconciliation owner may produce `still-unknown` only after safe Store observations and policy exhaustion.

Option 3 is selected.

## 9. Normative Ownership

The PostgreSQL Driver owns physical commit acknowledgement classification.

Durable Transaction V2 owns conversion of Driver `unknown-outcome` into transaction `commit-unknown` and connection discard.

The Slice A Store owns one authoritative invariant lookup.

The Reconciliation layer owns repeated lookup scheduling and the workflow-level `still-unknown` outcome.

No layer may infer another layer's result from elapsed wall-clock time alone.

## 10. Store Lookup Results

The V1 Store runtime lookup has four effective outcomes:

- `committed`: exactly one semantically consistent Final Result, Reference, and Outbox observation;
- `not-committed`: all three authoritative observations are absent;
- `corrupted`: partial, duplicate, malformed, or semantically inconsistent authoritative observation;
- `unavailable`: a safe authoritative observation could not be completed.

The Store does not emit `still-unknown` in V1 runtime behavior.

## 11. Difference Between unavailable and still-unknown

`unavailable` is an observation result from a specific Store lookup attempt.

`still-unknown` is a policy result after the Reconciliation owner processes one or more Store observations and its bounded policy cannot safely conclude committed, not-committed, or corrupted.

An individual unavailable attempt is insufficient by itself to claim `still-unknown`.

The exact retry budget, elapsed-time budget, persistence, and escalation channel require a future Reconciliation Contract.

## 12. Corruption

Partial authoritative state is `corrupted`, not `still-unknown`.

Duplicate authoritative observations are `corrupted`.

Semantic mismatch among Final Result, Reference, and Outbox is `corrupted`.

Corruption must never be automatically repaired by the Store lookup.

## 13. Security

Lookup and reconciliation results must not expose raw rows, protected identities, token values, tenant values, Asset IDs, SQL, connection strings, or raw errors.

Diagnostics are limited to safe result classes and bounded issue codes.

## 14. Retry and Repair

Blind transaction retry after `commit-unknown` is prohibited.

Provider resubmission based on `still-unknown` is prohibited.

The Store must not perform temporal retry loops.

Automatic repair of partial state is prohibited.

## 15. Compatibility

The existing Store union remains unchanged in this Contract to avoid an unversioned breaking change.

The unused `still-unknown` member is legacy over-permission and does not establish Store runtime capability.

Future removal requires a versioned Store capability Contract and consumer migration.

Future Reconciliation implementation requires its own Contract before code changes.

## 16. Verification Consequence

Slice A Store Verification is complete when all effective Store runtime outcomes are verified:

- committed;
- not-committed;
- corrupted;
- unavailable.

The absence of a Store runtime `still-unknown` branch is not a Store Verification gap after adoption of this Contract.

Type-only fixture coverage must not be presented as runtime coverage.

## 17. Deferred Work

The following are deferred:

- Reconciliation Runtime interface;
- bounded lookup retry policy;
- persistence of reconciliation attempts;
- escalation and operator workflow;
- versioned removal of Store `still-unknown`;
- Production Composition and binding.

## 18. Stop Conditions

Stop before implementation if Reconciliation ownership requires a new Store Statement, schema change, migration, or Production connection.

Stop if `unavailable` and `still-unknown` cannot be separated without raw or sensitive observations.

Stop if a test-only branch would be promoted as Production semantics.

Stop if a nonexistent Store runtime branch would be treated as verified through a fixture alone.

## 19. Decision

Selected: Option 3.

`still-unknown` belongs to an upper Reconciliation layer, not the Slice A Store authoritative lookup.

The effective V1 Store lookup outcomes are committed, not-committed, corrupted, and unavailable.

No Store implementation or type change is authorized by this Contract.

## 20. Readiness

Phase A existing-runtime Verification may be marked complete when its dedicated fixtures pass.

The Slice A PostgreSQL Store Adapter Foundation V2 may be marked complete because `still-unknown` is outside the Store Verification Matrix under this ownership decision.

Reconciliation Runtime remains not implemented and requires a later Contract-driven phase.
