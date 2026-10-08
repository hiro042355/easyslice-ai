# Mission 08: future Sandbox execution checklist

NOT EXECUTED. Real OAuth, deployment and live API use require new authorization. Configuration validation is source/test evidence, not inspection of live secrets.

| Configuration item / source | Local test | Sandbox | Production | Current status / missing requirement |
|---|---|---|---|---|
| NEXCUT_TIKTOK_APPLICATION_MODE, server env | sandbox fixture | sandbox after approval | rejected | Default absent => unavailable. Flag alone grants no authority. |
| NEXCUT_TIKTOK_OAUTH_MODE | sandbox fixture | sandbox | production rejected by application composition | Separate verified client environment required. |
| NEXCUT_TIKTOK_CLIENT_KEY | synthetic-client | private server binding for NEXCUT AI Review | not read | Approved secure Sandbox binding missing. |
| NEXCUT_TIKTOK_CLIENT_SECRET | synthetic fixture | secret-manager/server binding | not read | Never NEXT_PUBLIC, URL, logs or browser DTO. Binding not retrieved. |
| NEXCUT_TIKTOK_REDIRECT_URI | exact canonical fixture | https://www.nexcutai.com/api/tiktok/oauth/callback | unchanged/inactive | Reject HTTP, other host/path, query, credentials, fragment. Canonical Sandbox serving needs separately approved deployment. |
| DB pool port | disposable PG18.4, loopback in internal Docker network | qualified isolated DB and approved identity | no connection | No DSN loader or cloud provisioning added. Runtime READ/DML authorization functions required. Production migration authority UNKNOWN. |
| Schema | existing NONDEPLOYABLE candidate applied only to disposable DB | authoritative migrator/history gate missing | UNKNOWN | No new schema contract or final Flyway version. |
| NEXCUT_TIKTOK_TOKEN_KEY_PROVIDER | gcp-kms-envelope parser + synthetic KMS | qualified symmetric KMS envelope | not inspected | Approved Sandbox SDK/identity/secret bindings missing. No key creation/rotation. |
| NEXCUT_TIKTOK_TOKEN_KEY_ID / NEXCUT_TIKTOK_TOKEN_READABLE_VERSIONS | synthetic numeric version | approved enabled symmetric version and readable list | not read | Existing ManagedTokenVault uses LOCAL_TEST custody namespace for staging; this label is not permission to use Production. |
| Firebase Admin / existing server credentials | fake verified claims and synthetic browser cookie | canonical Firebase Admin factory | unchanged | Existing approved Firebase server binding and real normal browser session must be qualified separately. |
| NEXCUT_BETA_ALLOWED_UIDS | synthetic allowed UID | approved operator UID binding | not read | Do not copy tokens/cookies/Authorization headers. |
| Runtime and network authority | LOCAL_TEST or explicit synthetic trusted functions | SERVER_GATED authorize + releaseAuthorization functions | not installed | Environment/request values cannot create these functions. |
| Server bootstrap | synthetic process installs branded composition | createAuthorizedSandboxApplication then installAuthorizedSandboxApplication once per worker | permanently excluded by current gates | No automatic bootstrap, instrumentation, remote registration endpoint or feature auto-enable added. Host/module/worker lifecycle binding remains a release prerequisite. |
| Browser client producer | explicit injected LOCAL_TEST API | future approved client/session-CSRF/navigation producer | disabled | Public page stays UNAVAILABLE. Server routes alone do not enable UI Connect. |

Exact approved server bootstrap shape, not an execution command:

1. Obtain separately approved Sandbox pool, ManagedTokenVault, SERVER_GATED execution object and live-network releaseAuthorization callback. Do not grant authority from env/request alone.
2. In server-only worker bootstrap call createAuthorizedSandboxApplication with those ports, then await installAuthorizedSandboxApplication. It validates canonical Sandbox client binding, staging DB profile, canonical Firebase verifier, managed custody and authority; synthetic LOCAL_TEST applications cannot install into the real route slot.
3. Every Next worker must install the approved application before accepting the authorized flow. Nothing in this mission invokes the live bootstrap. Missing/different environment, missing slot or bootstrap failure => safe 503, no fallback provider.
4. Correct configuration is privately fingerprinted. Changing key/secret/redirect/mode after installation disables resolution. An application cannot be installed twice or forged by copying its fields.

Portal prerequisites: NEXCUT AI Review; saved Login Kit + Content Posting API; user.info.basic + video.publish; canonical callback; Direct Post enabled; owned eligible target account enrollment. Latest Product Owner report says Sandbox configuration/import succeeded. That does not independently prove saved Production draft, active scopes, approval, private posting support or credential/client binding. Production Save UNVERIFIED; review NOT SUBMITTED; demo NOT UPLOADED.

Future exact OAuth checklist:

1. Approve immutable deployment candidate, origin, environment segregation, DB/migrator/schema, symmetric key/identity, worker bootstrap, client producer, normal Firebase browser session and bounded log suppression of code/state/query data.
2. Product Owner supplies masked saved Sandbox product/scope/redirect/Direct Post/target-account evidence. No secrets in report or recording. Import message is insufficient Production-save evidence.
3. Separately authorize browser authorization and exactly bounded callback/code exchange. No upload/publication authority follows. Confirm start origin + session-bound CSRF and empty body, exact redirect and state bindings before redirect.
4. Use normal browser sign-in and genuine Connect interaction; never manually supply real credentials. Verify top-level provider redirect carries intended Firebase session cookie (SameSite/lifetime); mock headers do not prove browser behavior.
5. Successful evidence: durable consumed state, one exchange, owned encrypted envelope, safe server CONNECTED DTO, canonical result redirect. No raw identifiers/tokens/code/state/screenshots of secret pages.
6. Denial/expiry/replay/mismatch/unknown failure stops; no automatic retry, refresh or broader authority. Disconnect local wipe and provider revoke are distinct outcomes.
7. Only after separate authorization the next live API stage is CREATOR_INFO_ONLY. No init, upload or publication follows automatically.
