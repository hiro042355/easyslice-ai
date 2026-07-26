# Multi-Cut Production Reference Decision Resolution V1

## 1. Context

The Production Locator Policy, Reference Authority, Reference Identity and Scope, and Reference Ownership and Authorization ADRs consistently establish a safe Source resolution boundary but leave the Production authority model unresolved. This resolution adopts only the decisions required to begin the next Contract and implementation slices.

It does not select authentication technology, a permission framework, persistence technology, physical storage, naming, or retention duration.

## 2. Inputs

This resolution uses:

- `MULTI_CUT_PRODUCTION_LOCATOR_POLICY_DECISION_V1.md`;
- `MULTI_CUT_PRODUCTION_REFERENCE_AUTHORITY_DECISION_V1.md`;
- `MULTI_CUT_PRODUCTION_REFERENCE_IDENTITY_SCOPE_DECISION_V1.md`;
- `MULTI_CUT_PRODUCTION_REFERENCE_OWNERSHIP_AUTHORIZATION_DECISION_V1.md`;
- Input Materialization and `SourceArtifactLocatorCapability`;
- Temporary Workspace;
- Provider Upload and Pending Upload;
- Accepted Persistence;
- Workflow Entry and Workflow API;
- Media Execution Composition and Runtime Binding.

The four ADRs are consistent: Route, Composition, Runtime Binding, and Workspace do not own Source authority; physical locations remain internal; Input Materialization retains request validation and regular-file inspection; and the current Locator input cannot express contextual authorization.

## 3. Decision Principles

1. Preserve existing Route, Composition, Runtime Binding, Materialization, Workspace, and filesystem boundaries.
2. Keep Source authority outside Route and Composition.
3. Keep policy evaluation outside the Locator implementation; the Locator may consume an authoritative decision but is not the authorization engine.
4. Do not expose filesystem locations outside Adapter-internal results.
5. Preserve Materialization ownership checks, regular-file validation, containment, copy orchestration, and failure normalization.
6. Do not treat runtime-local state as durable authority.
7. Add only the Contract information required for secure Production resolution.
8. Leave technology and policy details without Repository evidence `UNRESOLVED`.

## 4. Adopted Decisions

The following decision records use the required fields.

### Decision 1: Identified entity

- Decision status: **ADOPTED**
- Selected decision: A Source reference identifies an authority-managed logical Source Artifact record. It does not identify an upload request, Workflow binding, Operation, Workspace, request, path, or provider handle.
- Repository evidence: `SourceArtifactReference` is a dedicated versioned type; adjacent identities are distinct; the resolved location is internal.
- Rejected alternatives: Upload-record, Workflow-binding, Operation-capability, Workspace, and path identity are rejected as the canonical meaning.
- Implementation consequence: Production resolution starts from a Source Artifact authority record and then obtains internal resolution data.
- Test consequence: Tests must prove that adjacent identifiers cannot be substituted for a Source reference.
- Migration consequence: Existing Upload, Persistence, or Workflow records require an explicit mapping or registration step; string reuse is insufficient.

### Decision 2: Reference authority

- Decision status: **ADOPTED**
- Selected decision: A separately injected Source Artifact Authority owns authoritative Source records, ownership association, active state, and access decisions. It is outside Route, Composition, Runtime Binding, Workspace, and Locator policy logic.
- Repository evidence: Existing boundaries exclude those components; adjacent domains demonstrate injected stores and reference authorities.
- Rejected alternatives: Route-owned, Assembly-owned, Composition-owned, Workspace-owned, and runtime-local map authority.
- Implementation consequence: A versioned authority Contract must precede the Production Locator implementation.
- Test consequence: Boundary tests must reject forbidden dependencies and prove authority decisions are consumed through dependency injection.
- Migration consequence: Assembly will eventually bind an authority-backed Locator, but Assembly will not execute lookups.

### Decision 4: Reference uniqueness scope

- Decision status: **ADOPTED**
- Selected decision: Uniqueness is defined within the Source Authority ownership namespace, not globally from the opaque string alone. The authoritative lookup key is the opaque reference plus approved ownership scope.
- Repository evidence: Materialization already carries Source ownership and tenant projections; the Identity ADR proves global uniqueness is not established.
- Rejected alternatives: Global-string uniqueness and path-derived uniqueness.
- Implementation consequence: A bare opaque string is insufficient for Production lookup.
- Test consequence: Equal opaque values in different ownership scopes must not cross-resolve.
- Migration consequence: Existing bare references need authoritative scope association before Production use.

### Decision 5: Ownership model

- Decision status: **ADOPTED**
- Selected decision: Composite ownership: durable Source ownership is held by the Source Authority, while request, Workflow, or Operation use requires an explicit scoped authorization decision.
- Repository evidence: Persistent ownership and execution-use context are distinct across Accepted Persistence, Workflow, and Materialization contracts.
- Rejected alternatives: Upload-only, Workflow-only, Request-only, Workspace-owned, and possession-only ownership.
- Implementation consequence: Ownership records and execution authorization remain separate concepts.
- Test consequence: Tests must cover valid owner use, delegated use, wrong ownership, and absent delegation.
- Migration consequence: Upstream records must establish Source ownership before execution-scoped use.

### Decision 6: Authorization evaluation owner

- Decision status: **ADOPTED**
- Selected decision: The Source Authority evaluates Source ownership, active state, revocation, and scoped access. Input Materialization validates the supplied request projections; the Locator only consumes the resulting authoritative resolution decision.
- Repository evidence: The Locator has no authorization context; Materialization already validates request ownership; possession alone is not authorization.
- Rejected alternatives: Locator-as-policy-engine, Route authorization, Composition authorization, and ownership equality as the complete decision.
- Implementation consequence: Authority evaluation must occur before physical resolution is accepted.
- Test consequence: Locator tests must prove no embedded policy engine; authority tests must prove access decisions.
- Migration consequence: Production composition must inject the authority dependency without moving policy into Route or Composition.

### Decision 7: Authorization input boundary

- Decision status: **ADOPTED**
- Selected decision: A versioned Source resolution context carries the opaque Source reference, validated ownership scope, request identity, operation identity, and a safe authorization decision/evidence reference. It carries no credentials or physical location.
- Repository evidence: Those identities and ownership projections already exist at the Materialization boundary, while the current Locator receives none of them.
- Rejected alternatives: Bare-reference authorization, raw credentials, authentication objects, and caller-supplied permission strings.
- Implementation consequence: `SourceArtifactLocatorCapability` requires a versioned input/result extension after the authority Contract is defined.
- Test consequence: Boundary tests must prove required context, type-safe projection, and sensitive-field exclusion.
- Migration consequence: Existing Materialization-to-Locator invocation must adopt the versioned context.

### Decision 8: Cross-user access policy

- Decision status: **ADOPTED**
- Selected decision: Deny by default. Cross-owner access requires an explicit valid delegation recognized by the Source Authority.
- Repository evidence: Existing ownership projections require agreement; no cross-user grant is established.
- Rejected alternatives: Reference possession, matching tenant alone, or physical accessibility as permission.
- Implementation consequence: Missing delegation is a safe authorization denial.
- Test consequence: Cross-owner substitution and privilege-escalation tests are mandatory.
- Migration consequence: Existing implicit sharing cannot be assumed valid.

### Decision 9: Cross-workflow access policy

- Decision status: **ADOPTED**
- Selected decision: A Source is not owned by a Workflow. Cross-Workflow reuse is allowed only when the Source Authority authorizes the current execution context.
- Repository evidence: Source and Workflow identities are distinct; Workflow ownership is domain-specific.
- Rejected alternatives: Automatic Workflow ownership and unrestricted cross-Workflow reuse.
- Implementation consequence: Workflow identity may be authorization context but not the canonical Source identity.
- Test consequence: Same-owner permitted reuse and unauthorized cross-Workflow use require separate cases.
- Migration consequence: Workflow bindings must not be promoted to Source ownership by string equivalence.

### Decision 10: Delegation policy

- Decision status: **ADOPTED**
- Selected decision: Delegation is explicit, scope-bound, authority-validated, and non-transitive unless a later Decision explicitly permits otherwise.
- Repository evidence: No existing Contract grants implicit delegation; adjacent contracts use explicit authorization projections.
- Rejected alternatives: Implicit delegation, reference forwarding as delegation, and unlimited transitive delegation.
- Implementation consequence: The Authority Contract must distinguish owner authorization from delegated authorization.
- Test consequence: Scope mismatch, expired/revoked delegation, and attempted transitive use must fail safely.
- Migration consequence: Existing callers require explicit authority-recognized scope before delegated use.

### Decision 11: Revocation policy

- Decision status: **ADOPTED**
- Selected decision: Revocation is authoritative Source state and is checked for every resolution attempt. Revoked Sources do not resolve.
- Repository evidence: Pending Upload and Workflow reference systems already distinguish revoked state; runtime-local validation cannot establish current state.
- Rejected alternatives: Cache-only revocation, request-start-only checks, and silent continued resolution.
- Implementation consequence: Authority lookup must return a safe revoked/unavailable classification without internal details.
- Test consequence: Revocation before lookup and between separate attempts must be covered.
- Migration consequence: Existing Source registrations need an authoritative active/revoked state.

### Decision 13: Stale reference behavior

- Decision status: **ADOPTED**
- Selected decision: A stale, superseded, revoked, deleted, or unknown reference must not resolve to current bytes by fallback. Public Materialization behavior remains safely normalized.
- Repository evidence: Existing Locator failure normalization and non-disclosure boundaries are established.
- Rejected alternatives: Alias fallback, latest-version fallback, and physical-path fallback.
- Implementation consequence: Authority state is checked before location acceptance.
- Test consequence: Each internal classification requires safe outward projection tests.
- Migration consequence: Legacy aliases cannot silently resolve without explicit registration.

### Decision 14: Replay behavior

- Decision status: **ADOPTED**
- Selected decision: Reuse of the same active Source reference is permitted only after a fresh authority evaluation for the current context. Runtime-local completed-request tracking is not replay authority.
- Repository evidence: The current adapter's request cache is instance-local; authority and Identity ADRs reject it as durable evidence.
- Rejected alternatives: Possession-based replay, permanently trusted prior decisions, and instance-cache authority.
- Implementation consequence: Every attempt obtains current authoritative resolution evidence.
- Test consequence: Same-context reuse, changed-context reuse, revocation between attempts, and duplicate request identity require distinct tests.
- Migration consequence: Callers cannot rely on a previous successful lookup as continuing authorization.

### Decision 15: Replacement behavior

- Decision status: **ADOPTED**
- Selected decision: Replacement must not silently retarget an existing Source reference to different Source content. Replacement creates a distinct authoritative Source identity or explicitly invalidates the old reference.
- Repository evidence: Existing contracts do not establish mutable alias behavior; deterministic and replay-safe boundaries favor explicit identity changes.
- Rejected alternatives: Silent retargeting and latest-content lookup.
- Implementation consequence: Locator resolution must not perform replacement fallback.
- Test consequence: Old-reference stability or invalidation and new-reference separation are mandatory.
- Migration consequence: Mutable legacy aliases require explicit conversion or rejection.

### Decision 16: Deletion behavior

- Decision status: **ADOPTED**
- Selected decision: Deletion makes the Source non-resolvable. Public results do not disclose whether the cause was deletion, missing state, or unauthorized access.
- Repository evidence: Adjacent stores distinguish deleted state; failure normalization prevents sensitive disclosure.
- Rejected alternatives: Deleted-reference reuse and physical fallback.
- Implementation consequence: Authority returns a safe non-resolvable decision.
- Test consequence: Deleted, missing, and wrong-owner outward projections must remain non-disclosing.
- Migration consequence: Deleted legacy records require tombstone or equivalent authoritative non-resolvable state; representation is deferred.

### Decision 17: Audit responsibility

- Decision status: **ADOPTED**
- Selected decision: Source Authority owns ownership, authorization, delegation, revocation, and lifecycle decision audit. Input Materialization owns invocation-stage and normalized result audit. Locator owns only safe resolution-stage operational audit.
- Repository evidence: Current layers already separate authorization, adapter orchestration, and physical resolution responsibilities.
- Rejected alternatives: Route-only audit, duplicate full-detail audit at every layer, and raw reference/location logging.
- Implementation consequence: Audit projections require stable safe classifications and correlation without secret or path disclosure.
- Test consequence: Audit ordering, ownership, redaction, and failure-precedence tests are required.
- Migration consequence: Existing logs cannot be treated as authoritative ownership audit.

### Decision 18: Safe failure semantics

- Decision status: **ADOPTED**
- Selected decision: Internal authority outcomes distinguish invalid context, unauthorized, revoked, stale, deleted, missing, conflict, and unavailable as needed for audit and policy. Public Materialization retains non-disclosing normalized failure and exposes no path, raw exception, or ownership record.
- Repository evidence: Materialization already normalizes Locator failures and protects physical locations.
- Rejected alternatives: Raw authority errors, distinct public wrong-owner responses, and filesystem error exposure.
- Implementation consequence: A versioned authority result maps to a safe Locator/Materialization result.
- Test consequence: Internal classification and outward indistinguishability matrices are mandatory.
- Migration consequence: Existing consumers continue to receive normalized public failures.

### Decision 19: Durable persistence requirement

- Decision status: **ADOPTED**
- Selected decision: Production Source authority state must survive request, process, and runtime-instance boundaries. The storage technology and schema remain undecided.
- Repository evidence: Production replay, revocation, and cross-process execution cannot rely on runtime-local maps; adjacent persistence contracts demonstrate durable authority patterns.
- Rejected alternatives: In-memory singleton, adapter-local map, Route-local state, and Workspace lifetime as authority.
- Implementation consequence: The Authority Contract must be implementable by a durable dependency.
- Test consequence: Contract tests must cover restart-independent semantics through fixtures without prescribing technology.
- Migration consequence: In-memory reference state is non-production and must not be promoted as authoritative.

### Decision 20: Locator Contract extension requirement

- Decision status: **ADOPTED**
- Selected decision: A versioned extension is required. It must accept authoritative resolution context/evidence and return a safe classified resolution result plus Adapter-internal location only on success.
- Repository evidence: The current `{ opaqueReference } -> { location }` shape cannot carry ownership scope, authorization evidence, revocation classification, or safe failure results.
- Rejected alternatives: No change, hidden global authorization state, environment lookup, and Locator-owned policy inference.
- Implementation consequence: Define the Authority Contract first, then extend Locator and its Materialization invocation with the smallest compatible versioned shape.
- Test consequence: Contract boundary, backward-consumer diagnostics, sensitive-field, dependency-direction, and outcome-mapping tests are mandatory.
- Migration consequence: Existing reference adapter and test fixtures require explicit version migration; no compatibility shim should hide missing security context.

## 5. Deferred Decisions

### Decision 3: Reference issuer

- Decision status: **DEFERRED**
- Selected decision: Issuance must occur at an upstream ingestion or accepted-persistence boundary that can register an authoritative Source record. The exact existing subsystem is deferred until its mapping to Source identity is specified.
- Repository evidence: Sources exist before Materialization; Upload and Accepted Persistence are plausible upstream boundaries, but neither is formally mapped to `SourceArtifactReference`.
- Rejected alternatives: Route, Composition, Runtime Binding, Workspace, Locator, and Materialization issuance.
- Implementation consequence: The Authority Contract may be designed without selecting the concrete issuer implementation.
- Test consequence: Authority registration behavior can use a reference fixture; end-to-end issuer tests remain deferred.
- Migration consequence: No current Upload or Persistence identifier may be reinterpreted as a Source reference yet.

### Decision 12: Reference lifetime

- Decision status: **DEFERRED**
- Selected decision: A Source reference is valid only while its authoritative record is active; exact duration and retention are deferred.
- Repository evidence: Adjacent references have active, expired, revoked, and deleted states, while no Source duration exists.
- Rejected alternatives: Process lifetime, request lifetime, permanent validity, and retention inferred from Workspace cleanup.
- Implementation consequence: Contracts require lifecycle state but no duration constant or clock policy.
- Test consequence: Active versus non-active behavior is testable; time-duration tests remain deferred.
- Migration consequence: Legacy records need lifecycle classification, but no retention period is imposed.

## 6. Unresolved Decisions

The following remain `UNRESOLVED` because Repository evidence does not support a concrete selection:

- concrete issuer subsystem and registration transaction;
- authentication mechanism and principal construction;
- exact ownership data model;
- exact delegation representation;
- exact authorization evidence representation;
- exact durable persistence technology and data model;
- concurrency and recovery implementation;
- reference and evidence wire formats;
- expiration duration and retention;
- ownership transfer support;
- audit persistence implementation;
- whether internal missing, unauthorized, and deleted states are intentionally collapsed before or inside Locator;
- Production physical location and naming policies already deferred by the Locator Policy ADR.

These do not prevent Contract-first work when the adopted boundaries are preserved.

## 7. Authority Resolution

The selected architecture introduces a Source Artifact Authority boundary supplied through dependency injection. It owns logical Source records, ownership association, lifecycle, revocation, authorization evaluation, and authoritative decision audit.

The Source Locator remains a resolution adapter. It may call or consume a decision from the authority, but it does not define permissions, infer ownership, issue references, or persist authority state. Route and Composition remain unaware of Source authority internals.

## 8. Identity Resolution

The identified entity is a logical Source Artifact record. An opaque reference is a lookup component, not a complete globally unique identity and not an authorization grant.

Its effective identity is resolved within the authority's approved ownership scope. It is distinct from Upload, persisted-asset, Workflow, Operation, Request, Workspace, provider, and physical-location identities until an explicit mapping is registered.

## 9. Ownership Resolution

Durable Source ownership and execution-scoped use are separate:

- Source Authority owns the durable owner association.
- Input Materialization validates request-projected ownership consistency.
- Authority evaluates whether the current scope is the owner or holds valid delegation.
- Workflow, Operation, Request, and Workspace may constrain use but do not become the Source owner automatically.

## 10. Authorization Resolution

Authorization uses a split boundary:

1. Upstream authentication and request projection establish a safe caller/context projection.
2. Input Materialization validates the consistency and shape of its request context.
3. Source Authority evaluates ownership, delegation, active state, and revocation.
4. Locator resolves only an authorized Source decision to an internal location.
5. Input Materialization inspects the regular file, copies it into the Workspace, and normalizes the outcome.

This resolution does not choose how authentication or permission policy is implemented.

## 11. Lifecycle Resolution

The minimum lifecycle contains active and non-resolvable states sufficient to represent revoked, stale/superseded, deleted, missing, and unavailable outcomes. Exact storage representation is not selected.

An active record may be evaluated on each attempt. Revocation and deletion stop future resolution. Replacement never silently redirects an existing reference. Exact expiry and retention remain deferred.

## 12. Replay and Stale Resolution

Replay requires a fresh authority decision for the current context. A prior successful request, cached location, or runtime-local completed-request entry does not grant continuing access.

Stale, superseded, revoked, deleted, missing, and unauthorized references do not fall back to a current file or path. Public behavior remains normalized to prevent ownership or existence disclosure.

## 13. Persistence Resolution

Production authority must be durable across requests, processes, and runtime instances. This is a semantic requirement, not a selection of a database, schema, storage provider, or transaction implementation.

The first implementation slice may use a deterministic reference fixture for Contract validation, but such a fixture is not Production authority.

## 14. Locator Contract Impact

The current Locator Contract is insufficient for the adopted model. A versioned extension is required because a bare opaque reference cannot safely establish ownership scope or current authorization.

The minimum extension must support:

- a versioned Source resolution input;
- the opaque Source reference;
- validated ownership scope;
- request and operation correlation;
- safe authority decision/evidence projection;
- classified non-success outcomes;
- an Adapter-internal location only for an authorized success.

It must not contain credentials, authentication tokens, physical paths in public results, raw authority records, or raw errors. The exact field names and compatibility strategy belong to the Contract implementation review.

## 15. Implementation Consequences

The next implementation work is limited to:

1. Source Artifact Authority Contract.
2. Deterministic authority fixture for Contract and behavior validation.
3. Versioned Source Locator input/result extension.
4. Input Materialization invocation alignment.
5. Production Locator implementation backed by an injected durable authority implementation only after persistence composition is available.

No Route, Composition, Runtime Binding, Workspace, Upload, Workflow, or filesystem-policy ownership moves are authorized.

## 16. Test Consequences

Mandatory tests include:

- Authority and Locator boundary tests;
- type and dependency-direction tests;
- owner access and explicit delegation;
- cross-owner and cross-Workflow denial;
- equal opaque references in different ownership scopes;
- revoked, stale, deleted, missing, conflict, and unavailable outcomes;
- fresh evaluation on replay;
- replacement non-retargeting;
- restart-independent authority semantics at the Contract level;
- Materialization regular-file validation and containment regression;
- failure normalization and outward indistinguishability;
- sensitive data and physical-location non-disclosure;
- audit ownership, ordering, and redaction;
- Route, Composition, and Runtime Binding reverse-dependency audits.

## 17. Migration Consequences

Migration must:

- create explicit Source authority records rather than reuse adjacent strings;
- map eligible Upload or Accepted Persistence artifacts only through a later approved issuer contract;
- associate ownership scope and lifecycle state;
- replace bare-reference Locator calls with versioned context;
- reject or explicitly register legacy aliases;
- avoid silent content replacement;
- preserve existing Materialization public failure normalization;
- keep physical locations inside Adapter boundaries.

## 18. Production Locator Readiness

Final status: **CONDITIONALLY_READY**.

Implementation may begin only with the following minimum scope:

- Authority Contract and deterministic fixture;
- versioned Locator Contract extension;
- Materialization-to-Locator context projection;
- boundary, security, lifecycle, and compatibility tests.

Implementation remains forbidden for:

- concrete Production persistence before its composition is approved;
- Route or Composition authorization;
- hidden global registries or runtime-local authority;
- physical path, root, filename, or storage-provider policy;
- concrete authentication or permission technology;
- implicit Upload, Workflow, or Persistence identity equivalence.

Required Contract changes:

- new Source Artifact Authority Contract;
- versioned Source Locator input and classified result;
- minimal Materialization invocation alignment.

Residual risks:

- exact issuer remains deferred;
- concrete persistence and recovery composition remain unresolved;
- authorization evidence representation remains unresolved;
- physical Locator policy remains unresolved.

## 19. Remaining Blockers

Contract-first implementation is not blocked.

A complete Production Locator deployment remains blocked by:

- concrete issuer and registration mapping;
- durable persistence implementation and composition;
- authentication-to-authority projection integration;
- Production location policy and configuration ownership;
- migration of existing Sources into authoritative records.

No additional general-purpose ADR is required before the Contract-first slice. Focused decisions will be required before issuer integration and Production deployment.

## 20. Recommended Implementation Order

1. Define the Source Artifact Authority Contract and safe result classifications.
2. Add a deterministic authority reference fixture and its boundary/behavior tests.
3. Define the versioned Source Locator input/result extension.
4. Align Input Materialization to project its existing validated context.
5. Run Materialization, security, dependency, and compatibility regression.
6. Decide the concrete upstream issuer mapping.
7. Decide durable persistence composition and recovery behavior.
8. Implement the Production authority.
9. Implement the Production Locator without moving policy into it.
10. Bind completed capabilities through Server Runtime Assembly.
11. Proceed to Route Migration only after Production resolution and HTTP projection boundaries are validated.
