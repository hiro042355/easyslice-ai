# Multi-cut Replay PostgreSQL Statement Architecture V1

## 1. Status and scope

- Status: Proposed statement-level transaction architecture.
- Source of truth: Replay Shared Types, Resolution and Admission v3,
  Lifecycle and Recovery v3, PostgreSQL Logical Schema V1, and the Replay
  Lifecycle ADR.
- This document defines logical statement boundaries only.
- It defines no statement text, query notation, physical type, DDL, migration,
  adapter implementation, Store implementation, or Workflow implementation.
- No field, state, or public classification beyond those sources is introduced.

## 2. Statement family

| Stable logical name | Capability owner | Operation |
|---|---|---|
| `resolve-new-reservation` | Resolution | establish a new processing reservation |
| `resolve-existing-replay` | Resolution | classify an existing authoritative replay record |
| `lookup-authoritative-replay` | Recovery | read the authoritative four-state projection |
| `renew-processing-reservation` | Lifecycle | renew current processing ownership |
| `complete-processing-replay` | Lifecycle | transition processing to completed |
| `fail-processing-replay` | Lifecycle | transition processing to failed |
| `release-processing-replay` | Lifecycle | transition processing to released |
| `takeover-stale-processing-replay` | Recovery | replace stale processing ownership |

These names describe intent rather than a database technique.

## 3. Common transaction rules

### 3.1 Target identity

- Resolution targets complete `MultiCutReplayProtectedScope` plus
  `MultiCutReplayResolvedIdentity`.
- Lifecycle and Recovery target the authoritative record identified by
  `MultiCutReplayResolvedIdentity`.
- The Protected Scope established by Resolution is immutable.
- Raw tenant, raw idempotency key, and raw fingerprint are never statement
  inputs.

### 3.2 Mutation affected-row interpretation

For every mutation statement:

- exactly one means the conditional mutation selected one authoritative record;
- zero means no success may be inferred and an authoritative follow-up is
  required for public classification;
- more than one is an invariant violation and is never normalized into an
  ordinary conflict or unavailable result.

### 3.3 Retry safety

- A mutation is not blindly repeated after an unknown commit outcome.
- Retry is permitted only after authoritative reconciliation establishes that
  the prior mutation was not applied and the original preconditions remain
  valid.
- A conflict, terminal result, corrupted result, or reconciliation-required
  result is not retry authorization.

## 4. State integrity

| State | Required logical projection | Forbidden logical projection |
|---|---|---|
| `processing` | complete Reservation Evidence | Result Reference |
| `completed` | Result Reference and completion metadata | publicly returned Reservation Evidence |
| `failed` | failure metadata | Result Reference and publicly returned Reservation Evidence |
| `released` | release metadata | Result Reference and publicly returned Reservation Evidence |

- No fifth state is permitted.
- Completed, failed, and released are terminal for Lifecycle.
- A released record may be re-reserved only by a later Resolution operation.
- Normal Recovery lookup never returns Reservation Evidence for any state.

## 5. Revision rules

- The comparison position is the mutation precondition represented by
  `reservationEvidence.expectedRevision`.
- Renew, complete, fail, release, and takeover advance the authoritative
  revision relation on success.
- Renew returns updated evidence whose revision is advanced relative to the
  previous evidence; no numeric increment is prescribed.
- Takeover returns new evidence whose revision is advanced relative to the
  previous evidence; no numeric increment is prescribed.
- Terminal transitions return the resulting authoritative revision string.
- A revision mismatch maps to `stale-revision` where that classification is
  exposed.

## 6. Fence rules

- Initial reservation returns the initial fencing token in Reservation Evidence.
- Renew compares and preserves the existing fencing token.
- Complete, fail, and release compare the existing fencing token and issue no
  new token.
- Takeover is the only operation that issues a new fencing token.
- A successful takeover makes the old fencing token unable to authorize a
  later mutation.
- Terminal results do not expose a new Reservation Evidence.
- A fence mismatch maps to `stale-fence` where that classification is exposed.

## 7. Lease and clock rules

- PostgreSQL is the authoritative clock owner selected by the Lifecycle ADR.
- Application time is not authoritative for lease expiry or stale takeover.
- Resolution establishes the initial lease identity and expiry.
- Renew preserves lease identity and updates lease expiry within one mutation.
- Takeover establishes a new lease identity and new expiry within one mutation.
- The time observation used by one mutation is transaction-consistent.
- Clock skew in callers cannot create, renew, or take over ownership.

## 8. Statement: resolve-new-reservation

| Required aspect | Definition |
|---|---|
| capability owner | Resolution |
| logical input | Resolution v3 version, Protected Scope, Replay Identity |
| logical output | `new` with authoritative Replay Identity and Reservation Evidence, or a non-success Resolution classification |
| targeted record | scope plus protected key identity |
| preconditions | input versions and protected identity shapes are accepted; no authoritative record is present |
| state predicate | absence is authoritative; new state is `processing` |
| comparison predicate | uniqueness boundary is scope plus key; fingerprint belongs to the supplied Replay Identity |
| mutation boundary | record creation and complete initial Reservation Evidence become authoritative together |
| returned projection | identity and full evidence: reservation, expected revision, fence, lease, expiry, attempt |
| affected-row interpretation | one is candidate success; zero requires existing-record classification; more than one is invariant violation |
| authoritative follow-up | resolve the same protected scope and Replay Identity |
| public Contract mapping | confirmed creation maps to Resolution `new` |
| commit-unknown recovery | Recovery authoritative observation determines whether processing reservation exists; no blind creation retry |
| retry safety | retry only after authoritative absence is established |
| prohibited hidden behavior | separate check-then-create window, raw identity projection, Workflow invocation, Result Reference creation |

Concurrent creation loss is handled as existing-record resolution, never as an
unconditional second creation.

## 9. Statement: resolve-existing-replay

| Required aspect | Definition |
|---|---|
| capability owner | Resolution |
| logical input | Resolution v3 version, Protected Scope, Replay Identity |
| logical output | `replay`, `duplicate-in-flight`, `authoritative-failed`, `semantic-conflict`, `unavailable`, or `new` for an allowed released re-reservation |
| targeted record | the authoritative record at the protected uniqueness boundary |
| preconditions | an authoritative record is observed |
| state predicate | completed, processing, failed, or released only |
| comparison predicate | supplied fingerprint identity is compared with the authoritative fingerprint identity |
| mutation boundary | read-only except released re-reservation, whose new processing ownership is one mutation |
| returned projection | completed returns protected Result Reference; released re-reservation returns new evidence; other non-success variants return neither |
| affected-row interpretation | released re-reservation uses one/zero/more-than-one rules; read classifications have no affected-row success |
| authoritative follow-up | repeat authoritative classification after conflict or unknown released re-reservation outcome |
| public Contract mapping | completed → `replay`; processing → `duplicate-in-flight`; failed → `authoritative-failed`; different fingerprint → `semantic-conflict`; released reservation success → `new` |
| commit-unknown recovery | released re-reservation is reconciled as reservation commit unknown; read-only classifications have no commit |
| retry safety | released mutation is not blindly repeated |
| prohibited hidden behavior | mapping failed to semantic conflict/unavailable, exposing processing evidence, returning Final Result, re-reserving failed |

Released has no dedicated success variant because successful re-reservation is
the Resolution `new` meaning with new Reservation Evidence.

## 10. Statement: lookup-authoritative-replay

| Required aspect | Definition |
|---|---|
| capability owner | Recovery |
| logical input | Recovery v3 version, Replay Identity, Recovery reason |
| logical output | `authoritative` four-state record or classified `unavailable` |
| targeted record | authoritative replay record for the supplied identity |
| preconditions | accepted input version and identity |
| state predicate | processing, completed, failed, or released only |
| comparison predicate | returned record identity matches requested Replay Identity |
| mutation boundary | none; read-only |
| returned projection | processing: revision and lease expiry; completed: revision, Result Reference, completedAt; failed: revision, failedAt, classification; released: revision, releasedAt |
| affected-row interpretation | not applicable to mutation; observation cardinality must be zero or one |
| authoritative follow-up | none inside lookup; this operation is the authoritative follow-up |
| public Contract mapping | missing, corrupted, reconciliation-required, dependency-unavailable, and internal-failure use Recovery vocabulary |
| commit-unknown recovery | invoked for reservation or lifecycle unknown outcome where ordinary state is sufficient |
| retry safety | read may be repeated; it never authorizes blind mutation retry |
| prohibited hidden behavior | mutation, stale takeover, evidence disclosure, Result Reference resolution, Workflow recovery |

Stale ownership classification is delegated to takeover. Lookup does not mutate
an expired processing record.

## 11. Statement: renew-processing-reservation

| Required aspect | Definition |
|---|---|
| capability owner | Lifecycle |
| logical input | Lifecycle v3 renew input, Replay Identity, previous Reservation Evidence |
| logical output | `renewed`, `conflict`, or `unavailable` |
| targeted record | current authoritative processing record |
| preconditions | record is processing and previous ownership evidence is current |
| state predicate | processing only |
| comparison predicate | replay, reservation, lease, fence, attempt, and expected revision match |
| mutation boundary | revision relation and lease expiry update together; reservation, lease, fence, and attempt identities remain unchanged |
| returned projection | updated Reservation Evidence |
| affected-row interpretation | one → candidate renewed; zero → authoritative reconciliation; more than one → invariant violation |
| authoritative follow-up | `reconcileReservationMutation` with mutation `renew` and previous evidence |
| public Contract mapping | confirmed evidence → `renewed`; ownership/revision mismatch → conflict classification; dependency failure → unavailable |
| commit-unknown recovery | confirmed/not-applied/conflict/terminal/not-found/corrupted/unavailable/reconciliation-required are preserved |
| retry safety | only `not-applied` may permit caller policy to retry after revalidating preconditions |
| prohibited hidden behavior | new fence, new reservation identity, new lease identity, incremented attempt, application-clock expiry |

## 12. Statement: complete-processing-replay

| Required aspect | Definition |
|---|---|
| capability owner | Lifecycle; transaction caller is Workflow Completion Persistence |
| logical input | complete input, Replay Identity, Reservation Evidence, protected Result Reference, completion metadata |
| logical output | completed, conflict, or unavailable |
| targeted record | current authoritative processing record |
| preconditions | Result Reference exists in its owning boundary and matches required protected ownership/scope |
| state predicate | processing only; terminal state is preserved |
| comparison predicate | reservation ownership, expected revision, and fence match |
| mutation boundary | completed state, Result Reference linkage, metadata, and resulting revision become authoritative together |
| returned projection | completed identity, protected Result Reference, authoritative revision |
| affected-row interpretation | one → candidate completed; zero → authoritative lookup; more than one → invariant violation |
| authoritative follow-up | lookup authoritative replay and compare state, revision relation, identity, and Result Reference |
| public Contract mapping | matching completed state → completed; mismatch → stale revision/fence, terminal-preserved, invalid-transition, or result-reference-conflict |
| commit-unknown recovery | matching completed linkage confirms success; ambiguity becomes reconciliation-required or commit-outcome-unknown |
| retry safety | no unconditional repeat; an identical already-completed observation is not a second transition |
| prohibited hidden behavior | Final Result persistence, Result Reference generation, Workflow orchestration, new fence, returned Reservation Evidence |

## 13. Statement: fail-processing-replay

| Required aspect | Definition |
|---|---|
| capability owner | Lifecycle |
| logical input | fail input, Replay Identity, Reservation Evidence, failure metadata |
| logical output | failed, conflict, or unavailable |
| targeted record | current authoritative processing record |
| preconditions | previous ownership evidence is current |
| state predicate | processing only |
| comparison predicate | reservation ownership, expected revision, and fence match |
| mutation boundary | failed state, permitted failure metadata, and resulting revision become authoritative together |
| returned projection | failed identity and authoritative revision |
| affected-row interpretation | one → candidate failed; zero → authoritative lookup; more than one → invariant violation |
| authoritative follow-up | lookup and compare failed state, identity, revision relation, failedAt, and failure classification |
| public Contract mapping | matching failed → failed; otherwise conflict/unavailable classifications |
| commit-unknown recovery | authoritative matching failed record confirms success; ambiguous evidence is not success |
| retry safety | no unconditional repeat; terminal observation is preserved |
| prohibited hidden behavior | failure payload, exception persistence, Result Reference, new fence, returned Reservation Evidence |

## 14. Statement: release-processing-replay

| Required aspect | Definition |
|---|---|
| capability owner | Lifecycle |
| logical input | release input, Replay Identity, Reservation Evidence, release metadata |
| logical output | released, conflict, or unavailable |
| targeted record | current authoritative processing record |
| preconditions | previous ownership evidence is current |
| state predicate | processing only |
| comparison predicate | reservation ownership, expected revision, and fence match |
| mutation boundary | released state, permitted release metadata, and resulting revision become authoritative together |
| returned projection | released identity and authoritative revision |
| affected-row interpretation | one → candidate released; zero → authoritative lookup; more than one → invariant violation |
| authoritative follow-up | lookup and compare released state, identity, revision relation, and releasedAt |
| public Contract mapping | matching released → released; otherwise conflict/unavailable classifications |
| commit-unknown recovery | authoritative matching released record confirms success; ambiguity is not success |
| retry safety | no unconditional repeat; later re-reservation is a separate Resolution operation |
| prohibited hidden behavior | re-reservation, new fence, returned Reservation Evidence, Workflow retry scheduling |

## 15. Statement: takeover-stale-processing-replay

| Required aspect | Definition |
|---|---|
| capability owner | Recovery |
| logical input | takeover input with Replay Identity and previous Reservation Evidence |
| logical output | `taken-over`, conflict, or unavailable |
| targeted record | current authoritative processing record |
| preconditions | processing lease is stale according to authoritative clock |
| state predicate | processing only |
| comparison predicate | current reservation, expected revision, existing fence, lease, and attempt match previous evidence |
| mutation boundary | stale evaluation and ownership replacement are one boundary with no competition window |
| returned projection | new Reservation Evidence with new reservation, advanced revision, new fence, new lease, new expiry, and advanced attempt |
| affected-row interpretation | one → candidate takeover; zero → reconciliation; more than one → invariant violation |
| authoritative follow-up | `reconcileReservationMutation` with mutation `takeover`, previous evidence, requested next reservation identity, and requested next lease identity |
| public Contract mapping | matching caller intent → `taken-over`; stale revision/fence or takeover conflict remain distinct; dependency failure → unavailable |
| commit-unknown recovery | confirmed/not-applied/conflict/terminal/not-found/corrupted/unavailable/reconciliation-required are preserved |
| retry safety | only safely classified not-applied may be reconsidered; concurrent winner is never caller success |
| prohibited hidden behavior | caller-generated next fence or expiry, takeover of terminal record, split stale-check/mutation boundary, Workflow execution |

## 16. Reservation mutation reconciliation

`reconcileReservationMutation` is a read-only Recovery operation used only
after unknown commit outcome for renew or takeover.

### 16.1 Renew

- `confirmed`: same replay, reservation, lease, fence, and attempt; advanced
  revision; renewed expiry; authoritative evidence returned.
- `not-applied`: previous ownership relation remains and revision/expiry did not
  advance; authoritative evidence may be returned only in this reconciliation
  projection.
- `conflict`: reservation, lease, fence, attempt, or mutation relation changed.
- A relation that cannot safely prove caller success is never confirmed.

### 16.2 Takeover

- `confirmed`: requested next reservation and lease identities match;
  revision advanced; fence differs from previous; attempt advanced.
- `not-applied`: previous ownership, revision, fence, and attempt remain.
- `conflict`: another ownership or mutation won, including intent mismatch.
- The caller does not supply the authoritative next fence or next expiry.

### 16.3 Other observations

- `terminal` preserves completed, failed, or released and returns no evidence.
- `not-found` means no authoritative record.
- `corrupted` means state/evidence invariants are invalid.
- `unavailable` means the dependency cannot provide authority.
- `reconciliation-required` means the read succeeded but caller outcome cannot
  be determined safely.
- The operation returns no Result Reference, raw identity, persistence row, or
  database error detail.

## 17. Commit-unknown matrix

| Mutation | Authoritative follow-up | Success confirmation | Retry condition |
|---|---|---|---|
| new reservation | authoritative replay lookup in protected scope | matching processing reservation evidence relation | authoritative absence only |
| released re-reservation | authoritative replay lookup/recovery | new processing generation matching caller reservation intent | safely not applied only |
| renew | `reconcileReservationMutation: renew` | `confirmed` with preserved ownership/fence and advanced revision/expiry | `not-applied` plus revalidated preconditions |
| complete | authoritative lookup | completed with matching Result Reference and revision relation | never blind; identical completion is observation |
| fail | authoritative lookup | failed with matching metadata and revision relation | never blind |
| release | authoritative lookup | released with matching metadata and revision relation | never blind |
| takeover | `reconcileReservationMutation: takeover` | `confirmed` with requested reservation/lease and new fence/advanced attempt | `not-applied` plus stale preconditions revalidated |

Conflict, terminal mismatch, corruption, unavailable, and
reconciliation-required do not authorize blind retry.

## 18. Result Reference ordering

1. Final Result persistence remains owned by the existing durable Workflow
   boundary.
2. Result Reference creation remains owned by the existing Result Reference
   boundary.
3. Replay completion participates in the Workflow Completion Persistence
   Transaction after the required reference is available within that same
   transaction domain.
4. The complete statement validates and links the protected reference; it does
   not create the Final Result or Result Reference.
5. The Replay Adapter does not coordinate Workflow execution or implement
   business compensation.
6. A completed replay may not point to an unresolved Result Reference.

## 19. Public error mapping

| Statement observation | Public Contract mapping |
|---|---|
| new reservation established | Resolution `new` |
| matching completed | Resolution `replay` |
| matching processing | Resolution `duplicate-in-flight` |
| matching failed | Resolution `authoritative-failed` |
| fingerprint mismatch | Resolution `semantic-conflict` |
| resolution authority unavailable | Resolution `unavailable` |
| lifecycle revision mismatch | `stale-revision` |
| lifecycle fence mismatch | `stale-fence` |
| existing terminal state | `terminal-preserved` |
| disallowed source state | `invalid-transition` |
| different completed reference | `result-reference-conflict` |
| lifecycle dependency unavailable | `dependency-unavailable` |
| lifecycle commit response unknown | `commit-outcome-unknown` until recovery |
| recovery record absent | `record-not-found` or reconciliation `not-found`, according to operation |
| recovery invariant violation | `record-corrupted` or reconciliation `corrupted` |
| ambiguous authoritative observation | `reconciliation-required` |
| takeover caller lost | `takeover-conflict` or reconciliation `conflict` |
| recovery dependency unavailable | `dependency-unavailable` or reconciliation `unavailable` |
| contained unexpected execution failure | `internal-failure` |

No database-specific error or protected value becomes a public failure.

## 20. Adapter responsibility

The future PostgreSQL Replay Adapter owns:

- beginning and ending the transaction boundary assigned to the operation;
- executing the stable logical statement;
- mapping shared protected values to and from database values;
- affected-row interpretation;
- authoritative follow-up observation;
- reservation mutation reconciliation;
- database error classification without leaking values;
- commit-unknown containment;
- exact public Contract projection.

It does not own:

- Workflow orchestration or completion ordering decisions;
- HTTP behavior;
- Replay Identity or protected tenant generation;
- Final Result or Result Reference generation;
- user-facing messages;
- unbounded retry policy;
- business compensation.

## 21. Security and privacy

- Only protected tenant, key, fingerprint, reservation, lease, fence, Replay,
  and Result Reference identities cross the statement boundary.
- Raw tenant identity, raw idempotency key, and raw canonical fingerprint are
  absent.
- Database errors and logs must not embed protected identity values.
- Result Reference remains opaque and is returned only by completed replay and
  completion projections defined by Contract.
- Reservation Evidence is exposed only by Resolution new, Lifecycle renew,
  Recovery takeover, and commit-unknown reconciliation processing projections.
- Observability is limited to stable statement name and safe public
  classification.

## 22. Validation matrix

| Validation | Result |
|---|---|
| eight stable statement names | defined |
| all required per-statement aspects | defined |
| only four replay states | preserved |
| Reservation Evidence mapping | complete |
| Result Reference mapping | complete |
| renew preserves fence/ownership/lease/attempt | required |
| renew advances revision and expiry relation | required without numeric increment |
| takeover issues new fence | required |
| terminal transitions issue no fence | required |
| authoritative PostgreSQL clock | required |
| affected-row one/zero/many | defined for every mutation |
| renew/takeover reconciliation | uses v3 read-only capability |
| blind retry | prohibited |
| Workflow completion ordering | preserved |
| Contract-external fields or states | none |
| statement text or query notation | none |
| DDL or migration | none |
| TypeScript or runtime implementation | none |

## 23. Readiness

Replay Capability Family v3 and PostgreSQL Logical Schema V1 are sufficient to
implement these statement boundaries later without changing Contracts, Shared
Types, Logical Schema, Lifecycle ADR, Workflow, Route, Provider, or Result
Reference architecture.
