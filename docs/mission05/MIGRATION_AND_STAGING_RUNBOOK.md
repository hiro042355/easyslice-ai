# Mission 05 migration authority and Staging qualification

Prepared 2026-10-09. These are executable procedures for a FUTURE independently authorized operator, not permission to execute now. No GCP/DB/impersonation command in this document was run. Production history, migrator identity/DDL authority, final version and authorized execution path remain UNKNOWN.

## Production read-only authority procedure

1. Obtain approval naming exact project/instance/database, migrator login, operator, allowed read-only queries, bounded evidence and timeout. Do not use runtime identity as migrator authority and do not inherit default CLI target.
2. Run authority-discovery.sql only. Confirm exactly one independently authoritative history location and expected Flyway column shape. Repository evidence uses workflow.flyway_schema_history; table presence alone does not establish authority. If location differs, stop and review the exact query target.
3. Run authority-privileges.sql under that approved migrator, not a guessed/bootstrap identity. Record only approved booleans, bounded schema classifications and identity/target-match receipt; keep raw identifiers in the authorized private operator context. Never reveal DSNs, tokens, cookies or credentials.
4. Only after location/shape/identity approval, run authority-history.sql. Preserve all installed versions/checksums/success/order evidence. Limit 1001 plus total count detects truncation; >1000 means unresolved until a separately bounded continuation is approved.
5. Compare authoritative versions/checksums to committed V000001–V000008, every original development-only V000009–V000025, and the NONDEPLOYABLE candidate manifest. Include failed, missing, future, out-of-order, duplicate descriptions/versions and checksum mismatches. Never choose V9/V26 from a filename maximum. Final version UNKNOWN until all collisions are resolved.
6. Candidate CREATE SCHEMA tiktok_oauth needs database CREATE if absent. createSchemas=false disables Flyway automatic schemas, not the explicit candidate DDL. Existing schema/table ownership and GRANT authority must be approved. Terraform defines separate runtime/migrator/bootstrap identities and Cloud SQL client/instanceUser roles; these are desired-state definitions, not proof of applied PostgreSQL privileges.
7. Approve one exact version/inventory/checksum/actor/path; qualify it in separately authorized Staging. Production execution then needs a distinct one-shot migration gate. Preserve createSchemas=false, baselineOnMigrate=false, cleanDisabled=true, outOfOrder=false, validateOnMigrate=true, ignoreMigrationPatterns=*:pending, lockRetryCount=0 and connectRetries=0. No repair/clean/baseline/automatic rerun.

Rollback is application feature disable and separately approved immutable application rollback; preserve schema/history and ambiguous publication IDs. No destructive down migration, history editing, key destruction or token restoration without a distinct recovery decision.

## Staging prerequisites and exact read-only inventory commands — NOT RUN

Expected project nexcut-staging. Earlier evidence said SQL Admin API disabled; current API/instance/IAM state is NOT_REVERIFIED. Existing Terraform under infra/production/gcp targets Production and must not be applied or repurposed as Staging by changing the default project.

```
gcloud projects describe nexcut-staging --format="json(projectId,lifecycleState)"
gcloud services list --enabled --project=nexcut-staging --filter="config.name:sqladmin.googleapis.com" --format="value(config.name)"
gcloud sql instances list --project=nexcut-staging --format="json(name,region,databaseVersion,state,connectionName,settings.databaseFlags)"
gcloud iam service-accounts list --project=nexcut-staging --format="json(email,disabled)"
```

Each command requires the future operator's approved read-only scope. Any permission/API error is UNKNOWN, never proof of empty inventory. Confirm project exactly, PostgreSQL/version/region/state, IAM-auth flag, approved instance/database, existing test/migrator/runtime identities and source of identity receipts. Do not print connection names/account identities publicly.

API enablement, new instance/user/resource and IAM changes are separate Product Owner/budget/cloud-owner gates. No enable/create/patch/add-iam-policy command is authorized or run here. Reuse an existing qualified Staging instance where possible; if none exists, approval must specify tier/region/storage/backups/IP, budget cap, lifetime and cleanup owner. Stopping compute does not necessarily eliminate retained storage/IP/backup cost; deletion/deletion-protection changes are separate approval decisions.

## IAM/proxy qualification after separate authorization — NOT RUN

Operator needs approved impersonation on the exact Staging service account (iam.serviceAccounts.getAccessToken, normally roles/iam.serviceAccountTokenCreator scoped to that account). Service account needs cloudsql.instances.connect and cloudsql.instances.login (typically Cloud SQL Client and Instance User), an existing IAM database user and least-privilege PostgreSQL grants. IAM login is not DDL authority. Runtime must lack schema/database creation and owner membership. A migration role needs independently proven DDL/history privileges. Never use a downloaded service-account JSON key.

Pinned proxy artifact must be independently verified against operator tooling manifest (Cloud SQL Auth Proxy v2.26.0); select only approved Staging connection name and unused loopback port. Future command template:

```
cloud-sql-proxy --auto-iam-authn --impersonate-service-account=<approved-staging-service-account> --address=127.0.0.1 --port=<approved-loopback-port> <approved-staging-connection-name>
```

This template is deliberately non-executable until exact target/identity/port are approved. Do not execute impersonation in this mission. Use approved IAM database username (service-account suffix mapping per official docs), never a printed access token. Verify encrypted connector path, current/session identity, SELECT 1, read-only transaction enforcement, actual runtime DDL denial, migrator/history privileges and token refresh/reconnection beyond the token lifetime under the approved rehearsal. Do not assume proxy/JDBC documentation compatibility proves an actual Flyway identity path.

Failure: stop on target/identity mismatch, API disabled, denied login, missing user/grants, privilege mismatch, checksum/history mismatch, refresh failure or unknown outcome. No retries that mutate state. Cleanup stops only the owned proxy process/temporary containers, closes sessions and erases approved local ephemeral credential material; preserve bounded redacted receipts. Never delete a shared instance, revoke IAM or change database grants without separate cleanup authority.

Official references checked 2026-10-09: https://docs.cloud.google.com/sql/docs/postgres/iam-authentication, https://docs.cloud.google.com/sql/docs/postgres/iam-logins, https://docs.cloud.google.com/sql/docs/postgres/sql-proxy, https://github.com/GoogleCloudPlatform/cloud-sql-proxy. No cost estimate or applied-state claim is fabricated.
