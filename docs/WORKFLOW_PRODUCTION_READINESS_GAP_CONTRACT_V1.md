# Workflow Production Readiness Gap Contract V1

Status: Design contract

Scope: Reference Workflow FoundationからProduction Systemへ移行する境界

Normative terms: MUST、MUST NOT、SHOULD、MAYは本Contractの拘束度を示す。

## 1. Purpose

- Reference Foundation Completeは、決定的fixtureで境界と成功経路を検証済みであることを意味する。
- Production Readyは、永続性、分散調整、運用、安全性を含む本番受入Gateを満たすことを意味する。
- Real Provider Readyは、実Provider固有の資格情報、契約、非同期挙動、障害を検証済みであることを意味する。
- Production UI Readyは、認証済み利用者向けUX、永続回復、Asset Deliveryを検証済みであることを意味する。
- 四つの状態は独立した判定であり、相互に読み替えてはならない。
- 目的はReference完成範囲を維持しつつ、Production化の責務、Owner、順序、停止条件、受入基準を固定することである。
- Owner未割当または証跡不足の領域は未完了として扱う。

## 2. Current Reference Completion

- Developer-only Routeからterminal Result、Result Query、terminal Cancel replayまでの実HTTP経路は完成している。
- Fixture／HTTP mode isolation、Production hard deny、connection／workflow state分離は完成している。
- Vocal、Music、MVのCanonical Reference scenarioはReference範囲で完成している。
- race、late response、Strict Mode、Hydration、accessibility、安全なAsset表示はReference UIで検証済みである。
- Reference assertionは将来実装の回帰oracleとして保持する。
- 完成のOwnerはReference Workflow Maintainerである。
- 受入証跡は既存Contract、pure assertion、HTTP assertion、React assertionである。

### Current Completion Matrix

| Boundary | Reference status | Production status | Real Provider status | Production UI status | Current owner | Required future owner | Primary gap | Risk |
|---|---|---|---|---|---|---|---|---|
| Workflow Start | Complete | Not ready | Not validated | Not ready | Entry Point | API Platform | durable claim | duplicate submit |
| Upload Gate | Complete | Not ready | Not validated | N/A | Upload Gate | Workflow Platform | durable acceptance | unknown acceptance |
| Accepted Persistence | Complete | Not ready | N/A | N/A | Reference Store | Data Platform | durable transaction | state loss |
| Upload Poll | Complete | Not ready | Not validated | Not ready | Upload Pipeline | Worker Platform | scheduler/lease | duplicate poll |
| Resume | Complete | Not ready | Not validated | Not ready | Resume Pipeline | Workflow Platform | durable journal | missed recovery |
| Materializer | Complete | Not ready | Conditional | N/A | Materializer | Asset Platform | production capability | inaccessible input |
| Provider Client | Complete | Not ready | Not validated | N/A | Provider Client | Provider Integration | real binding | contract drift |
| Generation Job | Complete | Not ready | Not validated | Not ready | Operation Pipeline | Worker Platform | durable job | terminal overwrite |
| Normalizer | Complete | Interface ready | Not validated | N/A | Provider Adapter | Provider Integration | real fixtures | unsafe mapping |
| Output Ingestion | Complete | Not ready | Not validated | N/A | Ingestion | Asset Platform | atomic ingest | partial output |
| Final Result | Complete | Not ready | Not validated | Not ready | Workflow Service | Data Platform | durable final CAS | split truth |
| Result Reference | Complete | Not ready | N/A | Not ready | Reference Vault | Security/Data | durable vault | reference loss |
| Cancel | Complete | Not ready | Not validated | Not ready | Controller/API | Workflow Platform | layered cancel state | false completion |
| API Service | Complete | Not ready | N/A | N/A | Workflow API | API Platform | external composition | process coupling |
| API Route | Complete | Not ready | N/A | N/A | Next.js Route | API Platform | production capability | route exposure |
| Authentication | Fixture complete | Not ready | N/A | Not ready | Reference Auth | Identity | OIDC/session | identity spoofing |
| CSRF | Fixture complete | Not ready | N/A | Not ready | Reference CSRF | Security | distributed/session binding | forgery |
| Fetch Client | Complete | Boundary ready | N/A | Not ready | Fetch Client | Web Platform | production error policy | unsafe replay |
| Hook | Complete | Boundary ready | N/A | Not ready | Workflow UI | Web Platform | durable recovery adapter | stale UI |
| Developer UI | Complete | Must not promote | N/A | Not ready | Developer Tools | Web Product | product UX | fixture leakage |
| Asset Delivery | Presentation only | Not ready | Not validated | Not ready | Result DTO | Asset Platform | authenticated delivery | unauthorized access |

## 3. Production Definition

- Production Ready requires durable Stores, stateless API instances, distributed coordination, production identity, safe operations, and launch approval.
- Every external side effect MUST have an idempotency, unknown-outcome, reconciliation, and audit policy.
- Every durable record MUST have lifecycle, retention, deletion, region, and schema owners.
- Production capability MUST be server-owned and MUST NOT be enabled by query, browser env, or client override.
- Readiness requires staging evidence under multi-process, restart, timeout, and partial-failure conditions.
- Accountable owner is Production Readiness Lead.
- Acceptance is all mandatory gates in section 103 passing with no section 104 stop condition.

## 4. Real Provider Definition

- Real Provider Ready is evaluated per operation and provider binding, not globally.
- Binding ID, API version, credential scope, request/response schema, job semantics, and cost mapping MUST be fixed.
- Provider sandbox success alone is insufficient; unknown acceptance, retry, cancellation, output lifetime, and rate limiting MUST be exercised.
- Provider selection for Vocal、Music、MV remains TBD until procurement and technical review.
- Reference transport summaries MUST NOT become production request bodies.
- Accountable owner is Provider Integration Lead.
- Acceptance requires signed provider checklist and staging evidence for the chosen binding.

## 5. Production UI Definition

- Production UI is an authenticated product surface, not the developer fixture panel or HTTP developer panel.
- It MUST use production capability, product inputs, durable recovery, user-safe errors, progress, cancellation, and Asset Delivery.
- It MUST define multi-tab, storage unavailable, logout, account switch, tenant switch, and expired session behavior.
- It MUST present privacy, cost/billing, support, and destructive-action semantics.
- Developer routes and canonical fixtures MUST remain inaccessible in production.
- Accountable owner is Web Product Lead.
- Acceptance requires browser E2E against staging production services without developer fixtures.

## 6. Current Runtime Topology

- Current Reference composition uses `globalThis`, `Symbol.for`, and one Node process.
- It provides stable reuse inside a Reference process and supports deterministic HTTP verification.
- It does not guarantee cross-instance identity, persistence, locking, drain, or deployment compatibility.
- Route handlers currently reach a server-owned Reference composition boundary.
- This topology MUST remain labeled Reference-only.
- Current owner is Reference API Maintainer.
- Exit criterion is an external composition root proven across multiple instances.

## 7. Current Process-local State

- Reference Stores, fixtures, CSRF state, assets, job state, and runtime dependencies are process-local.
- Restart, eviction, scale-out, and rolling deployment can lose or partition this state.
- Process-local state remains valuable for tests and local development.
- No production durability or distributed exclusion claim may cite it.
- Production adapters MUST share interfaces where safe and replace storage semantics.
- Current owner is Reference Store Maintainer; future owner is Data Platform.
- Stop condition is any production path depending on process-local correctness.

## 8. Current Security Model

- Fixed authentication fixture and Reference CSRF Store prove boundary wiring only.
- Production hard deny protects the developer route and MUST be preserved.
- Safe DTOs avoid exposing storage locators, signed URLs, credentials, and restricted payloads.
- Reference values MUST NOT be treated as production identity or authorization evidence.
- Security assumptions MUST be threat-modeled before production exposure.
- Current owner is Reference Security Boundary; future owner is Security/Identity.
- Acceptance requires production identity, authorization, CSRF, proxy, rate, and audit controls.

## 9. Current Provider Model

- Reference Provider Client, Job Poll Client, adapters, and fixtures are deterministic contract doubles.
- They validate orchestration, normalization, polling, ingestion, and terminal behavior.
- They do not prove provider availability, credentials, quotas, cost, webhook signatures, or output lifetime.
- Their interfaces and canonical assertions SHOULD be retained.
- Their transports MUST be replaced for production bindings.
- Current owner is Provider Foundation; future owner is Provider Integration.
- Acceptance requires per-operation real-provider evidence.

## 10. Current Storage Model

- Current storage is in-memory and scoped to the Reference process runtime.
- Reference IDs and protected values are kept behind interfaces and safe projections.
- Atomicity is only meaningful inside the current process implementation.
- TTL, retention, deletion, region, backup, and disaster recovery are not production-defined.
- Store contracts SHOULD become production conformance suites.
- Current owner is Reference Store Maintainer; future owner is Data Platform.
- Acceptance requires the section 17 matrix to have approved concrete adapters.

## 11. Current Job Model

- Reference jobs support deterministic accepted, pending, terminal, polling, resume, and cancel flows.
- The model demonstrates operation-specific resume and terminal reconciliation boundaries.
- It does not supply a distributed scheduler, lease service, webhook inbox, or worker drain.
- Client polling MUST NOT be the only production progress mechanism.
- Terminal state MUST be protected by revision/CAS.
- Current owner is Operation Pipeline; future owner is Worker Platform.
- Acceptance requires crash-safe workers and reconciliation.

## 12. Current UI Model

- Fixture mode and HTTP mode are isolated developer-only tools.
- Connect/Disconnect/Reconnect and workflow state separation are complete in the Reference panel.
- Sensitive DOM non-exposure, keyboard use, focus, and safe Asset presentation are verified.
- The panel is not a product information architecture, billing surface, or durable browser recovery implementation.
- It MUST NOT be promoted or relabeled as Production UI.
- Current owner is Developer Tools; future owner is Web Product.
- Acceptance requires a separate product surface satisfying section 80.

## 13. Production Architecture Target

- Target: external dependency container, durable Stores, stateless API instances, workers, distributed coordination, and authenticated Asset Delivery.
- API instances own validation and command admission; workers own leased asynchronous execution.
- Durable Stores own truth; queues/webhooks are delivery mechanisms, not sole truth.
- Composition Root owns dependency construction, version checks, health, readiness, shutdown, and drain.
- Recommended baseline is containerized long-lived API and workers plus managed durable database and queue; final products remain TBD.
- Accountable owner is Platform Architecture.
- Acceptance requires an approved topology ADR and staging deployment.

## 14. Migration Principles

- Preserve Reference interfaces and assertions where they express stable semantics.
- Replace process-local implementations behind explicit production interfaces.
- Migrate one bounded responsibility at a time with dual conformance evidence.
- Never infer production capability from Reference completion.
- Never guess provider, SLO, retention, database, queue, identity, or region decisions.
- Migration owner is Production Readiness Lead.
- Rollback MUST remain possible until each phase exit criterion is met.

## 15. Responsibility Matrix

| Responsibility | Accountable owner | Implementing owner | Consulted owner | Approval evidence |
|---|---|---|---|---|
| Runtime composition | Platform Architecture | API Platform | SRE | topology ADR |
| Durable persistence | Data Platform | Data Platform | Workflow Platform | store conformance |
| Workflow transactions | Workflow Platform | API/Worker Platform | Data Platform | failure matrix |
| Identity/security | Security Lead | Identity Platform | Web/API Platform | threat model |
| Provider bindings | Provider Integration Lead | Provider Integration | Procurement/Security | binding checklist |
| Asset lifecycle | Asset Platform Lead | Asset Platform | Security/Legal | delivery/retention tests |
| Production UI | Web Product Lead | Web Platform | Accessibility/Privacy | browser E2E |
| Operations | SRE Lead | SRE | all owners | runbooks/drills |
| Billing | Billing Product Lead | Billing Platform | Finance/Workflow | ledger reconciliation |

## 16. Runtime Composition

- Composition Root MUST be external to route-local `globalThis` state.
- Initialization MUST validate config, schema compatibility, credentials handles, and mandatory dependencies.
- Readiness MUST fail closed when command-critical dependencies are unhealthy or incompatible.
- Liveness MUST distinguish process health from dependency readiness.
- Shutdown MUST stop admission, drain leases, checkpoint journals, and close dependencies.
- Lifecycle owner is API Platform; drain owner is SRE/Worker Platform.
- Acceptance: restart and rolling deployment tests show no duplicate side effect or lost terminal state.

### Reference-only Component Disposition

| Component | Retain for tests | Replace for production | Delete before production | Share interface only | Decision owner |
|---|---:|---:|---:|---:|---|
| `globalThis` process runtime | Yes | Yes | No | No | API Platform |
| in-memory Stores | Yes | Yes | No | Yes | Data Platform |
| deterministic fixture digest | Yes | Yes | No | No | Test Platform |
| fixed authentication fixture | Yes | Yes | production bundle only | Principal shape | Identity |
| Reference CSRF Store | Yes | Yes | production bundle only | Yes | Security |
| Reference Provider Client | Yes | Yes | No | Yes | Provider Integration |
| Reference Asset Store | Yes | Yes | No | Yes | Asset Platform |
| Reference Job Poll Client | Yes | Yes | No | Yes | Worker Platform |
| Reference capability env | Yes | Yes | production bundle only | capability schema | API Platform |
| developer-only route | Yes | N/A | production deployment | No | Developer Tools |
| canonical fixtures | Yes | N/A | production bundle | Contract only | Test Platform |
| fixture panel | Yes | N/A | production deployment | No | Developer Tools |
| HTTP developer panel | Yes | N/A | production deployment | Hook contract only | Developer Tools |

## 17. Durable Persistence

- Every production Store MUST define keys, protected lookup, revision, lifecycle, transaction and recovery ownership.
- `TBD` means a launch-blocking decision, not permission to use a default.
- Protected indexes MUST avoid logging or browser projection of raw sensitive identifiers.
- Revision is mandatory where competing commands can overwrite state.
- TTL and retention durations remain TBD pending product, legal, and security approval.
- Data Platform owns adapter conformance; domain owners own record semantics.
- Acceptance requires multi-process and restart conformance for every used row.

### Durable Store Matrix

| Store | Current implementation | Production interface | Primary key | Protected index | Revision | TTL | Retention | Transaction owner | Recovery owner | Deletion owner | Region owner |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Accepted Persistence | memory | AcceptedStore | opaque acceptance ID | semantic claim | Yes | TBD | TBD | Upload Gate | Resume Worker | Data Lifecycle | Residency |
| Poll State | memory | PollStateStore | opaque poll ID | job/operation lookup | Yes | TBD | TBD | Poll Worker | Scheduler | Data Lifecycle | Residency |
| Resume Record | memory | ResumeStore | opaque resume ID | active operation | Yes | TBD | TBD | Resume Pipeline | Resume Worker | Data Lifecycle | Residency |
| Resume Journal | memory | ResumeJournal | journal ID | resume/stage | append | TBD | TBD | Resume Pipeline | Reconciler | Audit/Data | Residency |
| Materialization Idempotency | memory | MaterializationClaimStore | namespaced key handle | fingerprint handle | Yes | TBD | TBD | Materializer | Reconciler | Data Lifecycle | Residency |
| Generation Idempotency | memory | GenerationClaimStore | namespaced key handle | fingerprint handle | Yes | TBD | TBD | Generation Pipeline | Reconciler | Data Lifecycle | Residency |
| Generation Job | memory | GenerationJobStore | opaque job ID | provider job handle | Yes | TBD | TBD | Worker Platform | Job Reconciler | Data Lifecycle | Residency |
| Output Ingestion Idempotency | memory | IngestionClaimStore | namespaced key handle | output handle | Yes | TBD | TBD | Ingestion | Ingestion Reconciler | Asset Lifecycle | Residency |
| Final Result | memory | FinalResultStore | opaque result ID | workflow/owner lookup | Yes | TBD | TBD | Workflow Service | Result Reconciler | Data Lifecycle | Residency |
| API Idempotency | memory | ApiCommandClaimStore | namespaced key handle | principal/fingerprint handle | Yes | TBD | TBD | API Service | API Reconciler | Data Lifecycle | Residency |
| Result Reference Vault | memory | ResultReferenceVault | opaque reference | result/owner lookup | Yes | TBD | TBD | Workflow Service | Result Reconciler | Security/Data | Residency |
| Auth Session | fixture | AuthSessionStore | opaque session ID | principal handle | Yes | TBD | TBD | Identity | Identity | Identity/Privacy | Residency |
| CSRF | memory fixture | CsrfTokenStore | session-bound handle | token digest | Yes | TBD | TBD | Security | Security | Security | Residency |
| Restricted Adapter Request | memory | RestrictedRequestVault | opaque request ID | workflow/stage | Yes | TBD | TBD | Provider Integration | Reconciler | Privacy | Residency |
| Original Input Record | memory/fixture | OriginalInputVault | opaque input ID | owner/workflow | Yes | TBD | TBD | Workflow Entry | Support/Reconciler | Privacy | Residency |
| Audit／Outbox | absent/reference issue | AuditOutboxStore | event ID | aggregate/revision | append | TBD | TBD | Domain transaction | Outbox Worker | Audit/Legal | Residency |

## 18. Transaction Boundaries

- Standard sequence is validate → reserve/claim transaction → external I/O → journal transaction → final CAS → outbox.
- External Provider I/O MUST NOT execute inside a database transaction.
- Validate stage rejects malformed, unauthorized, over-quota, or incompatible requests without side effects.
- Reserve stage atomically establishes ownership, idempotency state, revision, and lease where needed.
- External I/O has bounded timeout; unknown response becomes `unknown`, never automatic blind resubmit.
- Journal stage records safe outcome class; crash before it is reconciled from claim plus provider lookup.
- Final CAS prevents stale, late, or duplicate responses from overwriting terminal truth.
- Outbox is committed with final state and delivered at-least-once to idempotent consumers.
- Partial commit, duplicate, crash, and unknown outcome MUST each have an automated or operator recovery path.

## 19. Distributed Idempotency

- Namespaces are API, acceptance, poll, resume, materialization, generation-submit, generation-poll, output-ingestion, final-result, and cancellation.
- Each namespace MUST have one domain owner and one durable claim Store.
- Semantic fingerprint MUST use canonical safe semantics and MUST NOT be logged raw.
- Raw idempotency keys and fingerprints MUST NOT appear in logs, metrics, traces, issues, or browser state.
- Same key/same semantics replays the prior safe outcome; same key/different semantics is a conflict.
- Unknown outcome remains claimed until reconciliation proves retry-safe or terminal.
- TTL is namespace-specific and TBD; pruning MUST respect active work, retention, disputes, and legal hold.
- Schema/fingerprint migration MUST support rolling old/new readers or stop admission.
- Acceptance requires cross-instance concurrency tests for every namespace used in production.

## 20. Reference Vault Persistence

- Result References are opaque capabilities that resolve only through an authorized server-side vault.
- Production vault MUST bind reference, owner, tenant, region, operation, lifecycle, and result revision.
- Lookup MUST return a safe Result DTO, never storage locator, credential, or provider output reference.
- Reference rotation and revocation MUST preserve auditability without exposing prior values.
- Missing, expired, deleted, and unauthorized MUST have non-enumerating responses.
- Owner is Security/Data Platform; query policy owner is Workflow API.
- Acceptance requires restart, rotation, revocation, and authorization tests.

## 21. Pending Upload Persistence

- Accepted upload state MUST be durable before returning an accepted response.
- Record MUST capture safe operation state, binding versions, revision, expiry class, and opaque handles.
- Provider upload acceptance unknown MUST not trigger unguarded duplicate upload.
- Poll and resume MUST claim through a lease/CAS boundary.
- Expiry priority and cleanup behavior MUST be contractually fixed.
- Owner is Upload Gate; recovery owner is Resume/Scheduler.
- Acceptance requires crash tests at every acceptance and journal boundary.

## 22. Generation Job Persistence

- Generation job truth MUST survive API and worker restart.
- Record MUST separate local job status, provider acceptance status, provider terminal status, and ingestion status.
- Provider job identifiers MUST be protected handles, not browser-visible values.
- Late provider responses MUST pass revision and terminal reconciliation rules.
- Lease expiry permits safe takeover but not duplicate provider submit.
- Owner is Worker Platform; domain mapping owner is Provider Integration.
- Acceptance requires multi-worker claim, takeover, cancel, and terminal-race tests.

## 23. Final Result Persistence

- Final Result MUST be committed once through a revision-checked terminal transition.
- It MUST reference ingested logical assets, not provider URLs or storage locators.
- Replayed finalization returns the same safe terminal result.
- Conflicting finalization becomes reconciliation work and MUST NOT overwrite silently.
- Deletion and legal hold state MUST affect query and Asset Delivery consistently.
- Owner is Workflow Service/Data Platform.
- Acceptance requires atomic result/outbox evidence and query-after-restart tests.

## 24. Restricted Input Persistence

- Story、Lyrics、Scene、Prompt、original inputs and adapter payloads require restricted storage classification.
- Browser Session V2 MUST NOT store these values.
- Records MUST use opaque handles, encryption, least-privilege access, region binding, and audited reads.
- Normal logs, issues, metrics, traces, Result DTOs, and references MUST exclude contents.
- Retention, deletion, and legal hold are TBD policy decisions and launch blockers.
- Owner is Privacy/Data Platform; access owner is the consuming domain.
- Acceptance requires data-flow review and sensitive-value scanning.

## 25. Credential Vault

- Provider secrets MUST reside in an approved secret store using KMS/envelope encryption where applicable.
- Access MUST be scoped by provider, operation, environment, tenant if required, and region.
- Runtime receives a short-lived credential or opaque handle, not a broadly reusable secret.
- Rotation, revocation, retry during rotation, access audit, and compromise response MUST be defined.
- Credentials MUST NOT enter Workflow Result, Audit payload, Issue, Reference, browser, or raw error.
- Owner is Security/Secrets Platform; use policy owner is Provider Integration.
- Acceptance requires rotation and compromise-response drills with leakage scans.

## 26. Authentication

- Fixed Reference authentication fixture MUST NOT be promoted.
- Production choice may be OIDC/session provider but vendor remains TBD.
- Session transport SHOULD use HttpOnly Secure cookies with approved SameSite policy.
- Rotation, revocation, MFA policy, account status, tenant membership, region, and permissions MUST be resolved.
- Only a minimal Principal projection enters Workflow API; token, email, and provider claims MUST NOT flow inward.
- Owner is Identity Platform.
- Acceptance requires threat model, session lifecycle tests, and production-provider staging integration.

## 27. Authorization

- Commands start, upload poll, generation poll, result, cancel, and asset delivery require independent authorization.
- Checks MUST cover tenant, region, operation, ownership, permission, deletion, legal hold, account, and billing entitlement.
- Possession of a Reference alone MUST NOT authorize access.
- Authorization MUST execute server-side before protected lookup or side effect.
- Denials MUST resist enumeration and expose only safe reason codes.
- Owner is Authorization Service/Security; domain policies belong to command owners.
- Acceptance requires cross-tenant, stale-session, revoked-owner, and deleted-resource tests.

## 28. Session Management

- Auth session and Workflow browser recovery session are separate lifecycles.
- Auth sessions require rotation, revocation, expiry, device/browser policy, and account-switch invalidation.
- Workflow Session V2 contains only safe recovery references and state permitted by its Contract.
- Logout MUST revoke or detach recovery access according to approved policy.
- Server session truth wins over browser-cached state.
- Owner is Identity for auth and Web Platform for recovery projection.
- Acceptance requires logout, revocation, expiry, multi-tab, and account-switch tests.

## 29. CSRF

- Reference CSRF Store proves request binding only and MUST be replaced.
- Production CSRF MUST bind token proof to authenticated session and intended same-origin policy.
- Token values MUST be protected, rotated, bounded, and excluded from logs and browser recovery records.
- Mutation routes MUST fail closed on absent, invalid, expired, or mismatched proof.
- GET/result reads still require authorization and safe caching policy.
- Owner is Security/Web Platform.
- Acceptance requires cross-site, replay, rotation, parallel-tab, and session-revocation tests.

## 30. Trusted Proxy

- Production MUST define which proxy hops may supply scheme, host, client address, and request identity headers.
- Untrusted forwarding headers MUST be ignored or stripped.
- Same-origin and secure-cookie decisions MUST use normalized trusted context.
- Proxy changes require security review and staging verification.
- Raw client address SHOULD NOT become a high-cardinality metric dimension.
- Owner is Edge Platform/Security.
- Acceptance requires spoofed-header and multi-proxy tests.

## 31. CORS

- Workflow API SHOULD remain same-origin unless a separately approved client requires CORS.
- If enabled, origins, methods, headers, credentials, preflight caching, and failure behavior MUST be explicit.
- Wildcard origin with credentials is forbidden.
- CORS is not authentication, authorization, or CSRF protection.
- Developer origins MUST NOT leak into production allowlists.
- Owner is Edge Platform/Security.
- Acceptance requires allow/deny browser tests from representative origins.

## 32. Rate Limiting

- Limits MUST be command-aware and distinguish start, poll, result, cancel, and Asset Delivery.
- Dimensions may use protected principal/tenant handles, not raw sensitive values.
- Distributed enforcement is required across API instances.
- Retry guidance MUST avoid synchronized poll storms.
- Limits, burst, and response policy remain TBD pending load and product requirements.
- Owner is API Platform/Abuse Prevention.
- Acceptance requires distributed load tests and authorized emergency override procedure.

## 33. Request Body Limits

- Limits MUST be defined per route and content type before parsing restricted content.
- Oversized requests MUST fail without persisting or logging body content.
- Streaming and upload paths require independent byte, duration, and decompression controls.
- Reverse proxy and application limits MUST be compatible.
- Numeric thresholds remain TBD until real input profiles are measured.
- Owner is API Platform/Security.
- Acceptance requires boundary, compressed payload, slow-body, and malformed encoding tests.

## 34. Abuse Prevention

- Controls MUST cover automated starts, poll amplification, result enumeration, cancellation abuse, and delivery scraping.
- Signals MUST be privacy-reviewed and use safe, bounded dimensions.
- Blocking MUST not corrupt durable workflow truth.
- Suspicious provider cost growth requires kill switch and incident workflow.
- Abuse rules MUST distinguish user error from malicious behavior.
- Owner is Trust/Safety with API and Billing consultation.
- Acceptance requires abuse scenarios, false-positive review, and operator runbook.

## 35. Provider Configuration

- Configuration is versioned per operation and binding ID.
- It MUST include API version, endpoint class, credential handle, region, timeout class, rate class, and capability declarations.
- Startup MUST validate required fields and incompatible combinations without exposing secret values.
- Browser or query parameters MUST NOT select unrestricted production providers.
- Vocal、Music、MV provider choices remain TBD.
- Owner is Provider Integration/Configuration Platform.
- Acceptance requires change review, rollback, and version-compatibility tests.

## 36. Provider Request Serialization

- Each binding owns an explicit serializer from restricted internal request to provider schema.
- Serializer MUST be deterministic for the same binding version and semantic input.
- Reference Client transport summaries MUST NOT be used as production bodies.
- Unknown fields, unsafe defaults, and credential embedding are forbidden.
- Serialized payload logging is forbidden unless a separately approved redaction contract exists.
- Owner is Provider Adapter Maintainer.
- Acceptance requires golden provider-sanctioned fixtures without live secrets.

## 37. Provider Response Validation

- All synchronous, asynchronous, webhook, and lookup responses are untrusted input.
- Validators MUST enforce schema, bounds, status transitions, URL/reference policy, and safe error mapping.
- Unknown fields may be ignored only by explicit version policy.
- Raw provider response MUST NOT flow to Result, Issue, Audit, or browser.
- Invalid response becomes a safe failure or reconciliation item.
- Owner is Provider Adapter Maintainer/Security.
- Acceptance requires malformed, oversized, adversarial, and version-drift fixtures.

## 38. Provider Job Lookup

- Lookup uses protected provider job handles resolved server-side.
- Not-found MUST distinguish eventual consistency, expiry, wrong binding, deletion, and terminal absence through safe internal classes.
- Lookup MUST be idempotent and bounded by timeout/circuit policy.
- It MUST NOT trigger a new generation submit.
- Result mapping must pass terminal reconciliation before commit.
- Owner is Provider Integration; scheduling owner is Worker Platform.
- Acceptance requires not-found evolution and credential-rotation tests.

## 39. Provider Polling

- Production polling SHOULD be worker/scheduler owned; browser poll is a query trigger, not the sole progress engine.
- Poll cadence, jitter, max age, and budget remain TBD per provider contract.
- Claims prevent concurrent duplicate polls while allowing lease takeover.
- Late polls cannot overwrite terminal state.
- Poll errors map to retryable, reconciliation, or terminal classes.
- Owner is Worker Platform with Provider Integration policy.
- Acceptance requires budget, overlap, lease expiry, and terminal-race tests.

## 40. Webhooks

- Webhook support is per provider binding and remains optional until verified.
- Endpoint MUST verify signature, timestamp, replay protection, binding, and payload schema before processing.
- Inbox deduplication MUST precede state transition.
- Out-of-order and late events pass revision/terminal reconciliation.
- Webhook MUST NOT be the sole source of truth without an approved provider guarantee and repair path.
- Owner is Provider Integration/API Platform.
- Acceptance requires replay, forged signature, delay, reordering, and missing-event tests.

## 41. Scheduler

- Scheduler discovers due upload and generation work from durable truth or an outbox-backed queue.
- It MUST use distributed claims, bounded batches, fairness, jitter, and backpressure.
- Restart MUST not lose due work; duplicate delivery MUST be safe.
- Scheduler health and oldest-due age require safe metrics.
- Product/technology selection remains TBD.
- Owner is Worker Platform/SRE.
- Acceptance requires restart, partition, backlog, and multi-worker tests.

## 42. Reconciliation

- Reconciliation covers provider acceptance unknown, lookup not-found, DB commit unknown, partial ingestion, final conflict, missing webhook, expired URL, credential rotation, region migration, and deletion race.
- Cases are classified automatic, operator-assisted, manual repair, or terminal failure.
- Reconciler MUST read durable claims and journals, then apply idempotent CAS transitions.
- It MUST not guess operation, terminal state, ownership, or provider outcome.
- Age/budget thresholds remain TBD and require alert ownership.
- Owner is Workflow Reliability/SRE.
- Acceptance requires injected unknown outcomes for every classified case.

## 43. Manual Repair

- Manual repair is a controlled command surface, not direct database editing.
- It requires authenticated operator identity, scoped authorization, reason code, preview, approval policy, and immutable audit.
- Commands MUST be idempotent and use the same revision/transaction rules as automation.
- Sensitive values MUST be masked and unavailable unless separately authorized.
- Repair outcomes include no-op, reconciled, deferred, terminal-safe failure.
- Owner is Operations with domain owner approval.
- Acceptance requires runbook drills and denied-action tests.

## 44. Timeout Policy

- Timeouts are stage-specific for HTTP admission, provider submit, lookup, download, persistence, and delivery.
- A timeout is not proof of provider failure.
- Unknown external outcome enters reconciliation and retains claim ownership.
- Timeout values remain TBD from provider contracts and load evidence.
- Deadline propagation MUST not expose raw provider details.
- Owner is each domain owner with SRE review.
- Acceptance requires timeout injection before and after external acceptance.

## 45. Retry Policy

- Retry classification MUST be explicit: safe, conditionally safe after lookup, not safe, or terminal.
- Submit retries require idempotent provider support or proven non-acceptance.
- Poll/read retries use bounded exponential backoff and jitter.
- Retry budgets are independent from browser retries and remain TBD.
- Exhaustion creates reconciliation or terminal-safe outcome, never silent abandonment.
- Owner is Provider Integration/Workflow Reliability.
- Acceptance requires duplicate and unknown-outcome evidence.

## 46. Circuit Breakers

- Breakers SHOULD isolate provider binding, operation, region, and dependency class without high-cardinality keys.
- Opening a breaker stops new risky side effects while permitting safe lookup/reconciliation where possible.
- State MUST be shared or coherently approximated across instances.
- Half-open probes require bounded ownership.
- Thresholds remain TBD from observed behavior.
- Owner is SRE/Provider Integration.
- Acceptance requires failure-storm and recovery tests.

## 47. Backpressure

- Admission MUST consider queue depth, worker capacity, provider limits, storage health, and billing entitlement.
- Backpressure responses MUST be safe, retry-aware, and idempotency-preserving.
- Accepted work MUST not be dropped because downstream capacity changes.
- Per-tenant fairness and starvation policy require product approval.
- Capacity thresholds remain TBD.
- Owner is Worker Platform/SRE.
- Acceptance requires saturation tests without duplicate side effects.

## 48. Concurrency Control

- Commands sharing a workflow aggregate MUST coordinate through revision/CAS and scoped claims.
- Start, poll, resume, cancel, reconciliation, and finalization races MUST have deterministic winners.
- Lock scope MUST avoid holding locks over external I/O.
- Stale workers MUST be unable to commit after lease loss.
- Multi-tab browser requests are treated as ordinary duplicates.
- Owner is Workflow Platform/Data Platform.
- Acceptance requires a cross-command race matrix on multiple instances.

## 49. Lease／Claim

- Claims define owner token, safe namespace, aggregate, revision, acquired time, and expiry class.
- Lease duration and renewal policy remain TBD per task behavior.
- Expiry permits takeover only after fencing stale commits.
- Claim values MUST not expose idempotency keys, tenant raw values, or provider references.
- Abandoned claims are reconciled, not blindly reset.
- Owner is Worker Platform/Data Platform.
- Acceptance requires crash, pause, clock-skew, renewal, and takeover tests.

## 50. CAS／Revision

- Every mutable aggregate with competing writers MUST carry a monotonic revision or equivalent fencing token.
- Updates state expected revision and permitted transition.
- Conflict produces reread/reconcile, not unconditional overwrite.
- Terminal transitions are absorbing except explicitly versioned repair transitions.
- Revision values are safe metadata but SHOULD remain internal.
- Owner is Data Platform with domain transition owner.
- Acceptance requires stale-response and late-terminal prevention tests.

## 51. Outbox／Inbox

- Domain state and outbox event MUST commit atomically.
- Delivery is at-least-once; consumers MUST deduplicate using a protected event identity.
- Webhook/provider events enter a validated inbox before domain processing.
- Event schemas are versioned and exclude restricted content by default.
- Retention and replay windows remain TBD.
- Owner is Messaging Platform/Data Platform.
- Acceptance requires crash between commit/delivery and duplicate/reorder tests.

## 52. Asset Resolution

- Resolver maps logical asset references to authorized internal access capabilities.
- It MUST validate owner, tenant, region, lifecycle, MIME expectations, and deletion state.
- Resolution MUST not expose storage locator to Workflow Result or ordinary UI state.
- Expired provider URLs trigger rematerialization/reconciliation only when policy permits.
- Reference Asset Store remains a test implementation.
- Owner is Asset Platform.
- Acceptance requires cross-owner denial and expired-reference recovery tests.

## 53. Provider Upload

- Upload is a distinct external side effect with acceptance, pending, terminal, and unknown states.
- It MUST use durable acceptance and upload idempotency claims.
- Credential and signed URL lifetime MUST be validated before transfer.
- Resume MUST not recreate accepted work without proof.
- Provider-specific multipart/resume support remains binding-specific TBD.
- Owner is Provider Upload Platform/Provider Integration.
- Acceptance requires interruption, duplicate, expiry, and resume tests.

## 54. Materialization

- Materializer converts logical access capabilities into provider-usable input under restricted handling.
- Current signed-url support means Reference Gate ready under Decision A only.
- It does not prove that a selected production provider accepts signed URLs.
- If a production provider lacks the capability, a separate Provider-direct capability Contract is required.
- Materialization claims, expiry, and cleanup MUST be durable and idempotent.
- Owner is Asset Platform/Materializer.
- Acceptance requires chosen-provider input compatibility evidence.

## 55. Output Ingestion

- Provider outputs MUST be validated, acquired, scanned as required, stored, and registered as logical assets.
- Ingestion MUST separate download, validation, storage write, metadata commit, and final result commit.
- Partial output and duplicate ingestion use durable claims and reconciliation.
- Provider output references and signed URLs MUST not escape into Result DTOs.
- Malware/content policy remains TBD by product and security.
- Owner is Asset Platform/Output Ingestion.
- Acceptance requires partial, corrupt, expired, duplicate, and multi-output tests.

## 56. Asset Delivery

- Production requires a separate authenticated preview/download API.
- It MUST authorize owner, tenant, region, deletion, legal hold, and entitlement before issuing delivery.
- Delivery may use short-lived signed URLs behind server authorization; policy is TBD.
- MIME, range requests, expiry, revocation, caching, CDN, scan status, watermark, and audit MUST be defined.
- Workflow Result MUST continue returning logical Asset DTOs, never storage locators or signed URLs.
- Owner is Asset Platform/Edge Platform.
- Acceptance requires unauthorized, revoked, expired, range, cache, and deletion tests.

## 57. Retention

- Retention is defined per Store and data classification, not as one workflow-wide number.
- Durations are TBD pending legal, privacy, support, provider, and billing requirements.
- Active workflow, dispute, legal hold, and reconciliation can alter deletion eligibility.
- Expiry of access capability and deletion of data are distinct events.
- Retention jobs MUST be idempotent and audited with safe identifiers.
- Owner is Data Governance with domain owners.
- Production is blocked until required rows have approved policies.

## 58. Deletion

- Deletion is an orchestrated lifecycle covering records, assets, references, caches, indexes, provider copies where possible, and backups policy.
- User deletion, account deletion, retention expiry, operator purge, and legal requests are distinct triggers.
- Tombstones may be needed to prevent resurrection and replay.
- Deletion races with poll, reconciliation, delivery, and billing MUST be resolved explicitly.
- Deletion SLA remains TBD.
- Owner is Privacy/Data Lifecycle.
- Acceptance requires end-to-end deletion and non-resurrection tests.

## 59. Legal Hold

- Legal hold can suspend deletion without granting workflow execution or delivery access.
- Hold lookup MUST be authoritative, audited, region-aware, and minimally disclosed.
- Commands MUST define behavior when hold status changes mid-workflow.
- Browser and provider requests MUST not receive hold details beyond safe user messaging.
- Jurisdiction and process remain TBD.
- Owner is Legal/Data Governance.
- Acceptance requires hold/deletion race and access-separation tests.

## 60. Region／Residency

- Every durable record, asset, credential handle, worker claim, and delivery path requires a region owner.
- Region selection MUST derive from trusted principal/tenant policy, not client override.
- Cross-region replication and failover must respect residency constraints.
- Provider region support and data transfer terms remain TBD.
- Region migration is a controlled workflow with reconciliation and audit.
- Owner is Residency Architecture/Legal.
- Acceptance requires region-denial and failover-policy verification.

## 61. Tenant Isolation

- Tenant identity is projected from trusted authentication and membership state.
- Every lookup and mutation MUST enforce tenant alongside ownership and region.
- Protected indexes and cache keys MUST include isolation scope.
- Raw tenant values MUST not become logs or metrics dimensions.
- Shared provider credentials require explicit isolation and cost-attribution policy.
- Owner is Authorization/Data Platform.
- Acceptance requires systematic cross-tenant negative tests.

## 62. Encryption

- Transport encryption is mandatory for browser, service, provider, database, queue, and asset paths.
- Restricted inputs, credentials, provider references, and sensitive indexes require approved encryption at rest.
- Key scope SHOULD align with environment, region, and classification.
- Encryption MUST not replace authorization, deletion, or redaction.
- Algorithms and services remain Security-owned TBD.
- Owner is Security/KMS Platform.
- Acceptance requires configuration audit and key-access denial tests.

## 63. Key Rotation

- Rotation covers encryption keys, signing keys, session keys, CSRF secrets, provider credentials, and delivery signing keys.
- Records and tokens MUST carry safe key-version metadata where required.
- Old/new versions require bounded overlap and revocation behavior.
- Jobs active during rotation MUST either continue safely or enter reconciliation.
- Emergency rotation requires a rehearsed compromise runbook.
- Owner is Security/Secrets Platform.
- Acceptance requires routine and emergency rotation drills.

## 64. Secrets Handling

- Secrets are retrieved through approved handles and least-privilege workload identity.
- Secrets MUST NOT be placed in source, package metadata, client bundles, query strings, Result, Audit payload, or logs.
- Raw exceptions and provider SDK diagnostics require sanitization.
- Developer fixtures MUST be unmistakably non-production.
- Secret scanning runs in CI and release gates.
- Owner is Security/Developer Platform.
- Acceptance requires artifact, bundle, DOM, log, and error scans.

## 65. Logging

- Logs use bounded safe dimensions: operation, stage, status class, provider class, duration class, retry class, region class, safe reason code.
- Forbidden: Reference, Asset ID, raw tenant, Story, Lyrics, Scene, Prompt, Credential, provider output reference, fingerprint, idempotency key, raw error.
- Message templates MUST avoid interpolating untrusted values.
- Sampling and retention are TBD and classification-aware.
- Correlation uses non-sensitive bounded handles under approved access.
- Owner is Observability/Security.
- Acceptance requires automated sensitive-value and cardinality audits.

## 66. Audit

- Audit captures security and operator actions, policy decisions, configuration changes, and repair commands.
- Audit is not an unrestricted copy of requests, sessions, provider responses, or workflow payloads.
- Events require actor class, action, outcome class, time, policy version, and safe aggregate handle.
- Immutability, access, retention, export, and legal hold policy remain TBD.
- Outbox delivery MUST preserve event order where domain semantics require it.
- Owner is Security Audit/Data Governance.
- Acceptance requires completeness and forbidden-field tests.

## 67. Metrics

- Metrics use low-cardinality dimensions only.
- Required families include admission, stage outcome, latency class, retries, claims, backlog, reconciliation age, delivery, and billing discrepancy.
- Raw identifiers and dynamic provider errors are forbidden labels.
- Histograms and buckets remain TBD from measurements.
- Metrics MUST distinguish Reference, staging, canary, and production environments safely.
- Owner is SRE/Observability.
- Acceptance requires cardinality budget review and dashboard validation.

## 68. Tracing

- Tracing propagates approved correlation context across API, worker, store, provider, ingestion, and delivery.
- Spans MUST omit restricted inputs, credentials, references, asset IDs, raw errors, and idempotency data.
- Provider headers are allowlisted, not copied wholesale.
- Sampling policy remains TBD and must preserve incident usefulness without data leakage.
- Trace access is least-privilege and audited.
- Owner is Observability/Security.
- Acceptance requires trace-content inspection across success and failure paths.

## 69. Alerting

- Alerts cover availability, backlog, reconciliation age, unknown outcomes, terminal conflicts, auth failures, leakage signals, billing discrepancies, and delivery failures.
- Alerts use safe aggregate dimensions and link to runbooks, not sensitive payloads.
- Severity, thresholds, paging windows, and ownership remain TBD.
- Every page requires an actionable operator response or it must be redesigned.
- Provider incidents must be distinguishable from platform incidents.
- Owner is SRE with domain on-call owners.
- Acceptance requires alert fire/recovery exercises.

## 70. SLO／SLA

- Candidate SLOs: API availability, Start latency, Poll latency, provider acceptance latency, terminal completion latency, reconciliation age, webhook delay, ingestion success, cancellation acknowledgement, result query availability, asset delivery availability.
- No numerical objective is established by this Contract; all values are TBD.
- Provider-dependent and platform-controlled objectives MUST be separated.
- SLI definitions, windows, exclusions, error budgets, and ownership require approval.
- SLA commitments require legal/product approval after measured SLO capability.
- Owner is SRE/Product.
- Production launch is blocked where required objectives and measurement are undefined.

## 71. Cost／Billing

- Billing stages are preflight estimate, reservation, provider accepted, provider completed, output ingested, partial, cancel, unknown, duplicate, retry, refund, and dispute.
- Billing identity MUST be separate from workflow idempotency identity.
- Provider acceptance unknown MUST produce a financial reconciliation state.
- Duplicate technical delivery MUST not duplicate charge.
- Pricing, currency, tax, reservation, and refund policy remain TBD.
- Owner is Billing Platform/Product/Finance.
- Acceptance requires ledger/workflow/provider reconciliation tests.

## 72. Quotas

- Quotas may cover concurrent workflows, provider cost, storage, delivery bandwidth, polling, and operation-specific usage.
- Enforcement MUST be distributed, tenant-aware, and race-safe.
- Reservation and release MUST align with billing and terminal lifecycle.
- Quota numbers and plan mapping remain TBD.
- Exceeded quota returns safe user-facing guidance without internal balances not intended for display.
- Owner is Billing/Entitlements Platform.
- Acceptance requires concurrent reservation and rollback tests.

## 73. Cleanup

- Cleanup covers expired claims, stale leases, temporary materializations, provider staging objects, orphan assets, inbox/outbox, browser references, and caches.
- Cleanup MUST be idempotent and respect active work, retention, deletion, disputes, and legal hold.
- Cleanup failure must be observable and repairable.
- It MUST not convert an unknown external outcome into permission to resubmit.
- Cadence and age thresholds remain TBD.
- Owner is Data/Asset Lifecycle with SRE.
- Acceptance requires orphan creation and recovery drills.

## 74. Cancellation Semantics

- `Workflow state cancelled`, `Provider cancel requested`, `Provider cancel confirmed`, `Asset cleanup complete`, `Storage deletion complete`, `Billing reversal complete`, and `Refund complete` are distinct states.
- One `cancelled` flag MUST NOT imply all downstream effects completed.
- Cancel command is idempotent and competes through revision/CAS with poll, finalization, and repair.
- Provider non-cancellability or late completion requires explicit reconciliation and user messaging.
- Cancellation authorization is re-evaluated at command time.
- Owner is Workflow Platform with Provider, Asset, Billing owners.
- Acceptance requires every cancel/terminal race and replay scenario.

## 75. Refund Semantics

- Refund is a billing workflow separate from technical cancellation.
- Eligibility depends on reservation, provider charge, usable output, policy, dispute, and unknown outcomes.
- Refund request, approved, submitted, settled, failed, and disputed are separate durable states.
- Technical retries MUST not duplicate refund.
- Policy and timing remain TBD.
- Owner is Billing Product/Finance.
- Acceptance requires provider/billing mismatch and duplicate-event tests.

## 76. Failure Taxonomy

- Failures classify validation, authentication, authorization, quota, conflict, dependency unavailable, timeout unknown, provider rejected, provider terminal, ingestion, reconciliation, cancellation, deletion, and internal invariant.
- Each class defines retryability, user exposure, audit, alert, and owner.
- Raw provider or exception strings MUST not become taxonomy values.
- Unknown is a first-class operational state, not generic failure.
- Safe reason codes are versioned and bounded.
- Owner is Workflow Reliability/Security.
- Acceptance requires mapping coverage for all external and transaction stages.

## 77. User-facing Errors

- UI receives stable safe codes, localized message key, retry affordance, and support path where appropriate.
- Errors MUST not expose references, asset IDs, tenant values, provider references, credentials, payloads, fingerprints, keys, or raw errors.
- Authentication and authorization errors resist enumeration.
- Unknown outcomes explain pending verification without encouraging duplicate start.
- Copy and localization remain Product-owned TBD.
- Owner is Web Product/API Contract.
- Acceptance requires snapshot/content security review across failure taxonomy.

## 78. Production Capability

- Production capability is a server-owned, authenticated, versioned policy decision.
- It MUST validate environment, deployment approval, operation binding, dependency health class, and kill switches.
- Query, browser env, local storage, client body, or developer route MUST NOT enable it.
- Capability response to browser reveals only safe product availability.
- Reference capability env remains test-only.
- Owner is API Platform/Release Management.
- Acceptance requires override denial and production hard-deny regression tests.

## 79. Feature Flags

- Flags may gate operation, provider binding, region, tenant cohort, UI surface, webhook, scheduler, and Asset Delivery.
- Security and authorization controls MUST NOT rely solely on flags.
- Flag evaluation is server-owned for side-effecting capabilities.
- Changes require audit, owner, expiry/review date, rollback, and dependency validation.
- Client-visible flags are safe projections only.
- Owner is Release Management/Product.
- Acceptance requires stale-cache, rollback, and unauthorized-override tests.

## 80. Production UI

- Production UI MUST be implemented separately from developer fixture and HTTP panels.
- It requires authenticated session, production capability, validated product inputs, resumable workflow, progress, safe errors, cancellation semantics, Asset Delivery, privacy, billing/cost, and support.
- Developer fixtures, fixed auth, Reference CSRF, and canonical transport summaries are forbidden dependencies.
- Product state MUST reconcile with server truth after reload, reconnect, and late response.
- Accessibility and sensitive DOM non-exposure remain inherited acceptance criteria.
- Owner is Web Product/Web Platform.
- Acceptance requires authenticated staging browser E2E for enabled operations.

## 81. Browser Session Recovery

- Recovery uses safe Session V2 with a defined browser storage adapter and expiry.
- It MUST handle logout, revocation, account switch, tenant switch, multi-tab, private browsing, storage unavailable, XSS impact, reference rotation, and result query.
- It MUST NOT store Story, Lyrics, Scene, Start DTO, Asset lists, Cookie, CSRF, idempotency key, fingerprint, credential, or provider reference.
- Server query and authorization determine current truth; cached terminal status is not authoritative.
- Multi-tab commands use normal API idempotency and revision rules.
- Owner is Web Platform/Identity/Security.
- Acceptance requires recovery matrix tests across reload and identity changes.

### 81.1 Approved Session V2 Browser Adapter Policy

- The approved persistence mechanism is `sessionStorage`: it survives same-tab reload, remains tab-scoped, and is not a durable workflow database or cross-browser history mechanism.
- Persistent recovery requires a caller-supplied authenticated-session-scoped opaque identity partition. The partition is not a credential, token, or raw user/account/tenant ID; it selects a namespaced storage key and is not serialized into the Session V2 body.
- Anonymous or unauthenticated composition does not enable persistent browser recovery. Logout, login, account switch, tenant switch, and identity-partition change invalidate the old adapter and rotate the opaque partition; cleanup is best effort and never grants or revokes server authorization.
- The adapter owns only tab-local deterministic read, write, delete, exact schema validation, partition namespacing, and expiry validation. Cross-tab authentication lifecycle notification belongs to product composition, while authorization, idempotency, revision/conflict, workflow truth, and terminal truth remain server-owned. Browser locks, leases, `BroadcastChannel`, and storage-event coordination are not part of this adapter.
- Storage unavailability or read/write/delete failure fails closed for durable recovery but does not fail the active in-memory workflow. A write, read, or delete operation failure disables persistence for that adapter instance. Malformed, unsupported, migration-invalid, extra-key, or restricted-field records receive at most one best-effort cleanup attempt and are never partially accepted.
- Browser expiry uses the existing Session V2 `expiresAt`; `baselineTime >= expiresAt` is expired. The adapter does not invent or extend TTL. Every unexpired record remains an untrusted hint and recovery must use the existing authenticated server `queryResult` path; server authorization and reference truth win.
- The exact persisted semantic fields are `sessionVersion`, `operation`, `reference.referenceVersion`, `reference.kind`, `reference.reference`, `lastServerStatus`, `pollAttempts`, `createdAt`, and `expiresAt`.
- Access/refresh/session tokens, credentials, cookies, Authorization or CSRF material, idempotency keys, raw identity IDs, workflow inputs or user content, provider/upload payloads or credentials, asset lists or locators, signed URLs, billing/private-audit payloads, and raw errors/stacks are forbidden browser fields.
- Implementation evidence is `lib/workflowUi/referenceWorkflowBrowserSessionStore.ts` with deterministic coverage in `tests/workflowUi/referenceWorkflowBrowserSessionStore.test.ts`. This closes only the browser adapter contract; it does not establish Production UI, production API/auth, Asset Delivery, provider, or cloud readiness.

## 82. Asset Preview／Download

- Preview and download are separate authenticated delivery intents.
- MIME/content disposition, range support, expiry, watermark, scan state, caching, and CDN behavior are explicit per asset class.
- Signed delivery URL, if used, is short-lived, scoped, revocable by policy, and never persisted in Session V2.
- Download audit MUST use safe handles and bounded dimensions.
- UI MUST handle expired authorization by re-requesting server delivery capability.
- Owner is Asset Platform/Web Product.
- Acceptance requires browser, range, cache, expiry, and revoked-access tests.

## 83. Accessibility

- Production UI targets the organization-approved accessibility standard; exact conformance target is TBD.
- Keyboard access, focus order, status announcements, reduced motion, contrast, labels, errors, and cancel confirmation are required.
- Async progress MUST not trap focus or rely on color alone.
- Asset preview alternatives depend on media type and product policy.
- Reference panel evidence is reusable but not sufficient for product UI.
- Owner is Web Product/Accessibility.
- Acceptance requires automated and manual assistive-technology review.

## 84. Privacy

- Data inventory MUST classify original inputs, derived content, provider payloads, results, assets, identities, and operational metadata.
- Purpose limitation, consent/notice, access, correction, export, deletion, and provider sharing require policy.
- Browser, logs, analytics, support, and audit each need explicit minimization.
- Jurisdiction and privacy notice remain TBD.
- Reference Foundation’s non-exposure rules remain mandatory.
- Owner is Privacy/Legal/Product.
- Acceptance requires approved data-flow map and privacy review.

## 85. Compliance

- Applicable frameworks and jurisdictions remain TBD and MUST NOT be guessed.
- Controls may affect residency, audit, retention, deletion, access review, incident reporting, and vendor management.
- Provider contracts and subprocessors require review before real data use.
- Compliance evidence must map to implemented controls, not Reference assertions alone.
- Exceptions require accountable approval and expiry.
- Owner is Compliance/Legal/Security.
- Acceptance requires formal applicability decision and control mapping.

## 86. Deployment Topology

- Options considered: long-lived Node process, serverless functions, containers, Kubernetes, background workers, and queue system.
- Current `globalThis` runtime guarantees none of cross-instance durability, worker ownership, or rolling compatibility.
- Recommended direction is containerized stateless API plus durable worker services, managed database, queue, and external dependency container.
- Kubernetes versus another container platform, database, and queue remain TBD.
- Serverless may host stateless edges only if duration, connection, and worker constraints are satisfied.
- Owner is Platform Architecture/SRE.
- Acceptance requires topology ADR, threat model, cost model, and staging proof.

## 87. Serverless Constraints

- Serverless instances may freeze, restart, scale concurrently, limit duration, and discard memory.
- Process-local Stores, timers, leases, and `globalThis` identity cannot provide production correctness there.
- Background polling and drain require external scheduler/queue/worker ownership.
- Connection pooling, payload size, streaming, and regional execution require platform-specific validation.
- No serverless product is selected by this Contract.
- Owner is Platform Architecture.
- Acceptance requires constraint matrix if serverless remains in target topology.

## 88. Multi-process Constraints

- Multiple API/worker processes cannot share in-memory state or implicit locks.
- All claims, revisions, idempotency, sessions, CSRF, results, and references required for correctness MUST be externalized.
- Clock assumptions require bounded skew or database time.
- Cache invalidation cannot be correctness-critical without version validation.
- Duplicate delivery and stale workers are normal operating conditions.
- Owner is Platform/Data Architecture.
- Acceptance requires multi-process concurrency and restart suites.

## 89. Horizontal Scaling

- API scaling is stateless after external authentication/session and durable workflow dependencies.
- Worker scaling is bounded by claims, provider limits, quotas, and backpressure.
- Scaling MUST preserve tenant fairness and avoid provider thundering herds.
- Autoscaling signals use backlog and safe service metrics; thresholds remain TBD.
- Scale-down follows drain policy.
- Owner is SRE/Worker Platform.
- Acceptance requires scale-up/down load test without correctness regression.

## 90. Rolling Deployment

- Old and new versions may concurrently read/write shared records and events.
- API DTO, Store schema, fingerprints, provider bindings, capabilities, and Session versions require compatibility windows.
- Expand/migrate/contract is preferred for schemas.
- A version unable to safely process a claimed job MUST defer, not reinterpret it.
- Rollback MUST preserve records written by the newer compatible version.
- Owner is Release Engineering/Data Platform.
- Acceptance requires mixed-version staging tests.

## 91. Version Migration

- Versioned surfaces: API DTO, Workflow contract, Store schema, Result Reference, idempotency fingerprint, Provider binding, Materializer binding, Job record, restricted payload, browser Session, and capability.
- Migrations MUST define writer/reader compatibility, validation order, failure status, cleanup, and rollback.
- Direct casts across semantic major versions are forbidden.
- Unsupported records enter safe reconciliation or rejection; they are not guessed into new semantics.
- Sensitive migration failures return only safe reason codes.
- Owner is each schema owner coordinated by Release Engineering.
- Acceptance requires old/new fixture and production-like migration assertions.

## 92. Drain Policy

- Drain begins by stopping new command admission and new lease acquisition.
- In-flight API requests finish within bounded deadline or return idempotency-preserving outcomes.
- Workers checkpoint journal state, relinquish or expire leases safely, and prevent stale commits.
- Outbox delivery either completes or remains durable for another worker.
- Deadline and termination grace remain TBD by platform evidence.
- Owner is SRE/API/Worker Platform.
- Acceptance requires forced termination at every transaction stage.

## 93. Disaster Recovery

- DR scope includes durable records, references, restricted inputs, assets, keys, queues/outbox, configuration, and audit.
- Recovery point and recovery time objectives remain TBD; no numeric claim is made.
- Restoration MUST preserve revisions, idempotency claims, deletion/hold state, and region policy.
- Provider external state requires post-restore reconciliation.
- Failover MUST not enable duplicate submission.
- Owner is SRE/Data Platform/Security.
- Acceptance requires documented and executed recovery exercise.

## 94. Backup／Restore

- Backup policy is Store/classification-specific and encrypted with controlled key access.
- Restore tests MUST verify referential integrity among workflow, jobs, results, vault, assets, and outbox.
- Deleted data and legal holds require approved backup lifecycle handling.
- Backup retention and geography remain TBD.
- Restore access is audited and least-privilege.
- Owner is Data Platform/Data Governance.
- Acceptance requires periodic restore evidence and reconciliation after restore.

## 95. Testing Strategy

- Layers: pure unit, Store contract, transaction integration, provider sandbox, HTTP integration, browser E2E, multi-process, load, failure injection, security, and disaster recovery.
- Reference assertions remain mandatory regression coverage for stable boundaries.
- Store adapters MUST pass shared conformance plus implementation-specific failure tests.
- Real provider tests require sandbox/live-safe scopes and cost controls.
- Production quality MUST NOT be claimed from large Reference assertions alone.
- Owner is Quality Engineering with domain owners.
- Acceptance requires a traceable gate-to-test matrix.

## 96. Staging

- Staging MUST use production topology classes, durable adapters, production authentication class, and isolated provider credentials.
- Canonical fixtures may seed controlled tests but cannot replace real boundary validation.
- Data, keys, tenants, billing, and delivery endpoints are isolated from production.
- Staging must support restart, scaling, repair, webhook, scheduler, and restore exercises.
- Environment drift is measured and reviewed.
- Owner is SRE/Release Engineering.
- Acceptance requires complete phase gate evidence in staging.

## 97. Shadow Traffic

- Shadowing may validate safe read/serialization paths but MUST NOT duplicate provider side effects, billing, delivery, or restricted persistence.
- Payload use requires privacy and provider contractual approval.
- Sensitive values are minimized or synthesized.
- Shadow outcomes cannot alter production state.
- Sampling and duration remain TBD.
- Owner is Release Engineering/Privacy.
- Acceptance requires a no-side-effect proof and rollback control.

## 98. Canary

- Canary enables a bounded operation/provider/region/cohort through server-owned capability.
- It requires separate metrics, alerts, cost guardrails, kill switch, and rollback.
- Durable records remain compatible with non-canary instances.
- Unknown outcomes are reconciled before expansion.
- Cohort size and duration remain TBD.
- Owner is Release Management/SRE/Product.
- Acceptance requires stable canary and explicit expansion approval.

## 99. Load Testing

- Load tests cover admission, idempotency conflicts, polling, scheduler backlog, Stores, workers, ingestion, result query, cancellation, and Asset Delivery.
- Tests MUST include multi-tenant fairness, provider throttling, and scale-down drain.
- Restricted production data and live provider cost are prohibited without approval.
- Targets derive from approved capacity/SLO assumptions and remain TBD.
- Correctness under load is evaluated alongside latency.
- Owner is Performance Engineering/SRE.
- Acceptance requires no duplicate side effects or terminal corruption at target load.

## 100. Security Testing

- Scope includes auth/session, authorization, CSRF, CORS, proxy trust, injection, SSRF, signed URLs, webhook signatures, asset delivery, secrets, logs, and operator repair.
- Cross-tenant and enumeration testing are mandatory.
- Provider responses and media are treated as hostile inputs.
- Dependency and artifact scanning complement, not replace, manual review.
- Findings require severity, owner, remediation, and launch disposition.
- Owner is Product Security.
- Acceptance requires no unresolved launch-blocking finding.

## 101. Chaos Testing

- Inject process kill, network timeout, database ambiguity, queue duplication, lease expiry, provider delay, webhook reorder, credential rotation, and storage partial failure.
- Experiments begin in isolated environments with cost and data guardrails.
- Expected invariants: no blind resubmit, no terminal overwrite, no unauthorized delivery, no lost durable work.
- Unexpected outcomes create Contract/test changes before expansion.
- Frequency and blast radius remain TBD.
- Owner is SRE/Workflow Reliability.
- Acceptance requires rehearsed critical experiments and runbooks.

## 102. Migration Phases

| Phase | Scope | Entry criterion | Exit criterion | Accountable owner | Stop condition |
|---|---|---|---|---|---|
| 0 | Gap Contract | Reference complete | this Contract approved | Architecture | unresolved boundary |
| 1 | Production Interfaces | approved Contract | adapters/interfaces and conformance plan | Architecture | Reference semantics regression |
| 2 | Durable Stores | interfaces fixed | transactions and multi-process tests pass | Data Platform | durability/idempotency gap |
| 3 | Production Auth／CSRF | identity choice approved | session/authz/CSRF staging pass | Identity/Security | fixture dependency |
| 4 | Provider Credentials／Configuration | vault chosen | rotation/config gates pass | Security/Provider | secret leakage |
| 5 | Real Provider Adapter | one binding approved | provider sandbox/staging matrix passes | Provider Integration | unknown resubmit risk |
| 6 | Scheduler／Webhook／Reconciliation | durable jobs ready | crash/replay/repair gates pass | Worker Platform | terminal overwrite risk |
| 7 | Asset Delivery | logical assets durable | authorized delivery gates pass | Asset Platform | locator exposure |
| 8 | Production Capability | dependencies ready | server-owned gate/kill switch pass | Release Management | client override |
| 9 | Production UI | API/delivery ready | product browser E2E passes | Web Product | developer fixture use |
| 10 | Staging／Canary | all component gates | canary approval | SRE/Product | blocking SLO/security gap |
| 11 | Production Launch | canary stable | launch review approves | Production Readiness | any section 104 condition |

- Critical path: Durable Runtime Interfaces → Durable Stores／Transactions → Production Auth → Provider Credential Vault → one operation real Provider → Job／Reconciliation → Asset Delivery → Production UI.
- First operation compares Vocal simplicity, Music asset/cost behavior, and MV multi-asset/long-job complexity; selection remains TBD.
- No later phase may compensate for an unmet earlier correctness gate.

## 103. Acceptance Gates

- G1: Reference regression suite remains green for preserved semantics.
- G2: Runtime composition is external, versioned, health-checked, and drain-safe.
- G3: Every production Store row has an approved adapter, owner, lifecycle, and conformance evidence.
- G4: Cross-instance idempotency, claim, revision, transaction, and reconciliation tests pass.
- G5: Production authentication, authorization, session, CSRF, proxy, rate, and abuse controls pass security review.
- G6: One selected operation/provider binding passes credentials, request, response, job, retry, cancel, cost, and output tests.
- G7: Scheduler/webhook strategy, reconciliation, manual repair, and on-call runbooks are exercised.
- G8: Asset ingestion/delivery, privacy, deletion, retention, region, and legal policies are approved.
- G9: Production UI uses no developer fixtures and passes recovery, accessibility, privacy, billing, and browser E2E.
- G10: Observability, SLO measurement, staging, load, security, chaos, restore, canary, and rollback evidence is approved.

## 104. Stop Conditions

- Stop if durable transaction boundaries are not established.
- Stop if cross-instance idempotency is not established.
- Stop if ownership authorization is not established.
- Stop if any credential secret reaches Result, log, trace, Audit payload, Issue, Reference, DOM, or browser state.
- Stop if provider acceptance unknown can cause automatic resubmit.
- Stop if late or stale work can overwrite terminal state.
- Stop if Reference possession alone authorizes any command.
- Stop if retention, deletion, region, or recovery owner is unknown for production-used data.
- Stop if billing unknown outcome or refund responsibility is undefined.
- Stop if webhook signature/replay protection is absent where webhooks are enabled.
- Stop if no controlled manual repair path exists for classified repairable states.
- Stop if multi-region ownership is unclear for an enabled region.
- Stop if production capability can be enabled by query, env exposed to client, local storage, or request body.
- Stop if Asset Delivery lacks server-side authorization.
- Stop if Production UI consumes developer fixtures, fixed auth, Reference CSRF, or developer routes.
- Stop if process-local Store or `globalThis` runtime is described or relied upon as production durability.
- Stop if required SLO measurement, incident response, rollback, or kill switch is absent.
- Stop if any applicable acceptance gate lacks accountable approval and evidence.

## 105. Open Questions

- Which production deployment topology is approved?
- Which durable database and transaction model are approved?
- Which queue/scheduler products are approved?
- Which authentication/session provider is approved?
- Which primary provider is selected for Vocal, Music, and MV?
- Which operation is the first production operation?
- Do selected providers accept signed URL inputs under the required policy?
- Is progress driven by webhook, scheduler poll, or hybrid per binding?
- What region/residency strategy and failover policy apply?
- What retention durations apply per Store and asset class?
- What deletion SLA and backup deletion policy apply?
- What billing, reservation, cost display, and dispute model apply?
- What cancellation-to-refund policy applies per provider outcome?
- Which Asset Delivery/CDN architecture and URL policy apply?
- What numerical SLOs, windows, and error budgets are approved?
- Who owns 24/7 support, manual repair, and provider escalation?
- What incident response, breach notification, and compromise process applies?
- Which privacy/compliance jurisdictions and vendor terms apply?
- Until answered and approved for the selected launch scope, dependent readiness cells remain blocked.

## 106. Final Readiness Matrix

| Area | Reference complete | Production design complete | Production implementation complete | Staging validated | Production ready | Blocking dependency | Next owner |
|---|---:|---:|---:|---:|---:|---|---|
| Runtime | Yes | Partial | No | No | No | topology ADR | Platform Architecture |
| Persistence | Yes | Partial | No | No | No | database/lifecycle | Data Platform |
| Transactions | Process-local | Contracted | No | No | No | durable CAS/outbox | Workflow Platform |
| Idempotency | Reference yes | Contracted | No | No | No | cross-instance Store | Data Platform |
| Auth | Fixture yes | Partial | No | No | No | auth provider | Identity |
| Authorization | Reference boundary | Partial | No | No | No | policy service | Security |
| CSRF | Fixture yes | Partial | No | No | No | session-bound Store | Security/Web |
| Provider | Reference yes | Partial | No | No | No | provider selection | Provider Integration |
| Credential | N/A | Partial | No | No | No | vault/KMS | Security |
| Upload | Yes | Partial | No | No | No | durable acceptance | Upload Platform |
| Poll | Yes | Partial | No | No | No | scheduler/lease | Worker Platform |
| Jobs | Yes | Partial | No | No | No | durable job Store | Worker Platform |
| Reconciliation | Reference paths | Partial | No | No | No | reconciler/repair | Reliability |
| Ingestion | Yes | Partial | No | No | No | durable asset Store | Asset Platform |
| Asset Delivery | No | Partial | No | No | No | authenticated API/CDN | Asset Platform |
| UI | Developer complete | Partial | No | No | No | product UI/recovery | Web Product |
| Observability | Reference diagnostics | Partial | No | No | No | safe telemetry/SLO | SRE |
| Billing | No | Partial | No | No | No | billing model/ledger | Billing Product |
| Retention | No | Partial | No | No | No | approved durations | Data Governance |
| Compliance | No | Partial | No | No | No | jurisdiction/control map | Compliance |
| Deployment | Reference process | Partial | No | No | No | platform decision | Platform/SRE |
| Operations | Reference tests | Partial | No | No | No | runbooks/on-call/DR | SRE |

- Current conclusion: Reference Foundation is complete within its declared scope.
- Current conclusion: Production開始は不可である。
- Real Provider Ready and Production UI Ready are both unestablished.
- First implementation foundation is Production Interfaces followed by Durable Stores/Transactions.
- Launch authority belongs to Production Readiness Review after all selected-scope blockers are closed.
- This matrix MUST be updated by evidence, never by inferred completion.
