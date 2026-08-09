# Publication Lifecycle and Command Idempotency ADR V1

## 1. Status

Accepted. This document is the normative V1 decision for publication ownership, command identity, idempotency, lifecycle, published-video identity, persistence, and exact joins. It authorizes no Production code, schema, migration, provider, OAuth, or UI change.

## 2. Context

Creator Intelligence must eventually join a prediction and generated clip to one authoritative platform publication. UI state and platform video IDs alone cannot own the command or safely resolve retries after an uncertain external side effect.

## 3. Problem

The tracked Production code has no publication aggregate, command identity, lifecycle, idempotency policy, or authoritative published-video producer. Inventing these in an adapter would allow duplicate publication and fuzzy reverse lookup.

## 4. Constraints

- Publication is an external side effect.
- UI state is never authority.
- A platform video ID is a result identity, not a command identity.
- Unknown outcome must not trigger blind retry.
- Existing workflow operation identities are reused only as provenance, not silently reclassified as publication commands.
- Joins are exact and provider-neutral.

## 5. Publication Options

The evaluated owners were API/application service, workflow owner, dedicated publication aggregate, and review/UI service. API and UI are transport/presentation boundaries. Generic workflow ownership does not define platform publication semantics. Adopt a dedicated publication aggregate orchestrated by a Publication application service.

## 6. Publication Decision

The Publication application service owns command admission and lifecycle orchestration. The Publication aggregate owns one command's durable identity, immutable creator/generated-clip/target binding, state, attempts, and authoritative result evidence. Provider adapters execute an admitted command but do not create business identity.

## 7. Publication Command Owner

The Publication application service is the sole command-identity generation owner. Callers provide an authoritative opaque idempotency key plus authorized creator, generated clip, and target platform. The service validates and persists the binding before any external call.

## 8. Command Identity

`ClipPublicationCommandIdentityV1` is a versioned protected deterministic projection of tenant scope, creator account identity, generated-clip identity, target platform, and caller idempotency-key identity. The projection contract and algorithm/version belong to the Publication boundary. Random UUIDs, time, titles, filenames, URLs, and platform video IDs are forbidden inputs.

## 9. Idempotency Semantics

- Same command identity with the same creator, clip, and platform is an idempotent replay and returns the durable authoritative state.
- Same command identity with a different creator, clip, or platform is a semantic conflict.
- Different command identities for the same clip and platform are distinct explicit publication intents and may proceed only through normal policy; they are not deduplicated by content.
- A failed command is never retried under a newly inferred identity.
- Unknown outcome is reconciled under the same command identity before any further publish attempt.

## 10. Attempt Ordering

V1 does not introduce business ordering between distinct publication commands. Attempt evidence is local to one command and monotonically recorded by the Publication aggregate. Quality ranking, timestamps, and arrival order do not establish command precedence.

## 11. Publication Lifecycle

Adopt exactly five states: prepared, publishing, published, failed, and unknown-outcome. Prepared has durable identity but no dispatched side effect. Publishing records an admitted dispatch attempt. Published records authoritative platform-video identity. Failed records a definite non-publication failure. Unknown-outcome records that dispatch may have succeeded but acknowledgement is insufficient.

## 12. Allowed Transitions

Prepared may move to publishing or failed. Publishing may move to published, failed, or unknown-outcome. Unknown-outcome may move to published or failed only through authoritative reconciliation. Published and failed are terminal for that command identity. No transition returns to prepared.

## 13. Terminal Semantics

Published is terminal success. Failed is terminal definite failure for the command; a later user intent requires a new explicitly supplied idempotency key. Unknown-outcome is nonterminal but blocks dispatch and requires reconciliation. It is never represented as failed merely to enable retry.

## 14. Unknown Outcome

When a publish request may have crossed the external side-effect boundary but no authoritative result is known, the owner records unknown-outcome and reconciliation-required. Automatic publish retry is forbidden because it may duplicate content. Reconciliation uses the same command identity and provider-supported opaque lookup evidence; absent such evidence, operator resolution is required.

## 15. Publication Result Owner

The Publication aggregate owns `ClipPublicationResultV1`. A tracked Production publish adapter may supply provider evidence, but only the aggregate validates it against the admitted command and commits the result. UI responses and untracked upload candidates are not authorities.

## 16. Publication Result Contract

The result is a readonly, versioned discriminated union: published, failed, or unknown-outcome. Every variant carries command identity and exact creator/generated-clip/target binding. Published additionally carries authoritative `PublishedPlatformVideoIdentityV1`; failure carries safe classification; unknown-outcome carries reconciliation-required evidence without claiming success or failure.

## 17. Published Video Identity

`PublishedPlatformVideoIdentityV1` contains platform and opaque platform video ID. V1 platforms are YouTube, TikTok, and Instagram. Only a successful tracked Production adapter result, validated and committed by the Publication aggregate, may produce it. Source platform and publication platform remain independent.

## 18. Published Video Uniqueness

The pair platform plus platform video ID is globally unique within the Publication store. It attaches to exactly one publication command. An attempted attachment to another command is a conflict and never causes reassignment.

## 19. Source and Target Separation

Upload and YouTube describe source origin. Generic-short, YouTube Shorts, TikTok, and Instagram Reels describe optimization target. YouTube, TikTok, and Instagram describe published platform. No equality is implied among these dimensions.

## 20. Exact Forward Join

The forward chain is Creator Account to Source Artifact to Generated Clip to Publication Command to Publication Result to Published Platform Video. Each relation stores the exact upstream identity. No title, filename, URL, duration, timestamp, transcript, or similarity join is permitted.

## 21. Exact Reverse Join

The reverse chain begins with the unique platform/video pair, resolves its publication command, then the generated clip, source artifact, and creator account through stored relations. A prediction joins by its exact generated-clip, creator, and target identities and the publication's recorded prediction reference.

## 22. Prediction Identity

`ClipPredictionIdentityV1` is established before publication and binds creator account, generated clip, platform target, and prediction contract version. An admitted publication records the exact prediction identity it publishes. Publication never reconstructs prediction identity from result metadata.

## 23. Persistence Options

The evaluated options were dedicated Creator Publication persistence, generic workflow-store extension, and publication-specific persistence without creator/clip ownership. Adopt dedicated Creator Publication persistence: it aligns exact joins, external-side-effect idempotency, analytics queries, and multi-platform lifecycle without overloading workflow terminal-result semantics.

## 24. Persistence Owner

The Creator Publication store owns generated-clip ownership records, publication commands, attempts, lifecycle state, result evidence, published-video identity, and prediction linkage. Creator accounts and principal bindings remain owned by the Creator Account store. Existing Source Artifact authority remains external and is referenced exactly.

## 25. Transaction Boundaries

Command identity and immutable binding commit atomically before dispatch. Each lifecycle transition, attempt evidence, and result attachment uses revision/fencing semantics owned by the future persistence contract. Published-video attachment and transition to published are atomic. Outbox or provider dispatch implementation is deferred, but may not weaken these boundaries.

## 26. Uniqueness Rules

- Creator account identity is unique in its owning store.
- Principal/creator binding pair is unique in tenant/workspace scope.
- Generated clip canonical tuple is unique.
- Publication command identity is unique and immutable.
- Platform plus platform video ID is unique.
- One command has at most one authoritative published-video identity.

## 27. Analytics Readiness

The accepted chain permits future performance ingestion to resolve platform video to publication, prediction, generated clip, source, and creator without inference. Live metrics, OAuth, polling, performance storage, and Creator Intelligence scoring remain outside this ADR.

## 28. Rejected Alternatives

- UI/review page owns publication: presentation state is nondurable.
- Platform video ID is command ID: unavailable before dispatch and unsafe for unknown outcomes.
- Generic workflow operation ID is silently reused: lacks publication-specific immutable binding.
- Content-based deduplication: conflates deliberate republication with replay.
- Blind retry after unknown outcome: risks duplicate external publication.
- Fuzzy reverse lookup: is not authoritative.

## 29. Consequences

Publication gains deterministic idempotency, explicit uncertain-outcome handling, and exact analytics linkage. The cost is additive contracts, a dedicated persistence foundation, a tracked Production publish adapter, and reconciliation capability before live integration.

## 30. Migration Impact

Migration is additive and belongs to the next Change Set. It must represent creator/source/generated-clip relations, command identity and immutable binding, state and attempt evidence, prediction linkage, result evidence, and unique published-video identity. Existing workflow and replay schemas are unchanged. Historical UI-only publications remain unlinked unless authoritative identities are supplied.

## 31. Compatibility

This ADR changes no current API, UI, workflow, ranking, Source Artifact, or platform-profile behavior. Future contracts are additive and versioned. No fallback adapter may invent missing identity.

## 32. Open Decisions

None for V1.
