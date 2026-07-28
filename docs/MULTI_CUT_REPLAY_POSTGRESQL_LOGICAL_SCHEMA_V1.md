# Multi-cut Replay PostgreSQL Logical Schema V1

## 1. Status and purpose

- Status: Proposed logical schema.
- Authority: PostgreSQL is the durable authority selected by the Replay Lifecycle ADR.
- This document maps the completed Replay Capability Family to a logical persistence model.
- This document contains no physical data types, SQL syntax, DDL, migration, or adapter implementation.
- The only design inputs are Replay Shared Types, Resolution and Admission Contracts, Lifecycle and Recovery Contracts, and the Replay Lifecycle ADR.

## 2. Scope ownership

`MultiCutReplayProtectedScope` is accepted only through
`MultiCutReplayResolutionInput.scope`. Resolution owns creation and
re-reservation within this scope. The logical scope is the immutable tuple:

| Contract field | Logical role |
|---|---|
| `scope.scopeVersion` | scope representation version |
| `scope.replayNamespace` | replay-family isolation |
| `scope.tenant.identityVersion` | protected tenant identity version |
| `scope.tenant.protectedTenantIdentity` | tenant isolation without exposing a raw tenant |
| `scope.operationIdentity` | operation isolation |

Lifecycle does not redefine or mutate scope. Recovery does not calculate scope.
The adapter resolves an existing record using the supplied replay identity and
must preserve the scope originally established by Resolution.

## 3. Replay identity

`MultiCutReplayResolvedIdentity` maps without transformation:

| Contract field | Logical role |
|---|---|
| `identityVersion` | replay identity representation version |
| `keyIdentity` | protected idempotency-key identity |
| `requestFingerprintIdentity` | protected canonical request fingerprint identity |

The logical uniqueness boundary is Protected Scope plus `keyIdentity`.
`requestFingerprintIdentity` classifies an existing key as replay-compatible or
semantically conflicting. Raw idempotency keys and canonical fingerprint inputs
are not part of the logical record.

## 4. Reservation evidence mapping

`MultiCutReplayReservationEvidence` is the complete concurrency evidence. No
second reservation shape is introduced.

| Contract field | Logical role |
|---|---|
| `evidenceVersion` | evidence representation version |
| `reservation.reservationVersion` | reservation identity version |
| `reservation.reservationIdentity` | current processing owner identity |
| `expectedRevision.revisionVersion` | revision evidence version |
| `expectedRevision.expectedRevision` | compare-and-set expectation |
| `fencing.fencingVersion` | fence representation version |
| `fencing.fencingToken` | stale-owner rejection token |
| `lease.leaseVersion` | lease identity version |
| `lease.leaseIdentity` | current lease identity |
| `leaseExpiresAt` | authoritative lease expiry |
| `reservationAttempt` | reservation or takeover generation |

Evidence is written atomically when Resolution returns `new`, replaced
atomically when Lifecycle returns `renewed`, and replaced atomically when
Recovery returns `taken-over`.

## 5. Revision model

- `expectedRevision` is the caller evidence used for conditional mutation.
- The authoritative record revision is projected as the `revision` string
  returned by completed, failed, released, and Recovery lookup results.
- A mutation succeeds only when the supplied expected revision denotes the
  current processing record.
- A mismatch is `stale-revision`; it does not partially mutate the record.
- Revision creation and comparison are adapter responsibilities. No numeric
  representation is prescribed.

## 6. Fence model

- `fencingToken` identifies the currently authorized processing generation.
- Complete, fail, release, renew, and takeover compare the supplied fence with
  the current processing generation.
- A mismatch is `stale-fence`.
- Successful takeover replaces the reservation evidence, so the previous fence
  can no longer authorize a lifecycle mutation.
- Fence generation format and physical comparison representation are outside
  this logical schema.

## 7. Lease model

- `leaseIdentity` distinguishes a lease instance.
- `leaseExpiresAt` is the Contract timestamp used for active-processing and
  stale-processing decisions.
- Renew is valid only for `processing` and replaces the current reservation
  evidence with updated evidence.
- Lease expiry does not delete a record and does not itself change state.
- Takeover is the only Recovery mutation for stale processing.
- No application clock, extra timestamp, or lease-duration column is introduced.

## 8. State model

The only logical states are:

| State | Permitted origin | Permitted next state |
|---|---|---|
| `processing` | Resolution reservation or Recovery takeover | `processing` by renew, `completed`, `failed`, `released` |
| `completed` | processing completion | none |
| `failed` | processing failure | none |
| `released` | processing release | none within Lifecycle |

Completed, failed, and released are terminal for Lifecycle. Re-reservation after
released is exclusively a Resolution responsibility. Lifecycle exposes no
re-reservation operation.

## 9. Result Reference linkage

`MultiCutReplayResultReference` is linked only by a successful complete
transition and a completed Recovery record:

| Contract field | Logical role |
|---|---|
| `referenceVersion` | result-reference representation version |
| `resultReferenceIdentity` | protected result linkage |

The replay record does not contain a Workflow result, final payload, public
token, path, URL, or result-reference persistence implementation. Resolution
returns this linkage for a completed replay.

## 10. Metadata mapping

| Transition | Contract metadata mapped to the logical record |
|---|---|
| complete | `metadataVersion`, `completedAt`, `completionClassification` |
| fail | `metadataVersion`, `failedAt`, `failureClassification` |
| release | `metadataVersion`, `releasedAt`, `releaseClassification` |
| renew | updated `MultiCutReplayReservationEvidence` only |

Only classifications declared by the Lifecycle Contract are permitted.

## 11. Lookup transaction

The Recovery lookup is read-only:

1. Accept `inputVersion`, `replayIdentity`, and `reason`.
2. Identify the authoritative replay record without mutating it.
3. Project exactly one of processing, completed, failed, or released.
4. For processing, project `recordVersion`, identity, revision, and
   `leaseExpiresAt`; Reservation Evidence is intentionally not returned.
5. For completed, also project Result Reference and `completedAt`.
6. For failed, also project `failedAt` and `failureClassification`.
7. For released, also project `releasedAt`.
8. Classify missing, corrupted, reconciliation-required, dependency-unavailable,
   or internal-failure according to the Recovery Contract.

`reason` controls recovery intent and audit-safe classification; it does not
create another record field.

## 12. Resolution transaction

1. Accept Resolution Contract version, Protected Scope, and Replay Identity.
2. Resolve the logical uniqueness boundary of scope plus `keyIdentity`.
3. If absent, atomically establish `processing` and complete Reservation
   Evidence, then return `new`.
4. If the fingerprint differs, return `semantic-conflict`.
5. If matching and actively processing, return `duplicate-in-flight`.
6. If matching and completed, return `replay` with Result Reference.
7. A released re-reservation, when permitted by policy, creates a new
   Reservation Evidence generation through this transaction, never Lifecycle.
8. If authority cannot be established, return `unavailable`.

The canonical fingerprint input and Admission idempotency projection are not
persisted by this schema; Resolution receives their protected identities.

## 13. Renew transaction

1. Accept Replay Identity and current Reservation Evidence.
2. Require authoritative state `processing`.
3. Compare expected revision and fencing token.
4. Replace Reservation Evidence as one logical mutation.
5. Keep state `processing`.
6. Return `renewed` with the updated evidence.
7. A terminal record is preserved and classified as `terminal-preserved`.

## 14. Complete transaction

1. Accept Replay Identity, Reservation Evidence, Result Reference, and
   completion metadata.
2. Require `processing`, matching expected revision, and matching fence.
3. Validate that Result Reference linkage is acceptable to its owning boundary.
4. Atomically set state `completed`, store Result Reference linkage, and map
   completion metadata.
5. Return completed identity, Result Reference, and authoritative revision.
6. Never replace a terminal record or overwrite a different Result Reference.

## 15. Fail transaction

1. Accept Replay Identity, Reservation Evidence, and failure metadata.
2. Require `processing`, matching expected revision, and matching fence.
3. Atomically set state `failed` and map failure metadata.
4. Return failed identity and authoritative revision.
5. Preserve terminal records.

## 16. Release transaction

1. Accept Replay Identity, Reservation Evidence, and release metadata.
2. Require `processing`, matching expected revision, and matching fence.
3. Atomically set state `released` and map release metadata.
4. Return released identity and authoritative revision.
5. Do not create replacement Reservation Evidence.
6. Any later re-reservation belongs to Resolution.

## 17. Takeover transaction

1. Accept Replay Identity and existing Reservation Evidence.
2. Require authoritative state `processing`.
3. Confirm stale processing from `leaseExpiresAt`.
4. Compare expected revision and existing fence.
5. Atomically replace the current owner generation with new Reservation
   Evidence.
6. Keep state `processing` and return `taken-over`.
7. Classify stale revision, stale fence, takeover conflict,
   dependency-unavailable, or internal-failure without exposing persistence
   details.

## 18. Commit-unknown recovery

- Reservation commit unknown uses Recovery lookup with
  `reservation-commit-unknown`.
- Lifecycle commit unknown uses Recovery lookup with
  `lifecycle-commit-unknown`.
- Recovery returns the authoritative record or a classified unavailable result.
- Callers must not infer `new`, completed, failed, released, renewed, or
  taken-over from an exception.
- Blind mutation retry is not part of the logical model.
- Takeover is available only after authoritative stale-processing evaluation;
  it is not a generic retry.

## 19. Concurrency guarantees

1. A Protected Scope and `keyIdentity` identify at most one authoritative replay
   record.
2. Reservation is atomic with classification of the authoritative state.
3. Lifecycle mutations require both expected revision and current fence.
4. Renew replaces the complete Reservation Evidence atomically.
5. Takeover replaces the owner, lease, revision evidence, fence, expiry, and
   attempt as one logical mutation.
6. A stale owner cannot complete, fail, release, or renew.
7. Terminal states are preserved.
8. Result Reference linkage and completion are one logical mutation.
9. Read-only lookup never changes reservation ownership or state.

## 20. Logical indexes

The following are logical access paths, not physical index definitions:

| Logical access path | Contract fields | Purpose |
|---|---|---|
| replay uniqueness | complete Protected Scope plus `keyIdentity` | reservation and conflict resolution |
| replay identity lookup | `identityVersion`, `keyIdentity`, `requestFingerprintIdentity` | Lifecycle and Recovery record lookup |
| processing lease lookup | `state`, `leaseExpiresAt` | stale-processing recovery candidates |
| result linkage lookup | `state`, `referenceVersion`, `resultReferenceIdentity` | completed replay linkage |

No index name, access method, ordering, physical type, or partial-index
expression is specified.

## 21. Retention policy

- Processing lease expiry is ownership expiry, not retention expiry.
- Active processing cannot be removed by retention.
- Completed retention may use the existing `completedAt`.
- Failed retention may use the existing `failedAt`.
- Released retention may use the existing `releasedAt`.
- Result Reference retention remains owned by the Result Reference boundary.
- Duration, deletion mechanism, tombstones, retention worker, and scheduling are
  not defined by the current Contracts and therefore are not added here.
- Without a terminal Contract timestamp, no additional retention timestamp may
  be invented.

## 22. Statement catalog

This catalog names adapter operations only and contains no statement text:

| Logical statement | Capability operation | Logical effect |
|---|---|---|
| resolve reservation | Resolution `resolveReplay` | reserve or classify authoritative record |
| lookup authoritative record | Recovery `lookupReplay` | read-only state projection |
| renew processing lease | Lifecycle `transitionReplay: renew` | replace Reservation Evidence |
| complete processing | Lifecycle `transitionReplay: complete` | terminal completion and Result Reference linkage |
| fail processing | Lifecycle `transitionReplay: fail` | terminal failure |
| release processing | Lifecycle `transitionReplay: release` | terminal safe release |
| takeover stale processing | Recovery `takeoverReplay` | replace stale owner evidence |

## 23. Adapter responsibility

The future PostgreSQL adapter owns:

- transaction boundaries for each catalog operation;
- logical-record lookup and conditional mutation;
- mapping every Contract field listed in this document;
- database-authoritative lease expiry evaluation;
- revision and fence comparison;
- atomic Reservation Evidence replacement;
- state-transition enforcement;
- Result Reference linkage validation at completion;
- commit-unknown containment and authoritative lookup;
- projection of Contract result and failure discriminants.

It does not own Admission fingerprint projection, Workflow execution, retries,
Result Reference persistence, final-result persistence, HTTP mapping, Route
behavior, Provider behavior, or retention scheduling.

## 24. Validation matrix

| Requirement | Contract source | Logical coverage |
|---|---|---|
| Protected Scope complete | Shared + Resolution | Sections 2 and 12 |
| Replay Identity complete | Shared | Section 3 |
| Reservation Evidence complete | Shared | Sections 4, 13, and 17 |
| new reservation | Resolution | Section 12 |
| completed replay linkage | Resolution + Shared | Sections 9 and 12 |
| duplicate in flight | Resolution | Section 12 |
| semantic conflict | Resolution | Section 12 |
| renew processing only | Lifecycle | Sections 7 and 13 |
| complete | Lifecycle | Section 14 |
| fail | Lifecycle | Section 15 |
| release | Lifecycle | Section 16 |
| terminal preservation | Lifecycle | Sections 8 and 19 |
| lookup four states | Recovery | Section 11 |
| lookup read-only | Recovery | Section 11 |
| takeover | Recovery | Section 17 |
| takeover conflicts | Recovery | Section 17 |
| commit unknown | Lifecycle + Recovery | Section 18 |
| released re-reservation | Resolution ownership | Sections 8, 12, and 16 |
| no raw identity persistence | ADR + protected identity Contracts | Sections 2 and 3 |

## 25. Contract coverage and exclusions

- Every durable logical field in this document maps to a named Contract field.
- Contract wrapper versions and recovery reasons are accepted and validated by
  adapter operations; they are not invented as durable record columns.
- Admission-only `fingerprintInput`, authenticated request, source artifact
  handoff, and Workflow idempotency projection do not become replay-record
  fields.
- No `createdAt`, `updatedAt`, raw key, raw fingerprint, principal, public
  tenant, path, payload, Workflow result, or final result field is introduced.
- No state beyond processing, completed, failed, and released is introduced.
- No SQL syntax, DDL, migration instruction, or physical PostgreSQL type is
  present.

## 26. Readiness

The completed Contracts are sufficient for this logical schema. A later
physical schema and adapter may implement this mapping without changing
Resolution, Admission, Lifecycle, Recovery, Shared Types, or the Lifecycle ADR.
