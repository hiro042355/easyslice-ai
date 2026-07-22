# Output Ingestion Persistence and Recovery Contract V1

## 1. Status

This document is the normative V1 architecture decision for persistence acknowledgement loss, idempotent replay, duplicate reuse, orphan handling, and recovery ownership in Output Ingestion. It is a design contract only. It does not authorize changes to Production code, public TypeScript shapes, storage, registry, journal, migration, database, or composition.

## 2. Purpose

Output Ingestion crosses content storage, imported-asset registration, provenance, and journal boundaries that cannot be treated as one transaction. A successful mutation whose acknowledgement is lost is not equivalent to failure, rollback, or absence. This Contract defines the information and ownership required to resolve that uncertainty without blind retry or duplicate side effects.

## 3. Current gap

The current `AssetStoreWriter` returns only `written` or `failed`. The current `ImportedAssetRegistry` returns only `created` or `failed`. Neither can represent acknowledgement loss after a mutation may have committed.

The current `IngestionJournal` stores only a final fingerprint and `OutputIngestionResult`. It cannot record stage intent, authoritative mutation identity, outcome uncertainty, orphan state, or recovery progress.

`DuplicateAssetLookup` requires checksum, size, canonical MIME, and policy compatibility. Those facts are obtained after fetch and inspection, so it cannot perform content duplicate lookup before fetch.

## 4. Terms

- **definite success**: the capability acknowledges that the requested mutation completed and returns a semantically matching result.
- **definite failure**: the capability proves that the requested mutation did not complete or rejected it before mutation.
- **outcome unknown**: the request may have completed, but acknowledgement was lost and absence is not proven.
- **authoritative lookup**: one bounded observation by the owner of the mutated state.
- **replayed**: authoritative state already contains the same identity and semantic fingerprint.
- **semantic conflict**: the same idempotency identity exists with a different semantic fingerprint.
- **orphan**: stored content exists without the intended active registry/provenance relationship.
- **cleanup-required**: cleanup must be scheduled under lifecycle policy; it does not mean deletion completed.
- **still unknown**: the Recovery owner cannot reach a terminal result after its bounded policy is exhausted.

## 5. Selected architecture

Persistence capabilities remain owners of one mutation and one authoritative lookup. The Executor performs one ingestion attempt and never retries an unknown mutation. A dedicated Output Ingestion Recovery owner interprets authoritative lookup results under a bounded temporal policy. Workflow owns scheduling, retry budget, backoff, and user-visible progression.

The Journal is the durable coordination record. It is not a substitute for authoritative Storage or Registry lookup. Journal state and authoritative state must agree before replay, continuation, or cleanup.

## 6. Identity and semantic fingerprint

Every side-effecting stage requires a protected, stable idempotency identity derived outside the Store implementation. The identity is bound to ingestion key, plan version, provider, API version, operation, slot, role, expected kind, canonical MIME, checksum when known, size, retention, region, and sensitivity policy.

The semantic fingerprint is deterministic and versioned. Raw provider references, URLs, locators, credentials, tenant values, asset IDs, prompts, and content are forbidden inputs to ordinary diagnostics. Protected values may be persisted only in a restricted record designed for that purpose.

An idempotency identity must never be regenerated during recovery. Same identity and same fingerprint is replay. Same identity and different fingerprint is semantic conflict and stops automatic recovery.

## 7. Future write outcome contract

The future versioned `AssetStoreWriter` result must distinguish:

- `written`: mutation acknowledged with a restricted stable storage receipt;
- `replayed`: the same write identity and fingerprint already produced the same object;
- `not-written`: authoritative pre-mutation rejection or proven absence;
- `semantic-conflict`: identity exists with different semantics;
- `outcome-unknown`: acknowledgement was lost; no retry is permitted before lookup;
- `unavailable`: no safe mutation result or authoritative observation was obtained;
- `corrupted`: authoritative storage evidence is duplicate, malformed, partial, or semantically inconsistent.

`failed` must not collapse `not-written`, `outcome-unknown`, `unavailable`, or `corrupted`. A retryable transport classification does not prove `not-written`.

## 8. Future registry outcome contract

The future versioned `ImportedAssetRegistry` result must distinguish:

- `created`: registration acknowledged;
- `replayed`: the same registration identity and fingerprint already exists;
- `not-created`: mutation is proven absent or rejected before mutation;
- `semantic-conflict`: identity exists with different semantics;
- `outcome-unknown`: create may have committed but acknowledgement was lost;
- `unavailable`: safe mutation or lookup could not complete;
- `corrupted`: duplicate, partial, malformed, or inconsistent authoritative registration.

Registry create must accept a stable idempotency identity. Asset identity allocation is Registry-owned and must be replayable. The Executor must not generate a replacement asset identity after unknown outcome.

## 9. Authoritative lookup contracts

Storage and Registry each require a versioned lookup capability using protected mutation identity and expected semantic fingerprint.

One lookup returns only:

- `committed`: exactly one semantically matching authoritative record;
- `not-committed`: authoritative absence is proven;
- `semantic-conflict`: identity exists with different semantics;
- `corrupted`: duplicate, partial, malformed, or inconsistent evidence;
- `unavailable`: a safe authoritative observation could not be completed.

The lookup does not return `still-unknown`. Temporal uncertainty belongs to the Recovery owner. It must not expose raw object keys, locators, asset IDs, rows, SQL, provider references, or raw errors.

## 10. Journal contract

The future Journal is an append-only or compare-and-set durable stage record. At minimum it records a version, protected ingestion identity, semantic fingerprint, slot and role classification, current stage, attempt, revision, mutation identity references, safe outcome class, recovery status, cleanup requirement, and safe timestamps supplied by its authoritative persistence boundary.

Required stage classes are:

1. `planned`;
2. `content-validated`;
3. `duplicate-reused`;
4. `store-intent-recorded`;
5. `stored` or `store-outcome-unknown`;
6. `registry-intent-recorded`;
7. `registered` or `registry-outcome-unknown`;
8. `provenance-recorded`;
9. `completed`, `failed`, `semantic-conflict`, `corrupted`, or `cleanup-required`.

Intent must be durably recorded before the corresponding mutation. Stage advancement uses revision compare-and-set. A stale revision cannot overwrite a newer or terminal record. Journal replay is allowed only when identity, fingerprint, and authoritative stage evidence agree.

## 11. Replay decision

Before any side effect, the Executor reads the Journal by protected ingestion identity:

- terminal same-fingerprint result: return a copy of the recorded safe result;
- non-terminal same-fingerprint record: continue only from a Contract-defined recoverable stage;
- different fingerprint: return semantic conflict;
- corrupted journal: stop and route to recovery/manual repair;
- unavailable journal: stop the attempt with safe retry advice; do not perform a mutation.

Journal absence permits a new attempt only after `planned` is created atomically. Final result replay must not depend on caller memory or fixture state.

## 12. Duplicate reuse ordering

Two different lookups are intentionally separated:

- **pre-fetch idempotency lookup**: Journal lookup by protected ingestion identity; this occurs before side effects;
- **content duplicate lookup**: checksum + size + canonical MIME + policy compatibility; this occurs only after fetch and inspection.

Moving content duplicate lookup before fetch is rejected for V1 because its required facts do not yet exist. Provider checksum alone is not authoritative content identity. A future trusted content-manifest contract could introduce a separate pre-fetch optimization, but it must not weaken post-inspection verification.

Duplicate reuse must validate region, retention, sensitivity, deletion state, availability, integrity, and required metadata. Reuse creates or verifies the role/provenance relationship but does not rewrite content. A duplicate with incompatible policy is not reusable.

## 13. Normal execution ordering

The normative order is:

1. validate Plan and reference bundle;
2. read or create Journal identity;
3. apply cancellation marker;
4. fetch and inspect content;
5. validate MIME, size, checksum, metadata, and policy;
6. scan and sanitize;
7. perform content duplicate lookup;
8. if reusable, record reuse and provenance;
9. record storage intent;
10. perform storage write;
11. record acknowledged storage result or `store-outcome-unknown`;
12. record registry intent;
13. perform registry create;
14. record acknowledged registry result or `registry-outcome-unknown`;
15. record provenance;
16. project imported asset, audit, and terminal result.

No later stage begins while an earlier mutation outcome is unknown.

## 14. Unknown storage outcome

On `store outcome-unknown`, the Executor records the safe unknown class if possible and stops. It must not repeat write, create Registry state, infer an orphan, or claim rollback.

Recovery performs Storage authoritative lookup. `committed` continues at `stored`; `not-committed` permits Workflow to schedule a new attempt using the same mutation identity; `semantic-conflict` or `corrupted` stops automatic recovery; `unavailable` remains a per-observation result. Bounded policy exhaustion produces Recovery-owned `still-unknown` and escalation.

## 15. Unknown registry outcome

On `registry outcome-unknown`, the Executor stops and must not allocate another asset identity, repeat create, write provenance, or delete stored content.

Recovery performs Registry authoritative lookup. `committed` continues at `registered`; `not-committed` may retry create with the same identity after confirming the storage receipt; `semantic-conflict` or `corrupted` stops; `unavailable` is processed by bounded policy. Content is an orphan candidate while Registry absence is not proven, not an automatically deletable orphan.

## 16. Provenance ordering and outcome

Provenance follows acknowledged or authoritatively confirmed registration. Provenance must be idempotent by registration identity and role. Provenance failure does not erase or hide an existing registered asset. It marks the Journal `cleanup-required` or a dedicated safe repair-required class according to lifecycle policy.

Unknown provenance outcome requires the same intent, idempotency, and authoritative lookup pattern before automatic retry. If the first future implementation cannot provide authoritative provenance lookup, it must stop at repair-required rather than infer absence.

## 17. Orphan and cleanup

An object becomes a confirmed orphan only when Storage is committed and Registry is authoritatively not committed, or when a registered relationship has been safely superseded under lifecycle policy. Unknown Registry outcome is not proof of orphan state.

`cleanup-required` is a durable request, not proof of cleanup. CleanupScheduler receives a restricted handle and safe reason. It is idempotent and policy-bound. It must respect retention, legal hold, deletion state, residency, and active Registry references. Automatic deletion of a registered or still-unknown object is prohibited.

## 18. Ownership

### Executor

Owns one attempt, ordering, dependency invocation, safe classification, Journal stage requests, required/optional result projection, and stopping on unknown outcome. It owns no retry loop or temporal policy.

### Asset Store

Owns atomic object write semantics, storage mutation identity, storage receipt, replay detection, semantic conflict, and one authoritative storage lookup. It does not create Registry or Workflow state.

### Imported Asset Registry

Owns asset identity allocation, create idempotency, Registry replay/conflict classification, and one authoritative Registry lookup. It does not retry storage or delete objects.

### Journal Store

Owns durable stage truth, revision compare-and-set, terminal preservation, and replay records. It does not infer Storage or Registry facts without authoritative evidence.

### Provenance Store

Owns idempotent provenance mutation and, when supported, one authoritative provenance lookup.

### Recovery owner

Owns repeated authoritative lookup policy, bounded elapsed/attempt policy, `still-unknown`, corruption stop, repair routing, and continuation from confirmed stages. It does not resubmit provider generation.

### Workflow

Owns retry budget, backoff, scheduling, attempt creation, cancellation intent, user-visible progression, and escalation presentation. It consumes safe recovery outcomes and must not reconstruct classifications from raw errors.

## 19. Retry policy

Blind retry after any outcome-unknown is prohibited. The same mutation may be retried only after authoritative `not-committed`, with the same idempotency identity and semantic fingerprint. `unavailable` does not prove `not-committed`. Retryable advice is a scheduling hint, not mutation safety proof.

## 20. Security and diagnostics

Public result, issue, audit, log, metric, and exception projection must not contain provider references, URLs, storage locators, asset IDs, idempotency keys, fingerprints, tenant values, credentials, content, SQL, raw rows, raw metadata, raw errors, or stacks.

Allowed diagnostics are bounded stage class, safe outcome class, retryable advice, role, kind, attempt class, and reason code. Protected identities and receipts are passed only through restricted capability types.

## 21. Compatibility and versioning

The current V1 TypeScript capabilities cannot express these decisions and remain unchanged by this document. Implementation requires new versioned capability shapes; existing unions must not be silently widened when that would change exhaustive consumers.

V1 Plan, Expected Output, Policy, and Provider Reference Bundle shapes do not require changes. The Executor result boundary needs a versioned attempt result capable of representing `recovery-required` without claiming final ingestion failure or success. Workflow consumers must migrate explicitly.

## 22. Required future Contract changes

Before implementation, define and verify:

1. versioned storage write and authoritative lookup results;
2. versioned Registry create and authoritative lookup results;
3. versioned Journal record, CAS, lookup, and terminal preservation;
4. protected mutation identity and semantic fingerprint types;
5. versioned Executor attempt result with recovery-required projection;
6. provenance idempotency and lookup capability, or explicit repair-only fallback;
7. Cleanup request persistence and idempotency;
8. Recovery Runtime bounded policy and Workflow scheduling interface;
9. durable schema and migration ownership, if PostgreSQL is selected;
10. concurrency, replay, stale revision, semantic conflict, corruption, and unknown-outcome verification matrices.

## 23. Executor impact

The current uncommitted Executor may validate explicit dependency injection and ordinary one-attempt behavior, but it cannot be declared Runtime Complete while write/Registry unknown outcomes are absent. It must not emulate unknown outcomes with generic `failed`, `retryable`, fixture flags, or thrown exceptions.

After versioned capabilities exist, the Executor must record intent before mutation, stop on unknown, return recovery-required, and resume only from Journal plus authoritative lookup evidence. It must not own bounded recovery.

## 24. Stop conditions

Stop implementation if unknown outcome must be treated as failure, rollback, or success; if a new idempotency identity would be generated; if content duplicate lookup must occur before checksum exists; if raw identifiers are required for diagnostics; if cleanup would delete unknown or registered content; or if Journal truth is used in place of authoritative Storage/Registry lookup.

## 25. Decision

Selected: versioned persistence capabilities plus a durable Journal and separate Recovery owner.

Rejected: blind retry, generic failure normalization, Executor-owned temporal retry, fetch-before-contract inference, content duplicate lookup before inspection, automatic orphan deletion, and Workflow reconstruction from raw errors.

## 26. Readiness

Architecture decision: Complete.

Current Runtime implementation readiness: Blocked pending the future Contract and durable capability changes listed in Section 22.

Production readiness: false. Production composition and connection remain forbidden.
