# Workflow Completion Lifecycle Architecture Decision V1

## 1. Status

Accepted. This decision is authoritative for the Workflow Completion State domain foundation.

## 2. Context

Atomic Completion Recovery requires `workflow-completion-state` as a distinct transactional component. The repository already defines Workflow protected identity, Final Result, Result Reference, Outbox, Replay completion, transaction ownership, and equality-only logical attempt semantics. It does not define a production Workflow Completion lifecycle aggregate.

The Atomic Recovery attempt correction fixes the following rules:

- `logicalAttemptIdentity` supports equality comparison only;
- attempt ordering has no authority;
- a different attempt is a competing attempt;
- newer, older, latest, and superseded classifications do not exist;
- a competing attempt cannot be reconciled as the request attempt's success;
- automatic retry of a competing attempt is prohibited.

## 3. Problem

The completion transaction needs one durable lifecycle truth that answers whether a workflow is eligible for completion or durably completed. Final Result status, Replay state, and Outbox delivery state cannot answer that question because each owns a different component. A dedicated state, revision, attempt identity, completion timestamp, and Result Reference linkage are required for conditional mutation and authoritative recovery.

## 4. Existing Authorities

| Authority | Existing responsibility | Completion lifecycle reuse |
| --- | --- | --- |
| `WorkflowProtectedIdentity` | protected equality identity | reused for workflow and logical attempt identity |
| Atomic Completion Recovery V1 | transaction component inventory, owner, snapshot, recovery boundary | retained |
| Atomic Recovery Attempt Semantics V1 | equality-only attempt relation and competing-attempt classification | retained |
| Durable Workflow transaction contract | same-session transaction control and single commit owner | retained |
| Final Result contract | immutable terminal output payload and metadata | not a lifecycle authority |
| Result Reference contract | protected linkage to a Final Result | linked, not a lifecycle authority |
| Replay Lifecycle V4 | replay ownership, fencing, reservation evidence, replay revision, terminal metadata | separate aggregate |
| Outbox contract | durable delivery intent | separate component |

UI lifecycle, Generation Job state, Poll state, Resume state, Final Result status, Replay reservation attempt, and Outbox attempt are not Workflow Completion lifecycle authorities.

## 5. Options

### Option A: Dedicated Workflow Completion lifecycle

This option creates a distinct aggregate for completion eligibility and durable completion. It matches the Atomic Recovery component inventory and preserves component ownership.

### Option B: Existing Durable Workflow lifecycle integration

Rejected. No existing production aggregate defines completion eligibility, the completed transition, a completion-specific revision, and equality-only completion attempt evidence together.

### Option C: Final Result status as lifecycle authority

Rejected. Final Result owns output payload and metadata. It has no completion attempt evidence and cannot represent an eligible workflow before a Final Result row exists.

## 6. Decision

Option A is selected. Workflow Completion State is a dedicated aggregate. Its contract version begins at `1.0`. The aggregate is identified by the existing Workflow protected identity.

The Workflow Completion Transaction Owner is the sole mutation coordinator. It owns creation of the eligible aggregate, conditional transition, commit, rollback, zero-row recovery handoff, and commit-unknown handoff.

## 7. State Owner

Workflow Completion State owns:

- completion lifecycle truth;
- completion eligibility;
- a dedicated completion revision;
- the logical completion attempt identity after completion;
- the immutable Result Reference identity and version after completion;
- the completion timestamp after completion.

It does not own Final Result payload, Replay state, Replay concurrency evidence, or Outbox delivery.

## 8. State Model

The complete state set is:

- `eligible-for-completion`;
- `completed`.

No failed, cancelled, processing, running, or completing state belongs to this V1 aggregate.

The Workflow Completion Transaction Owner creates the aggregate in `eligible-for-completion` when a completion operation is admitted with authoritative workflow identity and before the final atomic completion transaction begins. Creation is idempotent under workflow identity uniqueness. A found aggregate is accepted only when its complete authoritative evidence matches the admission evidence.

## 9. Eligible State

`eligible-for-completion` is the only source state for the completion transition. It is non-terminal.

Its required durable evidence is:

- workflow identity;
- state `eligible-for-completion`;
- revision `0`;
- contract version.

It contains no logical attempt identity, Result Reference, or completion timestamp. V1 defines no transition from this state except completion.

## 10. Completed State

`completed` is terminal and absorbing. No transition out of `completed` is valid.

Its required durable evidence is:

- workflow identity;
- state `completed`;
- revision `1`;
- logical attempt identity;
- Result Reference identity and version;
- completion timestamp;
- contract version.

Before the transaction owner commits, a successful mutation result is `pending-owner-commit`; it is not durable completion. Durable completion exists only after the owner commit succeeds or Atomic Recovery returns `reconciled-success` from authoritative evidence.

## 11. Completion Attempt

The aggregate stores the existing `logicalAttemptIdentity` on completion. Comparison is exact equality across identity version, namespace, and protected value.

Attempt ordering is absent. Revision, timestamp, Result Reference version, Replay reservation attempt, Outbox attempt, and identity text cannot establish attempt order.

The only attempt observations are same attempt, different attempt, missing attempt evidence, and inconsistent attempt evidence. A different attempt is `competing-attempt`.

## 12. Revision

Workflow Completion State owns a dedicated revision. It is distinct from Replay revision, Final Result revision, Result Reference revision, Outbox revision, and attempt identity.

The canonical persistent representation is a non-negative base-10 signed 64-bit integer without sign, whitespace, or leading zeroes except the literal `0`.

- initial revision: `0`;
- completion expected revision: the authoritative revision observed for the eligible aggregate;
- completion successor: checked current revision plus one;
- V1 completed revision: `1`;
- successor authority: the database conditional mutation;
- overflow: mutation is rejected and an operational incident is required;
- caller prediction: prohibited.

Revision detects stale evidence and controls conditional mutation. It never orders logical attempts.

## 13. Transition Preconditions

The completion mutation requires all of the following:

- exact workflow identity;
- state `eligible-for-completion`;
- authoritative expected revision `0`;
- a valid logical attempt identity;
- a valid immutable Result Reference identity and version;
- an authoritative database completion timestamp;
- all other Atomic Completion components prepared for the same owner transaction.

The conditional mutation writes `completed`, revision `1`, the attempt identity, the Result Reference linkage, and the completion timestamp. Exactly one affected row is required.

## 14. Duplicate / Idempotency Matrix

| Authoritative observation after rollback and lookup | Classification | Request success | Mutation repeat | Automatic retry | Manual intervention |
| --- | --- | --- | --- | --- | --- |
| completed, same attempt, same reference, all atomic components match | `idempotent-completion-observed` | yes | prohibited | prohibited | no |
| completed, same attempt, different reference | `reference-conflict` | no | prohibited | prohibited | required |
| completed, different attempt, same reference | `competing-attempt` | no | prohibited | prohibited | required |
| completed, different attempt, different reference | `competing-attempt` | no | prohibited | prohibited | required |
| eligible, stale revision | `stale-evidence` | no | prohibited | prohibited | no; owner reacquires authoritative evidence |
| workflow state absent | `missing-workflow-completion-state` | no | prohibited | prohibited | required |
| required evidence missing or internally contradictory | `inconsistent-observation` | no | prohibited | prohibited | required |

Same attempt and same reference alone do not establish success. Every required Atomic Completion component must match the commit intent.

## 15. Zero-row Semantics

A completion conditional mutation affecting zero rows returns:

- mutation result: `not-applied`;
- cause: `unresolved`;
- commit: prohibited;
- rollback: required;
- authoritative lookup: required.

Zero rows do not classify missing state, stale state, stale revision, completed state, reference conflict, or competing attempt.

## 16. Authoritative Lookup

The Workflow Completion Recovery boundary, under the Workflow Completion Transaction Owner, owns lookup and final classification.

The fixed sequence is:

1. observe `not-applied`;
2. roll back the mutation transaction;
3. open a separate read-only transaction;
4. read the combined authoritative snapshot;
5. compare attempt equality;
6. compare state, revision, Result Reference, Replay, Final Result, and Outbox evidence;
7. return the final domain classification.

The failed mutation session is never reused. Commit-unknown reconciliation remains a separate trigger and uses the same combined snapshot requirements.

## 17. Result Reference Semantics

The completed aggregate stores the exact Result Reference identity and version. Both fields participate in equality. Version omission and version-insensitive comparison are prohibited.

The linkage is immutable after completion. The completion owner receives it from the Result Reference authority; it does not generate, replace, or infer it.

## 18. Transaction Ownership

The Workflow Completion Transaction Owner alone owns begin, mutation ordering, commit, rollback, timeout policy, zero-row recovery handoff, and commit-unknown handoff.

Workflow Completion State, Final Result, Result Reference, Replay completion, and completion Outbox participate in the same PostgreSQL database transaction. External I/O and Outbox delivery remain outside that transaction.

## 19. Atomic Recovery Alignment

This decision preserves Atomic Recovery V1:

- `logicalAttemptIdentity` remains equality-only;
- different attempt remains `competing-attempt`;
- `reconciled-success` requires the same attempt and complete matching evidence;
- `definite-not-committed` requires authoritative negative evidence;
- inconsistent evidence requires manual intervention;
- automatic retry of competing or inconsistent observations is prohibited;
- no ordering inference is introduced;
- transaction owner, snapshot isolation, and commit-unknown ownership remain unchanged.

## 20. Responsibility Separation

| Component | Owns | Does not own |
| --- | --- | --- |
| Workflow Completion State | eligibility, completion truth, logical attempt equality, completion revision, timestamp, Result Reference linkage | output payload, Replay fencing, delivery |
| Final Result | final output payload and output metadata | workflow completion lifecycle |
| Result Reference | protected reference capability and Final Result linkage | workflow completion lifecycle |
| Replay | replay lifecycle, reservation, lease, fence, Replay revision, terminal metadata | workflow completion revision and state |
| Outbox | durable delivery intent | completion truth and delivery acknowledgement truth |

Completion timestamp, Result Reference, and commit intent are shared evidence. State enum, revision, fencing token, Replay reservation attempt, and Outbox delivery attempt are not shared authorities.

## 21. Rejected Options

- Existing lifecycle integration is rejected because no complete production authority exists.
- Final Result status ownership is rejected because payload persistence and lifecycle truth remain separate Atomic Recovery components.
- Replay state ownership is rejected because Replay owns distinct concurrency and reservation semantics.
- An intermediate completing state is rejected because V1 has a single owner transaction and no durable pre-commit success.
- Attempt sequence and attempt ordering are rejected because no ordering authority exists.
- Multiple eligible source states are rejected because they make transition eligibility ambiguous.

## 22. Consequences

The next foundation requires a new versioned Workflow Completion State domain contract and dedicated persistence. Its schema has a workflow identity uniqueness boundary, two state literals, dedicated revision, completion evidence nullability constraints, and a conditional eligible-to-completed mutation.

The design adds one aggregate and one authoritative lookup while keeping Final Result, Replay, and Outbox contracts unchanged. Duplicate completion becomes mechanically classifiable after rollback and lookup.

## 23. Follow-up Change Sets

The required order is:

1. Workflow Completion State Domain Contract;
2. Workflow Completion State persistence, migration, and executor;
3. Production Workflow Completion Atomic Mutation Owner;
4. real PostgreSQL atomicity integration.

Each change set preserves this decision and the Atomic Recovery attempt semantics.

## 24. Validation Checklist

- Dedicated lifecycle: selected.
- State owner: Workflow Completion State under the Workflow Completion Transaction Owner.
- Eligible state: `eligible-for-completion` only.
- Completed state: `completed` only and terminal.
- Attempt comparison: equality-only.
- Attempt ordering: absent.
- Revision authority: dedicated completion revision with database-checked successor.
- Same attempt and same reference: idempotent only after complete authoritative component match.
- Same attempt and different reference: conflict.
- Different attempt: competing attempt without ordering.
- Zero rows: unresolved, rollback required, lookup required.
- Lookup: separate read-only transaction owned by the recovery boundary.
- Result Reference: identity and version are immutable.
- Final Result, Replay, and Outbox responsibilities: separate.
- Atomic Recovery compatibility: preserved.
- Production code changes required by this decision document: none.
