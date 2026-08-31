# Reference Workflow Controller Ownership V2 Contract

Status: **ARCHITECTURE CONTRACT — RUNTIME IMPLEMENTATION NOT YET AUTHORIZED**

This document defines the required ownership architecture for a future V2 implementation of `useReferenceWorkflowController`. It is normative where it uses **MUST**, **MUST NOT**, **SHOULD**, or **MAY**. It does not claim that the V2 runtime, migration, or tests have been implemented.

## 1. Problem statement

V1 invokes `controllerFactory.create()` while the Hook is rendering. The Fetch factory retains a one-shot `created` flag, sets `created = true` on the first call, and rejects later calls. React may abandon a render before commit, and an abandoned render is not guaranteed to receive effect cleanup. The dependency object can therefore retain a consumed factory even though no committed Hook owns the resulting Controller. A later legitimate render using that dependency object can fail.

`CORE_CONTROLLER_CONSTRUCTION` and `EFFECTIVE_FACTORY_INVOCATION` are distinct:

- Core `createReferenceWorkflowController()` construction is locally pure value construction. It creates closures and private in-memory state but does not itself subscribe, schedule timers, issue API calls, or mutate external storage.
- Effective Fetch factory invocation is not render-pure because it mutates externally retained one-shot state.

This is an abandoned-render correctness defect, not merely an ESLint style issue.

## 2. Design goals

V2 MUST satisfy all of the following:

1. Speculative render creates no Controller.
2. Speculative render performs no external mutation.
3. Speculative render starts no subscription.
4. Speculative render starts no timer.
5. Speculative render performs no network or API operation.
6. Abandoned render consumes no one-shot state.
7. Abandoned render requires no cleanup.
8. Controller activation occurs only after commit.
9. Exactly one Controller is externally owned per committed keyed workflow lifetime.
10. Strict Mode simulated cleanup and rebind do not create duplicate externally meaningful ownership.
11. Final release disposes the owned Controller exactly once.
12. SSR remains side-effect free.
13. Hydration starts from a deterministic, stable server/client snapshot.
14. `useSyncExternalStore` subscription and snapshot semantics remain valid.
15. The public Hook API remains unchanged unless implementation evidence proves that impossible.
16. The implementation naturally produces zero `react-hooks/refs` exceptions.
17. No new dependency is required.

## 3. Non-goals

V2 is not authorization or justification for:

- a general workflow runtime framework;
- a global Controller registry;
- an application-wide Provider ownership framework;
- UI Component ownership of Controller lifecycle;
- moving unrelated timer or recovery logic into the Holder;
- redesigning Controller command semantics;
- redesigning the public Hook result;
- Provider or network behavior changes;
- unrelated UI changes;
- Harness cleanup or hydration remediation in this stage.

## 4. Ownership unit

`ReferenceWorkflowControllerHolder` is the minimal V2 ownership unit. It is dependency-owned.

Dormant Holder construction MUST be pure and MUST produce:

- Controller constructions: 0;
- Controller activations: 0;
- external mutations: 0;
- subscriptions: 0;
- timers: 0;
- network/API calls: 0;
- required cleanup: 0.

A dormant Holder MAY retain only inert validated configuration and private state necessary for later committed activation. It MUST NOT consume its Controller construction mechanism during preparation or render.

## 5. Ownership identity

Ownership identity is the combination of:

1. Holder object identity; and
2. a Hook owner token.

The planned owner token is React `useId()` unless implementation validation proves that another React-supported stable committed identity is required. This contract does not claim that `useId()` integration already exists.

- Same Holder plus same owner token identifies the same committed ownership lifetime and MAY reacquire.
- Same Holder plus a different owner token while active or release-pending is an activation conflict.
- Different Holders identify independent ownership.

The ownership token MUST NOT contain credentials, workflow content, References, or other sensitive state.

## 6. Holder lifecycle state machine

The Holder lifecycle states are:

- `DORMANT`
- `ACTIVATING`
- `ACTIVE`
- `RELEASE_PENDING`
- `RELEASED`
- `ACTIVATION_FAILED`

Legal transitions are:

```text
DORMANT
  -- acquire(owner) --> ACTIVATING
  -- activation succeeds --> ACTIVE
  -- activation fails --> ACTIVATION_FAILED

ACTIVE
  -- release(current owner) --> RELEASE_PENDING

RELEASE_PENDING
  -- acquire(same owner) --> ACTIVE
  -- guarded finalization --> RELEASED
```

`ACTIVATION_FAILED` and `RELEASED` are terminal in V2. They MUST NOT silently transition back to `DORMANT` or `ACTIVE`. Activation failure MUST NOT retry automatically. A future contract revision is required before retry or Holder reuse semantics may be introduced.

Invalid transitions MUST fail closed and MUST NOT create partial ownership.

## 7. Acquire contract

Conceptual `acquire(ownerToken)` is callable only from committed lifecycle ownership.

It MUST obey these rules:

- Acquiring a `DORMANT` Holder begins activation and creates the Controller exactly once.
- Reacquiring an `ACTIVE` Holder with the same owner reuses existing ownership.
- Reacquiring a `RELEASE_PENDING` Holder with the same owner cancels pending finalization and restores `ACTIVE` without creating another Controller.
- A different owner against `ACTIVE` or `RELEASE_PENDING` MUST be rejected.
- `RELEASED` MUST NOT silently reactivate.
- `ACTIVATION_FAILED` MUST NOT automatically retry.
- Activation failure MUST leave no partial ownership.

The implementation stage will finalize TypeScript result syntax. It MUST preserve these semantics rather than exposing a raw nullable Controller.

## 8. Release contract

Conceptual `release(ownerToken)` MUST obey these rules:

- Only the current owner may release.
- Strict Mode simulated cleanup MUST NOT immediately destroy ownership.
- Release schedules guarded finalization.
- Same-owner reacquire before finalization cancels pending disposal.
- Final release unsubscribes every Holder-owned listener.
- Final release disposes the Controller exactly once.
- Repeated or stale release MUST NOT double-dispose.
- A released Holder is terminal.

A guarded microtask is the currently intended deferred-finalization mechanism, not an eternal implementation requirement. The normative requirement is finalization deferred sufficiently to survive React Strict Mode's simulated cleanup/rebind while still guaranteeing final disposal.

## 9. Activation contract

Activation is the first boundary permitted to:

- construct the Controller;
- establish the Controller subscription;
- establish the environment subscription;
- initialize live semantic snapshot state.

Activation MUST NOT:

- start a network request merely because activation occurred;
- start a poll timer merely because activation occurred;
- consume a render-time one-shot guard.

If activation fails, rollback MUST establish:

- Controller subscriptions: 0;
- environment subscriptions: 0;
- timers: 0;
- externally consumed factory state: 0;
- partially active owners: 0.

Any Controller value created before the failure MUST be safely disposed at most once if construction progressed far enough to require disposal.

## 10. Construction, activation, subscription, and disposal

V2 normatively distinguishes:

```text
CONSTRUCT HOLDER
ACTIVATE CONTROLLER OWNERSHIP
SUBSCRIBE
DISPOSE
```

The meaningful invariant is:

> Exactly one Controller is activated and externally owned per committed keyed workflow lifetime.

Correctness MUST NOT depend on React executing render once, a `useState` initializer once, or a `useMemo` calculation once. Speculative dormant Holder values MAY exist only when they have zero external consequence and require no cleanup.

## 11. Strict Mode contract

The intended Strict Mode lifecycle is:

```text
speculative render(s) -> dormant ownership representation only
commit                -> acquire(owner)
first acquire          -> construct and activate one Controller
simulated cleanup      -> release(owner), finalization pending
same-owner rebind      -> cancel finalization, retain Controller
stable lifetime        -> one active Controller
final unmount          -> release, finalize, unsubscribe, dispose once
```

Required meaningful counts per committed keyed workflow lifetime are:

- activated Controllers: 1;
- concurrent Controller subscriptions: at most 1;
- concurrent environment subscriptions: at most 1;
- premature Strict Mode disposal: 0;
- final Controller disposal: 1;
- external render-time factory mutations: 0.

Poll timer counts remain governed separately by Hook polling semantics.

## 12. Abandoned-render contract

If React renders and abandons before commit, V2 MUST leave:

- Controller constructions: 0;
- Controller activations: 0;
- external mutations: 0;
- subscriptions: 0;
- timers: 0;
- network/API calls: 0;
- consumed one-shot state: 0;
- cleanup required: 0.

No effect cleanup may be assumed for this guarantee.

## 13. Store contract

The Holder is expected to provide stable store semantics compatible with conceptual:

```text
subscribe(listener)
getSnapshot()
getServerSnapshot()
```

The future implementation MUST provide:

- stable callable identities wherever React requires them;
- exact public snapshot identity retention for semantic no-op;
- replacement of public snapshot identity for meaningful changes;
- Controller and environment updates feeding the semantic cache;
- a race-closing read around subscription registration;
- exact subscriber cleanup;
- isolation between independent Holders.

This contract does not freeze unnecessary TypeScript method syntax before the ownership primitive is implemented.

## 14. Snapshot-cache ownership

The semantic snapshot cache belongs to Holder ownership in V2 rather than render-time Hook refs. It combines:

- Controller state;
- environment state;
- semantic equality;
- stable public identity;
- subscription race closure.

Before activation, `getServerSnapshot()` and the initial client snapshot MUST return the same deterministic, safe, frozen idle view. Activation MAY publish a post-commit update only if the live state is semantically different.

## 15. Timer and recovery boundary

The following SHOULD remain Hook-owned unless implementation evidence requires otherwise:

- poll timer handle;
- timer generation;
- polling effect;
- committed `autoRecover` guard;
- public command callbacks.

The following MUST remain Controller-owned:

- command coordination;
- cancellation and preemption;
- idempotency;
- Session mutation;
- stale transport-response invalidation.

These responsibilities MUST NOT move into the Holder merely for architectural symmetry.

## 16. SSR contract

During server render, V2 MUST produce:

- Holder activation: 0;
- Controller construction: 0;
- Controller subscriptions: 0;
- environment subscriptions: 0;
- timers: 0;
- network/API calls: 0.

`getServerSnapshot()` MUST return deterministic, safe, frozen idle state. V2 MUST NOT require a global or server-only Controller registry.

## 17. Hydration contract

The initial client snapshot MUST agree with the server snapshot required by the existing Hook contract. Holder activation occurs only after commit.

After activation, the Holder MUST:

- perform a race-closing live Controller/environment read;
- publish only semantic changes;
- retain snapshot identity for semantic no-op;
- retain ownership across Strict Mode rebind.

Meaningful DOM hydration evidence remains a separate Harness remediation. This contract does not claim that remediation is complete.

## 18. Fetch dependency V2 contract

The prohibited V1 sequence is:

```text
create() -> created = true during render -> Controller
```

The V2 target is:

```text
prepare dependencies
  -> construct dormant Holder
  -> no one-shot render mutation
  -> committed acquire
  -> Controller construction
  -> same-owner reuse or conflicting-owner rejection
  -> final disposal
```

The Fetch `created` closure MUST be removed during future V2 implementation. Holder preparation and activation MUST NOT themselves issue a network request.

## 19. Failure semantics

V2 requires these closed classifications:

| Condition | Required result |
|---|---|
| Same owner reacquires | `REUSE_EXISTING_OWNER` |
| Different owner acquires active or release-pending Holder | `REJECT_ACTIVATION` |
| Dependency, operation, or projector invariant violation | `THROW_PROGRAMMING_INVARIANT` |
| Controller activation failure | `REJECT_ACTIVATION` |
| Command before successful activation | `RETURN_SAFE_FAILURE` |
| Recovery after terminal activation failure | `RETURN_SAFE_FAILURE` unless a future contract defines explicit recovery |
| Stale Holder or ownership key | `REJECT_ACTIVATION` |
| Different Holders | `CREATE_INDEPENDENT_OWNER` |

Disposal failure MUST NOT cause double-disposal, MUST expose only safe internal failure evidence, and MUST NOT make the Holder silently reusable.

## 20. Public API target

The target public consumer API remains:

```text
useReferenceWorkflowController(input)
```

The public result shape and command semantics remain unchanged. The expected internal dependency-contract migration is:

```text
controllerFactory -> controllerHolder
```

UI Components MUST NOT directly own `acquire` or `release`.

## 21. ESLint contract

V2 implementation MUST target:

- `react-hooks/refs` errors: 0;
- `react-hooks/refs` disable comments: 0;
- ESLint configuration changes: 0;
- global rule weakening: 0.

Lint compliance MUST follow from correct ownership architecture, not suppression.

## 22. Required future implementation tests

Future implementation authorization MUST include tests proving:

1. Dormant Holder construction has zero external effects.
2. Abandoned render consumes nothing.
3. Controller activation occurs only after commit.
4. Strict Mode activated Controller count is exactly one.
5. Same-owner acquire reuses ownership.
6. Different-owner acquire rejects.
7. Final disposal occurs exactly once.
8. Simulated Strict Mode cleanup does not prematurely dispose.
9. Activation failure fully rolls back.
10. Controller and environment subscriptions return to zero.
11. Two Holders isolate consumers.
12. SSR activation count is zero.
13. Hydration initial snapshots agree.
14. Semantic no-op retains snapshot identity.
15. Meaningful updates replace snapshot identity.
16. Fetch dependencies contain no render-time one-shot guard.
17. Commands before activation fail closed.
18. Existing race, recovery, cancellation, and late-response behavior remains valid.

These tests have not yet been implemented or passed.

## 23. Migration order

The planned migration is:

```text
STAGE 0  V2 CONTRACT
STAGE 1  V2 OWNERSHIP PRIMITIVE
STAGE 2  HOOK MIGRATION
STAGE 3  FETCH / FIXTURE DEPENDENCY MIGRATION
STAGE 4  FOUNDATION TESTS
STAGE 5  REACT HARNESS MIGRATION
STAGE 6  HARNESS CLEANUP / HYDRATION REMEDIATION
STAGE 7  ACCEPTANCE AUDIT
```

Only Stage 0 is represented by this document. No later stage is authorized.

## 24. Planned commit DAG

The intended review and commit ordering is:

```text
COMMIT_0_ARCHITECTURE_CONTRACT
  -> COMMIT_1_FOUNDATION_V2
  -> COMMIT_2_HARNESS_REMEDIATION
```

This is planning information only. This document does not authorize any commit.

## 25. Non-authority

This architecture contract does **not** authorize:

- Holder runtime implementation;
- Hook migration;
- Fetch migration;
- fixture migration;
- Harness remediation;
- dependency installation;
- lint suppression;
- staging, commit, or push;
- cloud operations.

It also does not authorize any AWS acquisition experiment operation. Runtime implementation and every later migration stage require separate Owner authorization.
