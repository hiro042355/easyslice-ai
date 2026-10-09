# Deployment preflight — Mission10 (no deploy)

VERIFIED static/local evidence: primary app easyslice-ai is linked in original .vercel/project.json (project/org IDs present,projectName easyslice-ai; no env/credentials read). Source uses Next16.2.7,nodejs TikTok routes,root instrumentation,canonical https://www.nexcutai.com callback and Vercel OIDC. Mission09 is a branch checkpoint,not evidence of a deployed version. No Vercel API/dashboard/domain/HTTPS request made; current deployed commit,alias,TLS/health/ownership/plan UNKNOWN. Historical user deployment evidence is not fresh verification.

| Requirement | Verified contract / remaining preflight |
|---|---|
| Host/source/domain/HTTPS | Vercel/local link and expected canonical HTTPS known; actual immutable deployment/alias/certificate approval pending. |
| Next runtime | TikTok routes nodejs; Edge cannot start worker; strict disabled-default instrumentation. |
| Callback | Current source exactcanonical GET; source build does not show Mission09/10 on live domain. |
| DB | Approved persistent non-Production pool,target,role,schema,TLS/network/connect/reconnect required; API inventory blocked. |
| KMS | Approved symmetric version/runtime get+encrypt+decrypt/SDK required; inspected MAC unusable. |
| Firebase | Canonical factory uses Production-locked WIF; Preview/staging cannot reuse by changing project/hostname. |
| Worker | Local-only mocked runtime; worker/posting stayfalse for OAuth-only deployment; no automatic publishing. |
| Secrets/flags | Private approved server bindings; no NEXT_PUBLIC token/clientsecret; application/SDK authority cannot arise from env alone. |
| Bootstrap | Existing factories/installers inert; every Node instance must receive approved private ports before UI-enabled instrumentation resolves slot. No live loader is registered by default. Env-only deployment will not make it ready. |
| Health | Build/local actual-handler tests only. After separate deployment authorization require immutable health/legal/safe unavailable/owned bootstrap receipts,not token/probe improvisation. |
| Logs/monitoring | Fixed source errors/audits; actual hosting query-string/header redaction,access/monitoring/retention unverified. |
| Rollback/owner | Approved immutable predecessor,alias/flag/native-authority kill procedure and operator owner required; no rollback executed. |
| Costs | Existing plan/capacity unknown; compute/storage/backups/IP/egress/KMS/secret/hosting charges need approved quote/budget. No numeric cost or free-resource assumption; no billing/resource change. |

Architecture choices:

A CANONICAL_CONTROLLED: retain current canonical callback and code. Serving new code there is a Production routing/deployment change and requires explicit separate approval plus approved shared Firebase path; not an isolated staging release merely because TikTok credentials are Sandbox. No current authority to do this.

B ISOLATED_NON_PRODUCTION_HOST: suitable for isolation only after explicit domain/HTTPS/Portal redirect/Firebase-domain/federation/SDK/schema/secret/rollback qualification. Current code and SQL candidate deliberately pin canonical URI: tiktokOAuth/contracts+configCore,tiktokHttp/adapter,tiktokIntegration/service+store and NONDEPLOYABLE candidate redirect constraint. A Preview URL cannot silently replace it. No allowlist/source/SQL/DNS/Portal trust was changed. Owner must select one exact staging origin and separately approve coordinated adaptation,not an arbitrary redirect parameter.

Vercel distinguishes Preview and Production environments; custom environment/domain/protection/plan availability must be qualified for the selected project. [Official environments](https://vercel.com/docs/deployments/environments). Deployment protection may obstruct an external callback; do not bypass protections without reviewed authority.

Preflight sequence (not executed): choose origin/environment -> qualify DB/migrator/key/identity/private bindings -> source/Portal/Firebase URI consistency -> per-instance bootstrap/artifact/provider readiness -> reviewed build/flags/native-operation allowlist/log redaction -> explicit deployment+rollback approval -> bounded actual HTTPS/alias/health evidence -> separate OAuth authorization. No deploy/DNS/settings/Production access performed.
