# TikTok Production release readiness matrix

As of 2026-10-08: PRODUCTION_RELEASE_READY = NO. Local implementation/test evidence cannot authorize deployment, migrations, portal changes, OAuth or external posting. This matrix describes prerequisites; it does not activate features. Owner evidence preserves current Production auth remediation and UNKNOWN migration authority.

| Area | Required prerequisite | Current result | Operational owner |
|---|---|---|---|
| Firebase | Canonical server session verifier; revoked/expired/logout rejection, same user/session binding; no browser UID trust | Code/test integration; actual new Production flow NOT_VERIFIED | App/security owner |
| Persistence | Exact reviewed schema and application repository mapping | Nondeployable candidate prepared; Production schema NOT_APPLIED | DB/migration owner |
| History | Authoritative Flyway history and collision resolution | UNKNOWN; neither V000009 nor V000026 reserved | Migration authority owner |
| Migrator | Verified existing IAM login, PostgreSQL DDL/table ownership and one-shot operator path | UNKNOWN | Cloud/DB owner |
| Cloud rehearsal | Authorized staging SQL Admin API, inventory, least-privilege identities and IAM/token-refresh qualification | BLOCKED; no paid service enabled | Cloud budget/IAM owner |
| App identity config | Server-owned TikTok client key, fixed app/environment, canonical origin/callback | Synthetic local test only; Production values not inspected | App/Product Owner |
| Server secrets | Client secret and custody key-provider secrets outside browser/source/logs; secret rotation/access ownership | Production secret provisioning NOT_AUTHORIZED | Security owner |
| Encryption | Strong key provider, key IDs, AES-GCM AAD, rotation/recovery, no plaintext storage, controlled old-key retirement | Local crypto validated; Production KMS/secret custody not qualified | Security/DB owner |
| Runtime DB config | Dedicated runtime identity and approved connection/proxy topology; no runtime DDL | Production path and grants UNKNOWN | App/DB owner |
| Callback | Exactly https://www.nexcutai.com/api/tiktok/oauth/callback, registered static HTTPS and matching code profile | Portal registration UNKNOWN; actual callback activation gated | Product Owner |
| Scopes | user.info.basic and video.publish; exclude video.upload | Requested design ready; granted/audited status UNKNOWN | Product Owner |
| Review | Complete genuine sandbox demonstration and app/product review/audit | NOT_SUBMITTED; draft PARTIAL | Product Owner |
| Creator/consent UX | Current account, media preview, editable title, manual privacy, unsupported interactions disabled, music/commercial/AIGC disclosures | Production posting UX demonstration not complete | Product/UI owner |
| Media source | FILE_UPLOAD only eligible device media; server-stored exports require verified-domain PULL_FROM_URL | Real source provenance unresolved | Product/media owner |
| Network | Fixed API allowlist, upload URL validation, strict credential separation, bounded redirects/body/timeout; no arbitrary provider URL | Mock-only contract testing; live execution disabled | Security/app owner |
| Connect disable switch | Default deny server route composition and UI; no user parameter can enable | Production Connect stays disabled | Release operator |
| Publication disable switch | Separate default-deny publication execution gate, durable consent grant and current owned connection | Native publication remains disabled | Release/security owner |
| Deployment | Immutable source/tree and previously accepted rollback source; build/check evidence | Deployment and push NOT_AUTHORIZED | Release operator |
| Observability | Bounded classifications and correlation IDs; no token/cookie/code/query/raw user or DB identifier logging | Local redacted behavior; Production monitoring owner/config pending | Operations/security owner |
| Recovery | Disable features first; reconcile ambiguous attempts without automatic repost; token revocation and application rollback separately approved | Written runbook; no recovery operation executed | Operations/Product Owner |
| Retention | Approved state/grant/token/account deletion windows and maintenance least privilege | Proposed windows require privacy sign-off | Product/legal/DB owner |

Required configuration is a contract, not an existing activation mechanism. Existing canonical Firebase variables and the accepted server auth verifier must be reused; never add competing browser-controlled identity config. TikTok client key/client secret/app environment/origin/callback, runtime DB connection identity/path, encryption provider/key ID and independent connection/publication enable decisions must be server owned. Exact deployment environment variable names must be chosen in the separately approved composition/secret-provisioning gate; no current environment value was read, copied or changed. Secret-bearing settings must never use NEXT_PUBLIC names. This mission intentionally introduces no environment flag that can turn a route live.

Release order after future explicit approvals: resolve authoritative migration history and identities; qualify non-Production IAM path; approve final version and apply exact schema through existing one-shot operator tooling; provision separately reviewed keys/config; verify portal callback/scopes and eligible media flow; complete approved sandbox integration and real demo/review; then authorize immutable deployment and controlled feature activation. Actual permissions and TikTok approval must precede public Direct Post eligibility. No local test upgrades UNKNOWN authority or grants any external action.

Rollback plan: under separate release authorization disable Connect/publication independently; preserve immutable artifacts and reconcile outstanding publication IDs; redeploy the previously accepted application candidate if appropriate. Keep compatible schema/history in place. Never automatically run down migration, Flyway repair/clean, provider replay or database deletion. Stop after ambiguous publication or migration and require an explicit recovery decision.

## Environment-variable inventory and proposed future contract

Names below are configuration requirements only. No environment values were read. Proposed TikTok names are not implemented loaders or activation flags and require the separate release-composition gate.

| Name | Purpose | Status |
|---|---|---|
| GCP_PROJECT_ID | Existing canonical Firebase WIF project | Reuse existing verifier; values not inspected |
| GCP_WIF_PROVIDER_RESOURCE | Existing WIF provider | Reuse; values not inspected |
| GCP_WIF_SERVICE_ACCOUNT | Existing impersonated auth identity | Reuse; values not inspected |
| NEXCUT_BETA_ALLOWED_UIDS | Existing canonical beta authorization | Reuse server allowlist |
| CLOUD_SQL_INSTANCE_CONNECTION_NAME | Existing runtime Cloud SQL target | Authority/topology qualification unresolved |
| POSTGRES_DATABASE | Existing runtime database name | Do not expose or infer authority |
| POSTGRES_IAM_USER | Existing runtime IAM database identity | No runtime DDL; migration identity remains separate |
| NEXCUT_TIKTOK_CLIENT_KEY | Proposed server-owned app identity | Future provisioning; never browser supplied |
| NEXCUT_TIKTOK_CLIENT_SECRET | Proposed server-only Login Kit secret reference/value | Future secret provisioning; never NEXT_PUBLIC |
| NEXCUT_TIKTOK_ENVIRONMENT | Proposed explicit app environment | Future binding; not an authorization switch |
| NEXCUT_TIKTOK_TOKEN_KEY_PROVIDER | Proposed reviewed encryption provider identifier | KMS/rotation/recovery qualification required |
| NEXCUT_TIKTOK_TOKEN_KEY_ID | Proposed current encryption key identifier | Server custody; no raw key in source or browser |
| NEXCUT_TIKTOK_CONNECT_ENABLED | Proposed independently reviewed Connect disable switch | Default deny; no current loader or enabling path |
| NEXCUT_TIKTOK_PUBLISH_ENABLED | Proposed separate publication disable switch | Default deny; no current loader or enabling path |

Callback and API origins remain fixed in code; no arbitrary base URL environment variable is proposed. The disposable tests use only LOCAL_TEST_POSTGRES, LOCAL_TEST_DB_PASSWORD and LOCAL_B7_ROOT inside the isolated runner; these are never Production settings.
