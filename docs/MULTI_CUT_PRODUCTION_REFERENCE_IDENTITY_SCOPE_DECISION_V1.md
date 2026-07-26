# Multi-Cut Production Reference Identity and Scope Decision V1

## 1. Context

Production Input Materialization accepts a versioned `SourceArtifactReference` containing an `opaqueSourceArtifactReference`. The contract deliberately prevents filesystem locations from crossing the public boundary, but it does not define what real-world identity the opaque reference denotes or the scope in which that identity is unique.

The Production Reference Authority review established that issuer, authoritative registry, lifecycle, revocation, and production resolution remain unresolved. This decision record narrows the next question to identity and scope. It does not select an authority implementation, registry, persistence model, or locator implementation.

## 2. Existing Contracts

The current repository provides these relevant contracts:

- Input Materialization defines `SourceArtifactReference`, request identity, operation identity, workspace identity, ownership projections, and the locator capability.
- Upload contracts define upload-specific identities and lifecycle classifications.
- Persistence and asset contracts define their own asset, mutation, registry, and provenance identities.
- Workflow and operation contracts define workflow, pipeline, operation, request, and binding identities.
- Workspace contracts define a separate opaque workspace reference.
- The locator accepts only an opaque source reference and returns an internal source location.

These contracts are adjacent, but no committed contract declares that an upload reference, persisted asset reference, workflow input binding, operation reference, or workspace reference is identical to `opaqueSourceArtifactReference`.

## 3. Existing Identity Evidence

Repository evidence establishes the following:

- `SourceArtifactReference` is a dedicated, versioned logical reference.
- Request, operation, workspace, upload, asset, and workflow identities use distinct fields or types.
- The opaque source reference is validated as an identifier-like value, not interpreted as a path.
- Input Materialization resolves exactly one supplied source reference through one locator call for a materialization request.
- Physical source location remains internal to the adapter.
- The reference materializer records completed request identities within one adapter instance, but that cache is not an authoritative identity or replay registry.

Identifier syntax is evidence of boundary hygiene only. It does not establish issuer, uniqueness, durability, or ownership scope.

## 4. Existing Scope Evidence

The materialization request carries tenant and ownership projections for the authenticated request, source, workspace, and operation. Validation requires those projections to agree before resolution proceeds.

This proves that a materialization request is evaluated within an ownership context. It does not prove that the opaque source reference itself encodes or globally determines that context. The locator receives only the opaque reference, without tenant, user, workflow, operation, request, or workspace context.

Consequently, the current locator contract cannot independently distinguish identical opaque values issued in different ownership scopes.

## 5. Decidable Facts

The following facts are decidable from the current repository:

1. The source reference is a logical opaque reference, not a filesystem path.
2. Its contract identity is distinct from request, operation, and workspace identities.
3. One materialization request supplies one source artifact reference.
4. The adapter validates ownership agreement before invoking the locator.
5. The locator interface receives no explicit authorization or ownership context.
6. Physical source location is not part of the public projection.
7. Current syntax validation does not establish global uniqueness.
8. Current contracts do not define an equivalence with upload, persisted asset, workflow binding, or provider identities.
9. Current contracts do not guarantee that a reference-to-artifact mapping is immutable across time.
10. Runtime-local completed-request tracking does not provide authoritative replay, replacement, or revocation semantics.

## 6. Inferred but Undocumented Facts

The following interpretations are plausible but are not contractual:

- The reference probably denotes a pre-existing source artifact or an authoritative record that can resolve to one.
- The reference probably remains stable for at least one materialization attempt.
- Ownership projections suggest that resolution is intended to respect tenant or owner boundaries.
- A locator is likely expected to resolve deterministically for a fixed authoritative state.
- Upload or accepted-asset records may become sources of references.

These are architectural inferences only. Production implementation must not treat them as settled decisions.

## 7. Undecidable Decisions

The following decisions are `UNRESOLVED`:

- Whether uniqueness is global, tenant-scoped, user-scoped, workflow-scoped, operation-scoped, request-scoped, workspace-scoped, or composite.
- Whether the identity denotes an immutable artifact, an upload record, a persisted asset, a workflow input binding, an operation capability, or another authority record.
- Whether multiple references may identify the same artifact.
- Whether one reference may resolve to different artifact versions over time.
- Whether a replacement creates a new reference or updates an existing reference.
- Whether a reference may be reused across workflows, operations, requests, or workspaces.
- Whether authorization context is intrinsic to the reference or supplied separately at lookup time.
- Whether an upload identity survives acceptance, ingestion, replacement, or deletion.
- Whether a persisted asset identity is the canonical production source identity.
- Whether references are aliases, durable identifiers, capabilities, or lookup keys.
- Lifetime, expiration, revocation, retention, and tombstone semantics.
- Authoritative replay and conflict behavior.

## 8. Candidate Identity Models

No candidate is adopted by this document.

### Candidate A: Artifact identity

- Meaning: identifies a logical or immutable media artifact.
- Uniqueness: `UNRESOLVED`; global or ownership-scoped.
- Lifetime: potentially artifact lifetime, but `UNRESOLVED`.
- Ownership: artifact ownership would need an authoritative association.
- Authorization: requires lookup-time authorization or a trusted scoped identity.
- Durability: potentially durable.
- Replay: naturally stable if immutable.
- Replacement: should normally create a new artifact identity, but this is not decided.
- Locator compatibility: compatible only if the locator can reach an artifact authority.
- Migration impact: requires a defined mapping from existing uploads and persisted assets.

### Candidate B: Upload-record identity

- Meaning: identifies an upload lifecycle record.
- Uniqueness: governed by the upload domain, scope `UNRESOLVED`.
- Lifetime: may end or change at acceptance, expiry, or cleanup.
- Ownership: naturally associated with upload authorization context.
- Authorization: can be checked against the upload record.
- Durability: may be weaker than artifact lifetime.
- Replay: depends on upload retention and terminal-state policy.
- Replacement: may produce a new upload record.
- Locator compatibility: requires an upload authority capable of yielding a materializable source.
- Migration impact: couples production materialization to upload lifecycle semantics.

### Candidate C: Persisted-asset identity

- Meaning: identifies an accepted, persisted asset record.
- Uniqueness: governed by asset persistence, scope `UNRESOLVED`.
- Lifetime: potentially durable beyond request and workspace lifetimes.
- Ownership: can be associated with persisted ownership and provenance.
- Authorization: requires an asset lookup authorization decision.
- Durability: strongest of the record-oriented candidates if persistence is authoritative.
- Replay: can support durable replay if mutation and provenance semantics align.
- Replacement: requires explicit versioning or replacement policy.
- Locator compatibility: compatible if asset lookup can safely resolve an internal location.
- Migration impact: requires upload-to-asset and workflow-input mappings.

### Candidate D: Workflow-input binding identity

- Meaning: identifies a source as bound to a workflow input.
- Uniqueness: likely workflow or workflow-execution scoped, but `UNRESOLVED`.
- Lifetime: tied to binding or workflow lifecycle.
- Ownership: inherited from workflow authorization and binding context.
- Authorization: naturally evaluated in workflow context.
- Durability: depends on workflow persistence.
- Replay: may reproduce the binding, not necessarily immutable artifact identity.
- Replacement: rebinding may preserve or replace the identity.
- Locator compatibility: current locator lacks workflow context, so the contract would need alignment.
- Migration impact: introduces an explicit workflow-to-source authority boundary.

### Candidate E: Operation-scoped capability reference

- Meaning: grants one operation the capability to resolve a source.
- Uniqueness: operation-scoped.
- Lifetime: normally bounded to an operation or attempt.
- Ownership: delegated through operation authorization.
- Authorization: capability possession may be relevant, but exact security semantics are `UNRESOLVED`.
- Durability: intentionally limited.
- Replay: weak unless a new capability is issued.
- Replacement: normally issues a new capability.
- Locator compatibility: current locator also lacks explicit operation context.
- Migration impact: requires capability issuance and validation decisions and may limit recovery.

### Candidate F: Composite identity with external ownership context

- Meaning: an opaque record identity resolved together with separately supplied ownership context.
- Uniqueness: unique only within the declared composite scope.
- Lifetime: determined by the authoritative record.
- Ownership: explicit external context rather than encoded identity.
- Authorization: locator or authority must receive and verify that context.
- Durability: depends on the underlying record.
- Replay: can be durable if the authority preserves identity and evidence.
- Replacement: can be defined by the underlying record model.
- Locator compatibility: not compatible with the current one-argument locator without contract alignment.
- Migration impact: expands lookup inputs and requires callers to provide authoritative context.

## 9. Uniqueness Boundary

The repository does not establish a uniqueness boundary for `opaqueSourceArtifactReference`.

The following are all `UNRESOLVED`:

- global uniqueness;
- tenant-local uniqueness;
- user-local uniqueness;
- workflow-local uniqueness;
- operation-local uniqueness;
- request-local uniqueness;
- workspace-local uniqueness;
- composite uniqueness.

Production locators must not assume that equal opaque strings from different contexts denote the same source until this boundary is decided.

## 10. Ownership Scope

Existing materialization validation proves consistency among asserted ownership projections for a request. It does not establish the authoritative ownership scope of the source reference.

The source may be tenant-owned, user-owned, workflow-owned, operation-delegated, or associated with a persisted asset record. Selection among these is `UNRESOLVED`. Ownership must not be inferred from identifier syntax or physical location.

## 11. Authorization Context

Authorization responsibility is not fully expressible through the current locator signature. A locator receiving only `{ opaqueReference }` cannot independently verify tenant, user, workflow, operation, request, or workspace scope unless the reference is itself an authority-bearing capability. The repository does not establish that capability model.

The architecture must decide whether:

- authorization is completed before locator invocation;
- the locator receives explicit authorization context;
- an authoritative registry resolves both identity and ownership;
- the reference is a scoped capability.

All four remain `UNRESOLVED`.

## 12. Workflow and Operation Relationship

Workflow and operation identities are present in adjacent contracts, while Input Materialization directly validates operation ownership and identity. No contract declares that a source reference is workflow-bound or operation-bound.

Cross-workflow and cross-operation reuse are `UNRESOLVED`. A production implementation must not bind source identity to either scope without a separate decision.

## 13. Workspace Relationship

Workspace is a destination and execution boundary for materialization. Existing validation binds the request to the execution workspace, and the adapter enforces workspace containment for the materialized output.

There is no evidence that workspace identity owns or namespaces the source reference. Source-reference reuse across workspaces is `UNRESOLVED`. The source identity must not be derived from workspace paths.

## 14. Persistence Relationship

Persistence contracts provide durable asset, registry, journal, provenance, and mutation concepts, but there is no committed equivalence or mapping contract between those identities and `SourceArtifactReference`.

Whether the source reference is:

- the persisted asset identity;
- an alias to it;
- an upload identity resolved into it;
- a workflow binding that points to it;

is `UNRESOLVED`.

## 15. Replay and Replacement Semantics

Request-level idempotency and source-identity replay are different concerns. Existing runtime-local request tracking prevents some repeated calls within one adapter instance; it does not prove durable replay safety.

The architecture has not decided:

- whether replay of the same reference must yield the same bytes;
- whether replacement may change the resolved bytes;
- whether replacement creates a new identity;
- whether stale references fail, redirect, or resolve historical versions;
- whether aliases may be repointed;
- whether deletion or revocation produces a tombstone.

All are `UNRESOLVED`.

## 16. Locator Compatibility

The current locator is structurally compatible only with identity models where the opaque reference alone is sufficient for authoritative resolution, or where authorization has conclusively occurred before lookup.

It is not sufficient by itself for models requiring tenant, user, workflow, operation, request, workspace, version, or authorization context at resolution time.

No path, filename, workspace-root, archive-root, environment, registry implementation, or filesystem policy is decided here.

## 17. Required Follow-up Decisions

Production locator implementation requires explicit decisions for:

1. The semantic object identified by `SourceArtifactReference`.
2. Its uniqueness boundary.
3. Its authoritative issuer and registry.
4. Its ownership scope.
5. The authorization context required for resolution.
6. Lifetime, revocation, deletion, and tombstone behavior.
7. Replay and replacement semantics.
8. Relationship to upload records.
9. Relationship to persisted assets and provenance.
10. Workflow, operation, request, and workspace reuse rules.
11. Whether the locator signature must carry external scope or authorization context.
12. Migration rules for existing or newly issued references.

## 18. Recommended Decision Order

The recommended architecture-decision order is:

1. Select the semantic identity model.
2. Define the uniqueness and ownership scope.
3. Select the authoritative issuer and registry boundary.
4. Define lookup authorization inputs and responsibility.
5. Define lifetime, replay, replacement, revocation, and deletion semantics.
6. Define mappings to upload, persistence, workflow, and operation identities.
7. Re-evaluate locator contract sufficiency.
8. Only then specify production locator implementation and migration.

This order avoids allowing a filesystem or registry implementation to accidentally define identity semantics.

## 19. Implementation Blocking Status

Production Locator implementation remains blocked.

The repository provides a safe opaque-reference boundary and ownership-consistency checks, but it does not establish identity meaning, uniqueness scope, authoritative ownership, authorization inputs, or durable replay semantics. Implementing a production locator now would require undocumented assumptions.

Document status: ready as an architecture audit and decision-input record.

Implementation status: `UNRESOLVED` pending the follow-up architecture decisions in Section 17.
