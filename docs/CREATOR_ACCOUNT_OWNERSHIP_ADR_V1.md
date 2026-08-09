# Creator Account Ownership and Principal Binding ADR V1

## 1. Status

Accepted. This document is the normative V1 decision for creator-account ownership and principal binding. It authorizes no Production code, schema, migration, UI, or authentication change.

## 2. Context

Cut Intelligence requires a durable business subject for creator-specific prediction, publication, and later analytics. `AuthenticationSubject` identifies an authenticated actor, but actors include users, services, and systems and therefore cannot themselves be creator accounts.

## 3. Problem

The repository has authenticated principals, tenant and optional workspace context, `SourceArtifactReference`, and ranking-oriented `stableCandidateId`. It has no business owner for creator history and no formal principal-to-creator relation. Treating an email, session, credential, or principal reference as a creator would couple business identity to authentication implementation and would make delegated and background work ambiguous.

## 4. Constraints

- Authentication remains unchanged.
- A creator identity is never inferred from email, session, credential, request, or display data.
- User, service, and system principals are not equivalent.
- Existing source-artifact authority remains authoritative for source identity.
- Creator Style remains an explicit presentation preference and is not creator identity.
- All joins are exact; fuzzy identity recovery is forbidden.

## 5. Creator Options

The evaluated options were authenticated human user, tenant/workspace itself, dedicated Creator Account aggregate, and workflow owner identity. User identity cannot represent teams or delegation. Tenant/workspace is too broad and may contain multiple creators. Workflow ownership is execution-scoped. A dedicated aggregate is the only option that preserves business lifecycle and delegated access without changing authentication.

## 6. Creator Decision

Adopt a dedicated, tenant-scoped Creator Account aggregate. `CreatorAccountIdentityV1` is an opaque, versioned business identity issued by the Creator Account application boundary. It is not derived by consumers. A workspace reference may scope the account when present, but neither tenant nor workspace is itself the creator identity.

## 7. Creator Account Owner

The Creator Account application service owns account issuance, lifecycle, tenant/workspace scope, and binding mutation. Authentication validates actors; authorization decides access; neither creates creator accounts. Cut Intelligence consumes only an already-authorized creator context.

## 8. Principal Binding

Adopt an explicit `CreatorAccountPrincipalBindingV1` relation between one `AuthenticationSubject` and one `CreatorAccountIdentityV1`. The binding source of truth is the Creator Account aggregate. A request may use a creator only after an active exact binding and normal authorization both succeed. There is no inferred or default binding.

## 9. Binding Cardinality

Binding is many-to-many: one principal may be explicitly bound to multiple creator accounts and one creator account may have multiple principals. The pair of tenant-scoped principal identity and creator account identity is unique. A request naming no creator when multiple active bindings exist returns ambiguous-binding; it never selects one automatically.

## 10. Binding Lifecycle

Bindings have active and revoked states. Revocation prevents future authorization but does not rewrite historical ownership. Duplicate active binding creation is idempotent only when creator, principal, tenant/workspace scope, and binding semantics are identical; otherwise it is a conflict.

## 11. Human Principal Semantics

A human user requires an explicit active binding. Being authenticated, being the uploader, or sharing a tenant is insufficient on its own. Delegated access is represented by another explicit binding and ordinary authorization policy.

## 12. Service Principal Semantics

A service principal is never auto-bound. It may act for a creator only with an explicit active delegated binding and an explicit creator context supplied to the operation. The service identity remains the actor for audit; the creator account remains the business owner.

## 13. System Principal Semantics

A system principal cannot originate creator-owned source, clip, or publication work. A background system operation may continue work only by carrying a previously authorized creator context and originating operation identity. Missing or invalid inherited context is rejected, not inferred.

## 14. Ownership Chain

The authoritative business chain is Creator Account to Source Artifact to Generated Clip to Publication. Each edge is an explicit immutable relation. Actor/audit identity remains separate from business ownership throughout the chain.

## 15. Source Artifact Relation

Reuse the existing `SourceArtifactReference` as source identity. Additive creator ownership binds an exact `CreatorAccountIdentityV1` to an exact `SourceArtifactReference` within tenant/workspace scope. Filename, URL, YouTube title, and media contents never establish ownership. An external YouTube video ID may be source provenance, but it does not replace the internal source-artifact reference.

## 16. Generated Clip Identity

A Production generated-clip identity is creator-bound and source-bound. Its canonical identity input is creator account identity, exact source-artifact reference, unchanged `stableCandidateId`, canonical start/end boundaries, and the authoritative generation operation identity. `stableCandidateId` remains a ranking identity and its existing semantics do not change. The Production identity owner is the generated-clip component of the Creator Publication aggregate.

## 17. Generated Clip Uniqueness

Canonical uniqueness covers creator, source artifact, stable candidate ID, canonical boundaries, and generation operation. Consequently, equal candidate IDs from different source artifacts do not collide. Time, random values, title, filename, and fuzzy transcript hashes are forbidden identity inputs.

## 18. Prediction Link

A prediction identity binds creator account, generated clip, platform target, and prediction contract version before publication. Publication later references this exact prediction identity; it does not discover predictions by title, time, duration, or text.

## 19. Persistence Ownership

The Creator Account store owns accounts and principal bindings. The Creator Publication store owns creator/source ownership edges and generated-clip identity records. Existing authentication and generic workflow stores are not silently extended into these business owners.

## 20. Exact Join

Forward joins use creator identity, source-artifact reference, and generated-clip identity. Reverse joins use the recorded foreign-key relations. Exact identity mismatch is rejected. Fuzzy join count is zero.

## 21. Security and Privacy

Creator IDs are opaque. Credentials, email, session references, raw source locators, and provider tokens are excluded from public contracts and analytics evidence. Authorization remains mandatory even when an identity relation exists.

## 22. Rejected Alternatives

- Authenticated user equals creator: rejects teams, services, and delegation semantics.
- Tenant/workspace equals creator: cannot represent multiple creators in one scope.
- Workflow owner equals creator: execution identity is not a durable business aggregate.
- Implicit first/default creator: ambiguous and unsafe.
- Email, session, filename, URL, title, or content-derived identity: unstable or sensitive inference.

## 23. Consequences

Creator-specific history gains one stable owner and audit retains the initiating actor separately. The cost is a dedicated account/binding persistence foundation and explicit creator context propagation. Existing Cut Intelligence behavior remains unchanged until that foundation is integrated.

## 24. Migration Impact

Migration is additive: new creator-account, principal-binding, ownership-edge, and generated-clip records are required. Existing candidates and authentication records are not rewritten. Historical data without an exact creator/source chain remains unlinked and is not backfilled by inference.

## 25. Compatibility

Existing `AuthenticationSubject`, `SourceArtifactReference`, and `stableCandidateId` contracts remain unchanged. New identity contracts are additive and versioned. No implicit adapter from principal to creator is permitted.

## 26. Analytics Readiness

This decision supplies the creator, source, generated-clip, and prediction side of the future exact analytics chain. It does not supply publication, performance metrics, analytics ingestion, or Creator Intelligence scoring.

## 27. Open Decisions

None for V1.
