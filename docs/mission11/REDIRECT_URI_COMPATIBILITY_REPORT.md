# Redirect compatibility
Expected saved callback https://www.nexcutai.com/api/tiktok/oauth/callback; Portal persistence UNVERIFIED.

DNS-only VERIFICATION 2026-10-09: www.nexcutai.com CNAME 687cd6f3c25a9baa.vercel-dns-017.com; A 64.29.17.65 and 216.198.79.65. Initial sandbox command denied access, authorized escalated DNS read succeeded. Resolution proves neither TLS nor route/version. Current valid HTTPS=UNKNOWN; deployed callback=UNKNOWN; Mission10 deployed=UNKNOWN. No Production HTTP/auth/DB/Vercel API read. Historical cleanup not current deployment proof.

Static pinning verified in lib/server/tiktokOAuth/contracts.ts + configCore.ts, tiktokHttp/adapter.ts, tiktokIntegration/service.ts + store.ts, tests/tiktokProductionMigration/NONDEPLOYABLE_oauth_candidate.sql. Existing Firebase WIF Production-bound in productionIdentity/vercelWifCredential.ts and infra/production/gcp/vercel-wif.tf. No URI or trust source changed.

A/B require owner-selected stable nonproduction origin, reviewed narrow code/schema constraints, Firebase authorized-domain/session and separate identity trust, saved Portal redirect. sandbox.example.test is nondeployable placeholder. C NOT_READY: [Web requirements](https://developers.tiktok.com/docs/en/login-kit-web) require registered static HTTPS URI; HTTP localhost/unregistered URLs cannot substitute. Never route canonical Production alias/DNS to laptop or split login/callback across mismatched session origins. Whole UI/auth/start/callback must share approved origin. Future TLS/route/version check needs separate authorization and redacted evidence.
