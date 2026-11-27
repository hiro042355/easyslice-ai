# Publication operations and failure recovery

Status (2026-11-27): the durable publication inbox, the TikTok admission
migration, the Core↔Adapter handoff contract, the Core-side execution path
(API route → service → signed HTTP → adapter) and the adapter-side OAuth
callback host are implemented. They pass their suites locally, including a
two-process loopback run in which Core and the adapter are separate OS
processes talking over HTTP.

Nothing here is deployed. No real TikTok account, OAuth flow, post, Staging
database or cloud resource was touched; see *Unresolved*.

This document is split across two pull requests: the provider-neutral
foundation (PR-F, `feature/publication-foundation`) and the TikTok integration
(PR-T, based on PR-F). PR #15 is untouched by this work.

## Components

| Item | Path | Repo |
| :--- | :--- | :--- |
| Intent + event log | `db/workflow/migrations/V000026__add_publication_intent_records.sql` | Core |
| Upload session + chunks | `db/workflow/migrations/V000027__add_publication_upload_lifecycle.sql` | Core |
| Simulation vs. remote verification | `db/workflow/migrations/V000028__separate_simulation_from_remote_verification.sql` | Core |
| TikTok admission | `db/workflow/migrations/V000035__admit_tiktok_publication_intents.sql` | Core |
| Repository | `lib/publicationRecords/repository.ts`, `lib/publicationUploads/repository.ts` | Core |
| Boundary contract | `lib/publicationBoundary/contracts.ts` | Core |
| Principal bridge | `lib/publicationIntegration/principal.ts` | Core |
| Asset admission | `lib/publicationIntegration/assetAdmission.ts` | Core |
| Digest/revision attestation | `lib/publicationIntegration/grant.ts` | Core |
| Observation intake | `lib/publicationIntegration/observation.ts` | Core |
| Execution path | `app/api/v1/publications/tiktok/route.ts` → `lib/server/tiktokPublication/runtime.ts` → `lib/tiktokPublication/execution.ts` | Core |
| Observation endpoint | `app/api/v1/publications/tiktok/observations/route.ts` → `lib/tiktokPublication/observationBoundary.ts` → `observationApplication.ts` | Core |
| Publication status API | `app/api/v1/publications/[publicationId]/route.ts` | Core |
| Migration head repair | `db/workflow/migrations/V000036__repair_workflow_schema_metadata_head.sql` | Core |
| Canonical JSON + HMAC | `lib/publicationIntegration/canonicalJson.ts` | Core |
| Grant verification | `src/tiktok/publication/PublicationGrantVerifier.ts` | Adapter |
| Core→adapter transport | `lib/publicationIntegration/adapterTransport.ts` | Core |
| Publish / reconcile | `src/tiktok/publication/TikTokPublicationService.ts` | Adapter |
| Publication request endpoint | `src/tiktok/publication/PublicationRequestEndpoint.ts` | Adapter |
| OAuth callback host | `src/tiktok/real/oauth/TikTokOAuthCallbackHost.ts` | Adapter |

## Responsibility split

Core owns intent creation, asset selection and ownership, revision and digest
management, publication state, idempotency keys, result persistence and
platform-specific records. Core holds **no** TikTok credential, client secret or
OAuth token.

The adapter owns TikTok OAuth, token storage (`EncryptedTokenVault`,
AES-256-GCM), refresh and rotation, TikTok API calls, posting, result reporting,
provider error classification and retryability. It resolves its own account
binding; a Core grant never carries an account identity.

## Handoff contract

A Core→adapter handoff is a short-lived signed grant, not a credential:

```
publication-grant-v1.<b64url(canonicalClaims)>.<b64url(HMAC-SHA256)>
```

- Claims bind publication id, owner, platform, content format, asset revision
  and asset digest, audience `tiktok-publisher`, and issue/expiry times.
- TTL default 10 min, hard maximum 30 min, clock skew allowance 30 s.
- Digests are 64 lowercase hex characters; canonical JSON is key-sorted with no
  whitespace, so both sides compute the same bytes.
- Both verifiers enforce an exact key allowlist on the top level and on the
  `asset` object; an extra field is rejected as `MALFORMED` rather than ignored.
- Reject codes: `EXPIRED`, `NOT_YET_VALID`, `AUDIENCE_MISMATCH`,
  `PLATFORM_MISMATCH`, `CONTENT_FORMAT_INVALID`, `UNKNOWN_KEY`,
  `INVALID_SIGNATURE`, `MALFORMED`, `TTL_OUT_OF_RANGE`.
- The two implementations are independent (the adapter does not import Core).
  They are kept honest by one shared 12-vector fixture, copied to
  `tests/publicationIntegration/vectors/publicationGrantVectors.json` (Core) and
  `src/tiktok/publication/__tests__/fixtures/publicationGrantVectors.json`
  (adapter). **Changing the spec means changing the fixture in both repos.**

## Core→adapter transport

`POST /publications/tiktok` with body `{"grant":"<token>"}`. The request is
signed, not the grant alone:

```
<version>\nPOST\n/publications/tiktok\n<timestampMs>\n<sha256hex(body)>
```

sent as `x-nexcut-transport-key-id`, `x-nexcut-transport-timestamp` and
`x-nexcut-transport-signature` (HMAC-SHA256, base64url). Accepted rules:

- Missing, unknown or forged credential → `401 unauthenticated`, checked
  **before** the service may resolve a token.
- Timestamp skew beyond 60 s → `401 stale_request`.
- A signature is accepted once only → `409 replay_rejected`. A captured
  request cannot become a second dispatch.
- Wrong path `404`, wrong method `405`, malformed body `400`.
- Business results return `200` with the adapter's result union, including
  `OUTCOME_UNKNOWN`; an unknown result code is treated by Core as
  `MALFORMED_RESPONSE`, never guessed.

Core does **not** retry: a `503`, network error or timeout becomes
`TRANSPORT_FAILURE`, which the caller must record as `OUTCOME_UNKNOWN` and
reconcile by publication id. Both sides pin the same signature vector
(`2xt1cCaGdhsNYi7hkiopSq2kjRI3BKcwuMuuHO7G0CE` for body `{"grant":"g"}`,
timestamp `1700000000000`, key `k-1`, secret `s`), so the two independent
implementations cannot drift into an unreachable pair.

## Execution path (Core)

`POST /api/v1/publications/tiktok` is the only entry point a caller uses. It
runs through the existing Core request boundary (identity verification, CSRF,
rate limit, audit log) and then:

1. `lib/tiktokPublication/requestBoundary.ts` validates the body, derives the
owner from the verified principal and requires an `idempotency-key` header.
2. `lib/tiktokPublication/execution.ts` (`executeTikTokPublication`) checks
export ownership, asset digest/revision and rights evidence through the
injected ports, creates the intent, moves it `AWAITING_CONFIRMATION → QUEUED`,
issues the grant and applies `UPLOAD_STARTED` before any network call.
3. `lib/publicationIntegration/adapterTransport.ts` sends the signed request to
the adapter and verifies the signature material of the reply.
4. `lib/tiktokPublication/responseProjector.ts` maps the adapter result onto a
Core observation and `lib/publicationIntegration/observation.ts` decides the
transition.
5. `GET /api/v1/publications/{publicationId}` returns the persisted state,
revision, transport and remote identifier to the owner (404 for anyone else).

The runtime reads `NEXCUT_TIKTOK_ADAPTER_URL`,
`NEXCUT_TIKTOK_TRANSPORT_KEY_ID`/`_SECRET`, `NEXCUT_TIKTOK_GRANT_KEY_ID`,
`NEXCUT_TIKTOK_GRANT_SIGNING_KEY` and `NEXCUT_PUBLICATION_TENANT_ID` (default
`local-tenant`). If any is missing the route fails closed with `503`; it never
falls back to an unsigned call or a fake publisher.

Adapter result → Core observation mapping is total: `PUBLISHED_PRIVATE` and
`DUPLICATE_PUBLICATION` (with a remote id) → `PUBLISH_PRIVATE_CONFIRMED`;
`PROVIDER_REJECTED`, `GRANT_REJECTED`, `ASSET_REJECTED`, `ACCOUNT_NOT_BOUND` →
`PERMANENT_FAILURE`; `AUTH_FAILED` → `AUTH_FAILED`; `OUTCOME_UNKNOWN`,
`CORE_STATE_REJECTED`, `TRANSPORT_FAILURE`, `MALFORMED_RESPONSE` →
`OUTCOME_UNKNOWN`. An unknown result code is `MALFORMED_RESPONSE`, never a guess.

## Observation intake

`POST /api/v1/publications/tiktok/observations` is the reverse channel. It uses
the same transport credential as the outbound call but signs a different path
(`publication-transport-v1\nPOST\n/publications/tiktok/observations\n<ts>\n<sha256(body)>`),
so a captured publish request cannot be replayed as an observation and a
signature made for one path is rejected for the other (`UNAUTHENTICATED`).

`lib/tiktokPublication/observationBoundary.ts` verifies version, timestamp skew,
body digest and signature; `observationApplication.ts` then applies the report
under the intent's revision fence. Results are `APPLIED`, `DUPLICATE`,
`REJECTED`, `INVALID_COMMAND`, `NOT_FOUND`, `CONFLICT`, `INVALID_RECORD`. Only
`APPLIED` and `DUPLICATE` count as progress; every other result stops the adapter
from advancing state and is surfaced for an operator decision.

An observation the intent already implies is *superseded*, not rejected: the
adapter reports `DISPATCH_ACCEPTED` after Core has already recorded
`UPLOAD_STARTED`, and a redelivered `QUEUED` is equally old news. Both answer
`DUPLICATE` with no write, so the adapter treats them as progress and never
retries a state Core has passed.

The adapter's own `status`/reconcile route is **not** implemented yet, so Core
cannot yet ask the adapter what happened after a lost reply. `OUTCOME_UNKNOWN`
therefore stays non-terminal and is resolved by an operator (see *Unresolved*).

## Intent state machine

`DRAFT -> VALIDATING -> READY -> AWAITING_CONFIRMATION -> QUEUED -> UPLOADING`,
with `INTERRUPTED`, `RECONCILING`, `PUBLISHED_PRIVATE`, `FAILED`, `CANCELLED` as
the non-happy branches. Every transition is appended to
`workflow.publication_events`; the intent row carries `revision`, which the
repository uses to fence concurrent writers.

## TikTok admission (V000035)

Forward-only and non-destructive. It replaces three destination constraints
with strict supersets, so every stored YouTube row still satisfies them:

- `publication_intents_platform_ck`: `platform IN ('youtube','tiktok')`.
- `publication_intents_transport_kind_ck`: adds `REAL_TIKTOK` to the existing
  values.
- `publication_intents_remote_verified_ck`: a remote-verified row must name the
  transport of its own platform, so a YouTube row cannot claim `REAL_TIKTOK`.
- New `publication_intents_platform_transport_ck` pairs platform with transport:
  YouTube may use `NONE`/`FAKE_DETERMINISTIC`/`REAL_YOUTUBE`, TikTok only
  `NONE`/`REAL_TIKTOK`.

`publication_upload_sessions_transport_ck` is deliberately **not** widened:
Core still has no real upload transport, and TikTok uploads are performed by the
adapter. Rollback is forward-only (a new migration restoring the narrower
constraint, which fails if TikTok rows exist).

## Migration head (V000036)

`workflow.workflow_schema_metadata` is a singleton row (`metadata_key =
'slice-a'`) whose `migration_head_identifier` is the identifier of the highest
applied migration, constrained to `^V[0-9]{6}$`. Each migration advances it only
when its own predecessor is already the head, which keeps the value honest when
the chain is applied out of numeric order.

The chain here applies V000001–V000009, then V000026–V000029, then V000035.
Versions 10–25 and 30–34 belong to slices that are not on this branch, so the
guarded update in V000026/V000035 never fires and the head stayed at the V000002
marker even though 13 migrations had been applied.

V000036 repairs that forward-only: it advances the head to `V000036` when the
current head is the V000002 marker, and is a no-op if the head is already at or
past V000036. Existing migrations are untouched, so no checksum changes.

Consequence to keep in mind: the head is *not* a contiguous version count. It is
the identifier of the last migration this branch applied. A branch that later
merges the 10–25 or 30–34 slices must re-assert its own head rather than assume
monotonic numbering.

## OAuth placement

The callback is hosted by the adapter at `/oauth/tiktok/{start,callback,status,revoke}`,
not by Core:

- Only the adapter holds the client secret, the token vault and the account
  binding, so Core never sees or stores token material.
- The authorization `state` is bound to the owner session that started the flow.
  A callback arriving in a different session is rejected (`state_owner_mismatch`)
  before any code exchange — this is the login-CSRF case.
- PKCE S256 is used for every authorization; `disable_auto_auth=1` is always set.
- `revoke` requires a same-origin request (cross-origin gets `403
  cross_origin_rejected`) and removes the local credential and binding even when
  the provider call fails, reporting `providerRevoked: false`.
- Status mapping: `transport_failure` and `provider_error` → 502; other OAuth
  errors → 400; unexpected → 500. Responses are `no-store` and never contain
  access or refresh tokens.

## Idempotency and duplicate prevention

- `UNIQUE (owner_uid, idempotency_key)` on `publication_intents`: a repeated
  request returns the existing intent rather than creating a second one.
- Upload sessions are `UNIQUE (publication_id)` and `UNIQUE (attempt_id)`;
  chunks are unique per `(session_id, chunk_index)` and offset-checked, so a
  resumed upload cannot re-send a stored chunk under a new index.
- Revision fencing rejects a writer holding a stale `revision` (`CONFLICT`).
- The adapter never re-sends a publication whose outcome is `OUTCOME_UNKNOWN`.
  It reconciles by remote identifier first; a blind retry is not permitted.

## Recovery rules

1. An interrupted upload resumes at the persisted offset; it is never restarted
   from zero while stored chunks exist.
2. `OUTCOME_UNKNOWN` / `RECONCILIATION_REQUIRED` are never terminal. Recovery
   observes or reconciles the same operation; redispatch is not permitted
   (`PublicationRecoveryPlan.redispatchAllowed: false`).
3. A response lost after a successful provider commit must be reconciled by
   remote identifier, not retried blindly.
4. Simulation results are stored separately from remote verification
   (`V000028`), so a simulated success cannot be read as a published video.
5. A restart restores intent state from PostgreSQL; the adapter re-reads the
   grant and the observation log rather than trusting in-memory state.

## Operator runbook

- **Stuck in `UPLOADING`/`INTERRUPTED`**: check the session offset, resume; do
  not start a new session for the same publication.
- **`RECONCILING`**: run the adapter reconcile for the same publication id and
  apply the returned observation. Never create a second publication for the
  same content.
- **Observation `CONFLICT`**: the Core revision moved. Re-issue the grant from
  the current revision; do not force the stale one.
- **`INVALID_SIGNATURE`/`UNKNOWN_KEY`**: treat as a configuration or rotation
  fault, not a data fault. Check the shared key id on both sides.
- **Token refresh/rotation failure**: the adapter marks the binding as needing
  reauthorization; the operator must run the OAuth flow again. Never edit vault
  contents by hand.

## Two-process loopback test

`tests/tiktokPublication/twoProcessLoopback.test.ts` (Core) starts the adapter as
a **separate process** (`scripts/tiktok-publication-loopback-server.ts` in the
adapter repo, launched with `npx tsx`), points the Core execution path at it and
serves the observation endpoint on a loopback port. It then asserts:

- a real HTTP request reaches the adapter and its HMAC signature verifies;
- a forged signature is `401` and a replayed one is `409 replay_rejected`;
- the grant is accepted, the asset is verified and the mock TikTok publisher is
  called exactly once;
- the adapter's result comes back and is persisted in PostgreSQL as
  `PUBLISHED_PRIVATE` with transport `REAL_TIKTOK` and the remote id;
- re-sending the same publication does not produce a second adapter call;
- after the adapter process is killed and restarted, a new publication succeeds
  and the earlier one is still readable.

The test drives real processes and a real PostgreSQL database, but no real
TikTok account: the adapter's publisher port is a mock.

## Tests actually executed (2026-11-27)

| Suite | Result |
| :--- | :--- |
| Core `tests/publicationIntegration/publicationIntegrationContract.test.ts` + `publicationGrantVectors.test.ts` | 17/17 pass, exit 0 |
| Core `tests/publicationIntegration/tiktokPublicationPostgresql.test.ts` (real PostgreSQL via Docker + Flyway) | 1/1 pass, exit 0 |
| Core `tests/publicationIntegration/adapterTransport.test.ts` | 8/8 pass, exit 0 |
| Core `tests/tiktokPublication/publicationRequestAndResultMapping.test.ts` | 6/6 pass, exit 0 |
| Core `tests/tiktokPublication/tiktokPublicationExecutionPostgresql.test.ts` (real PostgreSQL) | 9/9 pass, exit 0 |
| Core `tests/tiktokPublication/twoProcessLoopback.test.ts` (separate adapter process) | 1/1 pass, exit 0 |
| Adapter `src/tiktok/publication/__tests__/grant-verifier.test.ts` | 16/16 pass |
| Adapter `src/tiktok/publication/__tests__/publication-service.test.ts` | 10/10 pass |
| Adapter `src/tiktok/publication/__tests__/publication-endpoint.test.ts` | 8/8 pass |
| Adapter `src/tiktok/real/oauth/__tests__/callback-host.test.ts` | 13/13 pass |
| Adapter `npm run typecheck` / `npm run lint` / `npx vitest run` | pass / pass / 757 tests, 23 files |
| Adapter `npm run build` | pass |
| Core `npx tsc --noEmit` | 31 errors, all pre-existing; none in the publication files |

## Staging pre-flight checklist

Everything here can be checked without a live TikTok app, but the Staging apply
itself needs owner approval and a Staging database that this branch has **not**
touched.

- [ ] Apply the chain in order on a copy first: `000001`–`000009`, `000026`–`000029`,
      `000035`, `000036`; confirm `workflow_schema_metadata.migration_head_identifier`
      ends at `V000036` and every row is `success = true`.
- [ ] Confirm no existing migration file changed (checksum stability); the chain is
      forward-only additions plus the metadata-only `V000036` repair.
- [ ] Provide `NEXCUT_PUBLICATION_TENANT_ID` and the adapter signing secret through the
      environment/secret store, never through the repo.
- [ ] Point Core's adapter base URL at the Staging adapter over HTTPS; loopback is
      development-only.
- [ ] Confirm the adapter is reachable and rejects unsigned requests (`401`/`403`)
      before any real publication is attempted.

## Live-post pre-flight checklist

Required before a real TikTok publication, and each item is a hard blocker for
`J. LIVE_VERIFIED`:

- [ ] TikTok Developer app approved with the `video.publish` scope, and the exact
      redirect URI registered for the environment in use.
- [ ] OAuth flow exercised end to end (consent, code exchange, refresh, revoke) with
      the real account; tokens live only in the adapter vault.
- [ ] Adapter reconcile/status route implemented, so an `OUTCOME_UNKNOWN` publication
      can be resolved automatically instead of by operator investigation.
- [ ] Private-post visibility verified against the real account, including the case
      where TikTok accepts the upload but delays processing.
- [ ] Duplicate prevention re-verified against the live provider: a repeated request
      must return the existing intent, and an ambiguous outcome must never be
      re-dispatched.
- [ ] Failure recovery rehearsed for a lost observation, a rejected upload and an
      expired grant.

## Blocker classification

| # | Item | Class | Why |
| :-- | :--- | :--- | :--- |
| 1 | Adapter reconcile/status endpoint | Required before a live post; Staging can proceed with the manual runbook | `OUTCOME_UNKNOWN` stays non-terminal and needs an operator without it |
| 2 | OAuth redirect URI registration | Required before real OAuth | The provider rejects an unregistered URI; no code change needed |
| 3 | TikTok Developer app review / scope | Required before real OAuth | External approval, outside the repo |
| 4 | Token vault key material and rotation | Required before real OAuth | Only the adapter holds keys; Core stores no token material |
| 5 | Real token refresh | Required before real OAuth | Single-flight refresh is unit-tested, not provider-tested |
| 6 | Post-publication status reconciliation | Required before a live post | Same gap as item 1 |
| 7 | Private-post verification | Required before a live post | Visibility is provider state, not local state |
| 8 | Duplicate prevention | Verifiable in Staging without a live post | Enforced by unique keys, revision fencing and the no-redispatch rule |
| 9 | Failure recovery | Verified during Staging | Rehearsed against the loopback adapter and real PostgreSQL |
| 10 | User-facing publication result | Can follow Staging | The projected outcome is already returned by the API route |

## Unresolved

- The adapter has no HTTP reconcile/status route, so `OUTCOME_UNKNOWN` cannot be
  resolved automatically. It stays non-terminal and requires the operator
  procedure above. Implementing `POST /publications/tiktok/status` on the same
  signed transport is the next adapter task.
- Staging (Cloud SQL, GCS, IAM/WIF), real TikTok OAuth and real posting are
  **not** performed and require explicit owner approval. `J. LIVE_VERIFIED` is
  `NOT_TESTED`.
- External prerequisites: TikTok App Review, OAuth redirect URI registration,
  DB schema permissions for the Staging apply.
- Token vault key management (rotation, backup, restore) is documented at the
  adapter; no key material exists in Core and none is stored in the Core DB.
