# TikTok protocol adapters: inactive native transport

These adapters implement fixed TikTok wire contracts and match the accepted Publisher B7 HttpExecutor and UploadExecutor interfaces at 7f16aa12c75f7f20a50b88c50b4e7e5b13f11196. The existing B7 Creator Info parser, Direct Post validator/serializer, transfer planner, status parser and consent engine remain the authorities. This module does not implement another publication engine.

Import through index.ts in Next.js server code. The adapter.ts core is independently testable; its injected callbacks are trusted server composition boundaries, never request-body fields or browser configuration. It is not mounted by Production routes.

Native I/O is disabled when no transport is supplied. No environment flag, route, native executor or default fetch fallback enables it. MockHttpTransport requires explicit server injection, rejects global fetch, and accepts only synthetic credentials. Its I/O callback is trusted test infrastructure, not an untrusted user-selectable function. Production capability here means wire-compatible protocol code; live transport activation needs a separate authorization gate and implementation qualification.

Before exchange, the trusted authorize callback must resolve the canonical verified Firebase session and atomically claim the durable state matching UID, verified session, app, environment, scopes and canonical callback. This adapter additionally consumes the authorization code before asynchronous operations; that process-local guard is not a substitute for durable state. For a reconnect, supply the expected owned open_id. First connection establishes the opaque provider open_id only after session-bound state claim. Tokens are server-only return fields and their toJSON redacts credentials. Rebuild the explicit accessToken/refreshToken object for encrypted custody.

B7HttpExecutor's authorize callback must return credentials only after owned current connection resolution, required video.publish scope, expiry and revocation checks. For init it must also atomically consume the durable publication grant bound to reviewed fresh Creator Info, exact media checksum and explicit B7 consent. The callback must revalidate the current connection on every stage. A plain enabled flag or client-provided UID does not implement this boundary.

B7UploadExecutor separately binds the one provider-issued upload URL and deadline, checks sequential ranges and exact final201/intermediate206, reauthorizes every chunk, and never attaches API bearer credentials. Host allowlist is deliberately restricted to the two exact hosts documented in official examples: open-upload.tiktokapis.com and upload.us.tiktokapis.com. A newly observed region/host fails closed pending reviewed allowlist qualification. Arbitrary URLs and PULL_FROM_URL are unsupported. Failed or ambiguous transfer cannot be retried on the same executor. Use B7's existing chunk layout authority.

Disconnect must invalidate local encrypted custody and outstanding grants even if provider revocation fails; a successful local disconnect does not prove provider revocation. Expired tokens require reauthorization; automatic refresh is intentionally not wired. Status executes one authorized observation per call with no automatic polling/retry. Ambiguous responses require explicit reconciliation and must not generate another init.

Official sources checked 2026-10-08:

- Login Kit: https://developers.tiktok.com/docs/en/login-kit-web
- Token exchange/revoke: https://developers.tiktok.com/doc/oauth-user-access-token-management
- Creator Info: https://developers.tiktok.com/docs/en/content-posting-api-reference-query-creator-info
- Direct Post: https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post
- Transfer rules: https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide
- Status: https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status

FILE_UPLOAD is transport; video.publish authorizes Direct Post; video.upload is not requested. No live TikTok request, OAuth, real upload, publication or Portal mutation occurred during implementation or tests.