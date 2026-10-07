# TikTok workstream: canonical Firebase / server session runbook

Scope: repository-side authentication remediation only. No deployment, Production DB probe, real TikTok OAuth, TikTok API call, Direct Post, or Developer Portal change is authorized by this runbook.

## Authentication contract and evidence

- `lib/client/firebaseClient.ts` creates the existing Firebase browser Auth instance and Google provider. There is no new credential store or authentication provider.
- `lib/client/googleIdentitySignIn.ts` and `components/GoogleIdentitySignInButton.tsx`: explicit Google popup -> Firebase credential -> `getIdToken(true)` -> same-origin POST `/api/auth/session` with the ID token only in Authorization -> navigate to `/workspace` after POST success.
- `app/api/auth/session/route.ts` is a thin production adapter for `lib/server/productionIdentity/sessionRouteCore.ts`. The adapter injects the real `withFirebaseAdminAuth` and canonical `requireAuthenticatedRequest`; test dependencies are never selected by environment or request flags.
- POST requires the exact request Origin, verifies the ID token with revocation checking, and creates the existing Firebase session cookie for five days (`SESSION_MAX_AGE_SECONDS = 432000`). POST does not itself grant beta or Owner authority.
- `__Host-nexcut_session`: HttpOnly, Secure, SameSite=Lax, Path=/, five-day Max-Age, no Domain. The session value appears only in the necessary Set-Cookie header, never in JSON. ID/TikTok tokens are not returned.
- `routeGuardCore.ts` prefers a nonempty session cookie, verifies it with `verifySessionCookie(..., true)`, and never falls back to a bearer token after rejecting that cookie. Existing bearer verification remains supported when no session credential is present. Malformed cookie decoding now also returns a safe 401.
- `routeGuard.ts` uses Firebase Admin via the existing Vercel OIDC / Google WIF credential infrastructure and then applies `NEXCUT_BETA_ALLOWED_UIDS`. Unavailable Admin verification and missing/invalid beta configuration fail closed.
- Beta checks compare the canonical verified UID against the configured allowlist, not client identity claims. Production Owner checks use the exact bounded `NEXCUT_PRODUCTION_OWNER_UID` via `productionOwnerAuthority.ts`, in addition to authentication/beta checks. Client headers cannot grant ownership.
- `/workspace` is a static shell with a client session control. `/workspace-flow` is a client page with the same control. Neither has a server page authentication gate; no middleware/proxy or parent layout adds one. A visible shell is not proof of authorization. Protected requests must retain their server guards.

## Four different states

A. Firebase client authenticated: the SDK has restored a user or a popup succeeded.
B. Cookie present: the browser has a host-bound session cookie and sends it to the matching HTTPS origin.
C. Server accepted: Firebase Admin accepted the credential and the beta guard allowed the verified UID for this request.
D. UI appears authenticated: the account control last received an accepted server check.

A does not prove B or C. B does not prove C. D proves a recent GET accepted by Admin and beta, not Owner authorization, historical cookie state, or permanent validity. A server cookie can remain authoritative when client auth is absent; a client can be restored after a cookie expires. The UI is an observation, and each protected operation independently checks authorization.

## Fresh login

1. Open the canonical HTTPS host and `/auth`.
2. Select Google and complete the popup with an approved account.
3. The existing popup code forces a fresh ID token and exchanges it using the canonical POST.
4. `/workspace` performs a server check. Only accepted GET results display Signed in. Beta rejection redirects to `/auth` and does not grant access.

No automatic restoration was added to `/auth`; explicit Google login remains available there.

## Restored authentication and server session recovery

`AuthenticatedAccountControl` runs on mount, window focus, and every 60 seconds in the two workspace pages. Checks are single-flight; each check hides the previous Signed in state while pending. React StrictMode effect replay drains stale work and starts the live check; unmount removes timers/listeners.

1. GET `/api/auth/session` with same-origin credentials and `cache: no-store`.
2. An accepted GET requires no Firebase initialization or token exchange.
3. Only 401 can enter recovery. Wait for `auth.authStateReady()`, then read `auth.currentUser`.
4. No restored user -> unauthenticated. A restored user -> `getIdToken(true)` -> exactly one canonical POST using Authorization.
5. POST rejection fails closed. POST success alone never makes the account control Signed in: repeat GET with the new cookie and require its authentication/beta acceptance.
6. A 403 never enters recovery; the existing client signout/redirect behavior is retained. Unexpected/network/server errors show an error and keep the account control disabled, without declaring authentication success. Later focus/timer checks can retry.

A protected operation performed while checking can still return 401. There is no automatic replay of protected mutations. Cookie revocation or expiry between checks remains possible; timers can be throttled in background tabs. The server guard is the final authority on every request. This change repairs and exposes divergence during workspace use; it does not promise continuous identity equivalence or global interception of all fetches.

Official SDK contract for the settled restoration promise: https://firebase.google.com/docs/reference/js/auth.auth#authauthstateready

## Logout

Stop new recovery checks, drain any in-flight exchange, DELETE the canonical session, then Firebase signout and navigate to `/auth`. This ordering prevents an in-flight exchange from undoing this control's logout. DELETE validates Origin, verifies/revokes the session where possible, and clears the secure host-only cookie even when already expired/revoked/malformed. Existing idempotent behavior remains. Other tabs and provider refresh failures remain governed by Firebase revocation checks; this is not a cross-tab locking system.

## Historical 401: limits of the evidence

Historical fixed-probe commit: `4c9322c2f6d45a4c679d4b8dceac68e0dea848b8`.
Cleanup commit: `61a31b5314ddd42bfedc5403de40a3e661536723`.

The old `createProbeRoute` first required a nonempty `__Host-nexcut_session`, then called the canonical authentication/beta guard. Both a missing cookie and any non-ok guard result became HTTP 401 `{error: AUTHENTICATION_REQUIRED}`. Beta denial was also collapsed into this response. An authenticated Firebase client, a visible workspace, or earlier Signed in display did not prove an acceptable cookie was sent on that invocation. Cookie expiry/deletion, a different host, Admin rejection/unavailability, and beta denial are compatible explanations; none is established as the unique historical cause.

The old response does not recover the original Cookie header, host cookie jar, Firebase restored state, cookie expiry/revocation, Admin verification result, allowlist at that instant, or request timing. The structural missing-restoration defect is proven from source; the exact historical cookie condition is not proven. The probe remains removed; never recreate or invoke it to reconstruct this history.

## Deterministic local verification

From `C:\Users\hirom\easyslice-ai`, with installed dependencies:

```powershell
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/productionIdentity/restoredServerSession.test.ts tests/productionIdentity/sessionLifecycleFakeE2E.test.ts tests/productionIdentity/googleIdentitySignIn.test.ts tests/productionIdentity/authenticatedAccountControl.test.ts tests/productionIdentity/authenticatedAccountControlRuntime.test.mjs tests/productionIdentity/betaAuthorization.test.ts tests/productionIdentity/productionIdentityFoundation.test.ts tests/productionIdentity/productionOwnerUidProofRoute.test.ts
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/productionIdentity/*.test.ts tests/productionIdentity/*.test.mjs
npm run typecheck
npm run lint
npm run build --ignore-scripts
git diff --check
```

The fake E2E calls the same executable session handlers as production with fake Admin dependencies, maintains a deterministic cookie jar, and calls the actual beta guard and Owner proof handler factory with fake environment values. It proves fresh/restored/expired lifecycle, cookie attributes, revoked/invalid credentials, anonymous/unauthorized callers, Owner boundaries, same-origin mutations, and logout. The production handler itself is never invoked. React tests execute the real component after TS/JSX transformation, replacing only imports/network dependencies, and prove UI gating, StrictMode replay, focus/interval checks and logout races.

No real OAuth/network/provider/DB is needed. Fake Admin verification proves wiring and rejection behavior, not real Firebase cryptography. The cookie jar checks Set-Cookie attributes but is not a real browser HTTPS enforcement test. JSDOM may print its expected unsupported-navigation notice after successful logout.

`--ignore-scripts` skips the prebuild downloader/materializer; it still executes the real `next build`. Verify packaged runtime binaries separately before any future deployment. Do not bypass TypeScript or lint failures. The 2026-10-07 mission found preexisting repository-wide type/lint/whitespace failures; see the Gate report before treating the repository as releasable.

## Production prerequisites and future safe verification

No Production verification was run. LOGIN-2 Production verification remains incomplete.

Prerequisites: resolve the independent repository gate failures, review the mission-only diff, obtain explicit publication authorization, configure matching public Firebase project/domain and canonical HTTPS host, valid Vercel OIDC/WIF/Firebase Admin IAM, beta UID allowlist, and exact Owner UID. Cookie host/scheme must match the canonical application origin. Do not weaken guards to compensate for configuration errors.

After separately authorized deployment, an authorized human can complete Google login on the canonical host, observe POST and GET status codes, then revisit/focus workspace with a missing/expired session and an otherwise valid restored Firebase user. Confirm one session exchange and accepted GET; confirm denied/anonymous callers remain rejected. Check only safe status/attribute information; do not export raw Authorization, ID tokens, refresh tokens or session-cookie values to logs/chat/screenshots.

If separately authorized, use the existing non-DB Owner proof surface with one same-origin bodyless POST to confirm exact Owner authorization. A successful session GET does not suffice. Stop on unexpected failures; investigate configuration before repeating actions. Do not invoke the removed Production DB probe, touch DB/migrations, perform real TikTok OAuth/API calls, enable Direct Post, or change Developer Portal. Those need separate scope and authorization.
