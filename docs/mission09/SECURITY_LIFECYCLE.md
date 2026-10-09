# Mission 09 security and lifecycle acceptance

1. Existing OAuth state entropy32 random bytes/digest-only SQL preserved.
2. DB-clock max ten-minute/session-bound expiry preserved; expired state rejected before exchange.
3. Atomic single-use state claim/consumption/terminal failure, duplicate/concurrent callback tests preserved.
4. Canonical Firebase verified UID/session, beta allowlist and cookie-bound ticket; no browser ownership ID.
5. SQL owner/app/environment/provider uniqueness; worker/review handles bind UID,session,current generation/openID. Synthetic test account collision was rejected by this unchanged DB constraint, then the fixture was corrected.
6. Existing AES-256-GCM envelope v2/per-message DEK/wrapped key/AAD/version/readability/fail-closed behavior preserved. No HMAC fallback.
7. Mission07 token JSON/inspection redaction preserved; explicit token fields still encrypted, no token fields in job payloads.
8. Codes/provider descriptions not echoed/logged; browser HTML errors redirect only to fixed settings?tiktok=error. Query error flags cannot imply connection.
9. Strict existing token/callback scopes preserved; only basic + video.publish. Unsupported/insufficient scopes reject safely.
10. Canonical redirect and generated provider URL; client accepts only fixed same-origin navigation path, no open redirect.
11. Same-origin credentialed no-store fetch, exact authenticated CSRF; confirmed disconnect; one-use cookie-bound navigation ticket. CSRF is a same-session anti-forgery value, not a manually supplied authentication credential.
12. Foreign user/missing-CSRF disconnect rejected, existing custody remains. Normal disconnect wipes envelopes and invalidates pending state/grants even on provider/key failures.
13. Bounded128-entry manual queue, scoped idempotency keys, current encrypted connection revalidation on submit/read/dispatch/result; SQL grant prevents duplicate init across attempts.
14. One attempt, zero job/HTTP auto retries; startup one attempt per registration, five-second deadline/abort, concurrency singleton and shutdown epoch protection. Unknown publication never success.
15. Native transport/SERVER_GATED execution cannot start local worker; no timers/automatic consumption. Production review APIs always unavailable.
16. Default UI/worker/posting disabled. Flags cannot construct trusted providers/application authority. Runtime flag disable blocks UI start and mock review effects.
17. Fixed browser errors; finite classification/count audit only. No Request, code, token, raw provider/DB error or secret logged by new source.
18. Strict flags/mode/client/redirect/key startup contracts. Partial enabled dependencies fail closed, no credential loader or Production fallback.
19. Connection/Creator/review DTO allowlists; OAuth code, access/refresh/client secrets, key bytes, cookies and SQL grant/publish identifiers never returned. Server-only private runtime installation preserved.
20. Exact changed-file manifest/secret scan/diff/whitespace/index/Git checks recorded. Shared Firebase/authentication infrastructure, SQL schema and B7 engine untouched.

## Job and shutdown data model

No Request/cookie/token/code is stored in a job. The first implementation tried to clone a consumed review Request; the failing E2E identified this. Final jobs hold immutable synthetic media/creator/selection/private grant references plus owner/session-hash/generation metadata. Each manual run uses the fresh authenticated caller Request and existing B7 authorization checks. Unknown credential fields are refused before enqueue. Shutdown rejects new work, drains the active bounded operation, cancels/drops pending metadata and clears the queue; provider startup can be aborted even if its promise never resolves.

Ephemeral queue is not a distributed persistent queue. A full process restart cannot replay an old queued publication automatically. Existing SQL grant/attempt/provider-status history remains durable and accepted owned reconciliation remains available; new UI review handles are ephemeral. No new worker-job table/final migration assigned.

## Retention compatibility

All16 Mission07 A–P policies remain unapproved; no numeric retention period finalized or irreversible job/Production record deletion added. Existing state validity is not row deletion; encrypted tokens persist until accepted disconnect/approved future expiry cleanup. Disconnect retains account mapping/history while wiping ciphertext/nonce/tag/wrappedDEK. Refresh expiry/rotation/account deletion/backup/log sink lifecycle remain unchanged and unqualified.

New transient categories: navigation ticket -> private provider URL/state/UID/session binding,30-second routing validity with single-use claim, bounded128 memory entries and cleanup of expired entries during new initiation; worker metadata/results (no auth credentials), bounded128 until explicit shutdown/process lifetime; review capabilities/selection/creator metadata, bounded128 and at most existing five-minute grant/review validity, cleared at shutdown; client CSRF/display/loading state in memory until navigation/unmount. These validity limits are technical security gates, not adopted legal retention periods. No durable raw authorization data, media storage, deletion scheduler or new database category created. Audit sink defaults no-op; external monitoring/hosting access-log/backup retention still require approval.

No Production connection, probe, schema change, migration, deletion, key/IAM change or live TikTok operation was performed. Disposable fixture setup/DML/cleanup is explicitly separate from Production zero counters.
