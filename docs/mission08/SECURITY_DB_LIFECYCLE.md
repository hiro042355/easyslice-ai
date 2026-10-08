# Mission 08 security, database and lifecycle evidence

Security review (source + synthetic tests, not live infrastructure qualification):

1. State: cryptographic 32-byte random base64url; SQL stores digest, max ten-minute DB-clock validity bounded by session.
2. Atomic pending -> claimed -> consumed/failed, terminal states cannot reopen; concurrent/repeated callback permits one exchange/connection.
3. UID/session/app/environment/redirect/scopes bound; wrong user/session/profile/redirect/scopes fails before exchange where applicable.
4. Authorization code adapter exchange once per process plus durable state claim; process code hash is supplemental, not distributed code registry. No code logging.
5. Canonical HTTPS redirect and request path/method; Next exports only GET callback and POST start/disconnect. Dispatcher rejects foreign origins/paths/methods before resolving ports; Next unsupported methods get its own method handling.
6. Official allowed callback shape retained: bounded state/code/scopes/error/error_description; duplicates/unknown/code+error rejected; description discarded; insufficient echoed/token scopes rejected.
7. Canonical Firebase verifier revocation and beta-allowed UID checks; no browser UID/header trust. Normal real browser cookie behavior remains unqualified.
8. Start/disconnect same-origin, exact session CSRF token; start empty body/no query; disconnect exact confirm:true body. No new bypass or alternate authority endpoint.
9. SERVER_GATED operation callbacks retained; native requests require a separate release callback every time. Config alone is not execution authority.
10. Local mock and public runtime installation separated: LOCAL_TEST cannot install; branded composition rejects copied/forged objects. Installed config binding changes fail closed.
11. Server-only installation/bootstrap facade; approved injected PG pool, canonical Firebase, ManagedTokenVault and native transport. No DSN/ADC fallback or provisioning.
12. AES-GCM envelope v2 per-message random DEK, wrapped by approved symmetric KMS version; AAD binds owner/app/environment/openID/generation/scopes/expiry. Managed readiness checked in server-gated path.
13. Mission 07 token JSON/object inspection redaction preserved. Explicit token fields used for encryption. Ordinary spreading of decrypted tokens is still forbidden in logs.
14. Account persistence unique owner/app/environment; reconnect expected-openID rejects replacement; browser DTO only version/status/displayName/fixed error.
15. State consumption and connection upsert are one transaction; failures roll back and never redirect as success. Ambiguous claim is never reopened automatically.
16. Missing key: fail closed, no plaintext persistence. LOCAL_TEST may exchange its synthetic code before encrypt fails; server-gated startup rejects unavailable custody before exchange. That distinction is not hidden.
17. Access expiry -> REAUTH_REQUIRED; no automatic refresh; refresh token encrypted but separate refresh expiry/rotation not implemented.
18. Disconnect invalidates states/grants and wipes ciphertext/nonce/tag/wrapped key regardless of key/provider failure; retained metadata/history is not remote deletion. Actual revoke remains separately authorized native operation.
19. Fixed route errors and no-store/no-referrer on dispatcher and accepted routes. No raw provider bodies/secrets logged by new code. Hosting access-log query suppression still requires release qualification.
20. No synthetic result upgrades deployment/Firebase/KMS/DB/Portal/real OAuth capability claims. Resolver/bootstrap failure => unavailable; no alternate local/live fallback.

Disposable PostgreSQL18.4 on owned Docker Desktop internal network; no host ports, credential mounts, persistent volumes, cloud DB connections or Production mutations. Existing local fixture + existing NONDEPLOYABLE OAuth candidate only. 112 tests passed: state persistence/consumption, ownership, encrypted envelope, duplicate concurrency, transactional commit/rollback, ended-pool failure, key absence, disconnect, B7 consent and UI. Existing candidate's immutable state binding was preserved; expiration test replaces only its owned disposable fixture rather than altering schema/trigger. The additional actual Next exports lifecycle also verifies installed SERVER_GATED synthetic ports, encrypted committed state, safe DTO, replay and disconnect using this disposable database. Both test containers/network removed (0 remaining).

No schema changes required. No migration candidate created; existing candidate remains NONDEPLOYABLE. No final Flyway version assigned; Production migration history, identity DDL/table-creation authority, execution path and schema applied-state remain UNKNOWN/unqualified. No cloud or Production access performed. Earlier one-shot DB evidence is not migration authority.

Lifecycle compatibility with all 16 Mission 07 categories: no new media/chunk/history/ID/status/audit/log storage schema or deletion job. Added runtime stores only private configuration digest, trusted application reference and functions in worker memory, lifetime ends with worker; no raw callback code retained by composition. Accepted adapter supplemental code hashes remain process-local. UI stores safe display DTO transiently, no tokens.

OAuth validity expiry is not row deletion. State terminal metadata persists under the still-unapproved policy; disconnect immediately invalidates state/grants and wipes token envelopes while retaining account mappings/correlations. No new error payload persistence; provider descriptions discarded. Source media/generated assets/orphans and backups/log sinks unchanged. No account-deletion cascade or refresh-expiry maintenance added. A–P retention proposals in docs/mission07/DATA_RETENTION_AND_DELETION_POLICY_PROPOSAL.md remain REQUIRES_PRODUCT_OWNER_DECISION; no numerical period finalized, scheduler deployed, records deleted, shared key destroyed or remote post removed.
