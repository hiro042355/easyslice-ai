# Mission 06 authoritative environment qualification

Observed 2026-10-09. Baseline 060229fcb4a3d2aed6e3bf2921fb27eb5e8d47a2; parent dbd5baaea08195ce94255b255751dde8b916ed02; tree 5eda2ba87f64e1c0007286eff2dfe2b43edee370. Origin/default main/dedicated remote verified: hiro042355/easyslice-ai, main f3873fb294bbc11974ca180dea10fa711c49d436, mission05 remote 060229fcb4a3d2aed6e3bf2921fb27eb5e8d47a2. Mission06 will not push or deploy.

OBSERVED_EVIDENCE.json contains bounded/redacted resource observations. All gcloud operations were get/list metadata using the existing account with auth/impersonate_service_account and credential_file_override unset and related override environment variables absent. No login, service-account impersonation, credential creation, access-token output, resource/IAM mutation, API enablement or Production secret retrieval occurred. Metadata visibility is not PostgreSQL authority.

## A/B. Production history and DDL — stopped before any query

The previously approved one-shot DB probe was completed and then its flag removed and route cleaned up. The accepted source has no production-db-authority-probe route. There is no available previously approved current read-only SQL connection/adapter in this task; direct runtime composition would establish a new connection and/or require forbidden Production impersonation/credential setup. The old one-shot result proved connectivity/schema/history table presence, not history versions/checksums or migrator privileges. It cannot be retried or upgraded to authority.

PRODUCTION_DB_READ_ONLY_QUERIES=0. No advisory locks, app records, Flyway command, DDL/DML, new route or access workaround. MIGRATION_HISTORY_AUTHORITY=UNKNOWN; DDL_PRIVILEGE_AUTHORITY=UNKNOWN; FINAL_MIGRATION_VERSION=UNKNOWN.

Actual allowed GCP metadata: Production PostgreSQL18 instance RUNNABLE in asia-northeast1; connector enforcement REQUIRED; cloudsql.iam_authentication=on. Migrator/runtime/bootstrap are registered CLOUD_IAM_SERVICE_ACCOUNT users; the registered migrator has project Cloud SQL Client and Instance User bindings. These observed bindings/registration do not prove effective PostgreSQL schema/table ownership, database CREATE, history SELECT/ALTER authority, successful IAM login, token refresh or authoritative history. Conditions/effective grant paths and intended PostgreSQL session identity remain unqualified.

Additional proof needed: independently approved existing read-only session bound to exact target/migrator; read-only transaction/statement deadline; verified database/schema/search_path/history relation/shape; complete bounded versions/checksums/success/order and configured locations; current/session identity receipt, CONNECT/CREATE/USAGE/ownership/history permissions; collision comparison with committed V1–V8 and original development-only V9–V25. Prepared discovery/history/privilege SQL lives in docs/mission05; no query was executed. No V9/V26 reservation or deployable migration was created. Prefer the authorized DBA returning bounded redacted observations from an already approved session; do not ask for secrets or invent a new agent access route.

## C. Staging — BLOCKED, not an empty-instance proof

OBSERVED nexcut-staging ACTIVE. Successful enabled-service inspection returned no sqladmin.googleapis.com entry: SQL Admin API DISABLED. Stop rule applied: no SQL instance/user API request, enablement or workaround was attempted in Staging. Instance/database/IAM authentication/DDL/token-refresh qualification remain UNKNOWN. Service-account metadata lists enabled runtime/deployer/rotator classifications; no migrator in the inspected list. Do not infer that another identity or instance cannot exist.

INFERRED: a separately approved API/target/identity qualification is needed before the existing staged rehearsal can run. Existing Terraform is Production-specific and cannot be applied to Staging by assuming the default project. No paid resource created, impersonation run, IAM grant changed or cloud cost introduced. Exact future commands, permissions, bounded cost/cleanup/failure decisions remain in docs/mission05/MIGRATION_AND_STAGING_RUNBOOK.md.

## D. Managed key readiness

Code READY_FOR_CONFIGURATION; actual Production configuration BLOCKED/UNVERIFIED. OBSERVED Cloud KMS API enabled; the declared Production identity keyring contains MAC purpose key(s), with an ENABLED HMAC_SHA256 version. No ENCRYPT_DECRYPT key was observed in that inspected ring. Other rings were not inspected, so absence across the project is not claimed. Existing MAC key cannot encrypt token DEKs; do not reuse it or create another key under this mission.

Required config: NEXCUT_TIKTOK_TOKEN_KEY_PROVIDER=gcp-kms-envelope, NEXCUT_TIKTOK_TOKEN_KEY_ID=<approved explicit symmetric CryptoKeyVersion>, NEXCUT_TIKTOK_TOKEN_READABLE_VERSIONS=<approved active/old versions>. Actual deployed environment presence/values were not read. Explicit approved SDK/WIF client and key-version get/useToEncrypt/useToDecrypt permissions are needed; no default ADC inference. Production namespace/version/algorithm/state validation, rotation/old readability, authenticated AAD, wrapped per-message DEK, zeroization and fixed redacted failure/audit behavior are preserved and tested with synthetic keys. Provisioning/IAM/release callbacks/migration/runtime identity/deployment each need separate authority. Rollback disables features and preserves readable old keys/ciphertext; no automatic destruction, re-encryption or schema reversal.

## E. Portal — UNVERIFIED

Browser inventory exposed only in-app/MCP browser surfaces with no existing Portal tabs; native computer control was unavailable. No login/credential dialog, secret reveal, Portal mutation or auth navigation was attempted. Prior Product Owner observations (Login Kit/Content Posting configured; Direct Post OFF; Production Draft; Sandbox Limited) are historical, not current confirmation.

Current app/client/environment/domain/redirect/products/scopes/test-user limits/review/audit remain UNVERIFIED. Exact operator checklist remains docs/mission05/PORTAL_AND_REAL_TEST_RUNBOOK.md: verify NEXCUT AI/environment, canonical domain/legal links, exact static HTTPS callback, Login Kit, Content Posting/Direct Post prerequisites, only user.info.basic/video.publish, eligible dedicated test account and genuine Sandbox demo/audit. No video.upload request, Portal change or submission.

## H. Two concrete local corrections

Official Login Kit documents callback scopes and error_description. The previous strict query allowlist rejected them, preventing a documented real callback even with valid state. New bounded parser accepts only documented keys, rejects duplicates/unknown redirects and incompatible scope echo, discards provider text, and leaves token-response scopes authoritative. Invalid echo/denial terminalizes the claimed state without exchange. Session/app/environment/state binding and deployed route disable remain intact.

Disconnect previously attempted token decrypt before invalidating local custody. Key unavailability/tampering could therefore block disconnect. Verified metadata-only connection/disconnect paths now authenticate and authorize without demanding encryption-key health; disconnect always invalidates the owned state/grants and erases the envelope even if token recovery fails. Native revocation is not attempted without a recovered token and its completion is not claimed. Posting/start/callback still require custody/key readiness. This is a local fail-closed correction, not a Production mutation or authentication replacement.

## Exact next approval requests — none granted by this report

1. DATABASE_AUTHORITY: approved DBA/existing read-only session executes only prepared bounded metadata SQL and returns redacted authoritative history/DDL/identity proof. No new connection path or secret sharing implied.
2. INFRASTRUCTURE: Product Owner/cloud owner separately approves Staging SQL API enablement, then read-only inventory/identity qualification; any instance/IAM/user/cost action requires its own scoped budget/cleanup approval.
3. KEY_CONFIGURATION: confirm an existing suitable symmetric key or explicitly authorize provisioning/least-privilege IAM/SDK client/configuration, preserving old versions. Do not supply credentials in chat.
4. TIKTOK_PORTAL: Product Owner supplies current masked/read-only configuration evidence; changes/submission remain separate approval gates.
5. PRODUCT_OWNER_DECISION: approve genuine device FILE_UPLOAD source, UX/retention/legal decisions in MEDIA_CONSENT_RETENTION.md. PULL_FROM_URL stays deferred.
6. LIVE_GATE: approve OAuth prerequisite G1/G2 independently if needed; first Content Posting network gate is G3 Creator Info ONLY. No init/upload/post authority follows from that gate. G4/G5/G6 require later distinct decisions.
7. RELEASE: exact immutable source/schema/key/config receipts and separately approved deployment/feature callbacks are required before any actual stage. Current default routes/UI remain disabled.

Executed local acceptance: 308 host tests plus 96 real disposable PostgreSQL tests = 404 PASS, zero skips/failures. The five new integrated cases cover documented callback scopes/denial and unavailable-key/tampered-envelope disconnect. Strict focused ES2017 and repository typecheck PASS (0); actual Next.js webpack/TypeScript/static production build PASS under sanitized environment/public-font-only network. Focused lint PASS; repository baseline remains 30 errors/48 warnings. B7 pinned artifact verification and migration candidate byte integrity are unchanged. Local application audit captures only committed fixture row changes; no Production SQL or DB connection occurred. These tests do not upgrade actual authority/Portal/key availability.
