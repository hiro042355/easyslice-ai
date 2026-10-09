# Sandbox identity qualification — Mission10

Fresh metadata lists enabled nexcut-stg-runtime,nexcut-stg-deployer,nexcut-stg-kms-rotator. No migrator/web/worker-specific identity in returned project list. Successful global Workload Identity Pool list empty in nexcut-staging. Direct project policy has no returned matching staging-service-account binding; this is not effective/inherited-permission absence proof. Key-level MAC roles independently verified. No service account created,role grant,policy change,token request or impersonation.

| Duty | Source/current evidence | Required separation / unqualified |
|---|---|---|
| WEB_RUNTIME | Existing staging runtime is MAC signer/metadata reader; canonical Firebase source uses Production-locked Vercel WIF | Exact Sandbox DB SIU + symmetric custody + secure client secret + approved Firebase session path; current runtime not qualified for all these. |
| WORKER_RUNTIME | Local-only mock provider/LOCAL_TEST loopback pool; enabled defaultfalse | Native/durable worker release not available/authorized; OAuth-only first gate leaves worker/posting off. |
| MIGRATION_OPERATOR | Not returned among3 project identities; existing production operator inert/cloud adapters unavailable | Authoritative SQL schema/history ownership/DDL/ordered manifest needed,UNKNOWN; no reuse of web runtime by default. |
| KEY_ROTATOR | Existing stg rotator version-create/list/metadata on MAC key | Separate approved symmetric-key version lifecycle/old readability; not runtime/deployer/DDL authority. |
| DEPLOYER | Existing stg deployer enabled,reserved in Terraform; no matching direct project-role binding | Immutable host/environment/domain/rollback owner,least-privilege release rights and cost approval unqualified. |
| SECRET_ACCESS | No secret value or secret-store metadata inspected | Approved private Sandbox binding and runtime accessor proof,never downloaded credentials/NEXT_PUBLIC. |

Verified source blocker: lib/server/productionIdentity/vercelWifCredential.ts explicitly requires nexcut-prod-jp-2026,production provider and exact production web-auth account. infra/production/gcp/vercel-wif.tf trusts Vercel environment=production. Setting GCP_PROJECT_ID to staging or using a Preview hostname cannot repurpose that trust. Do not widen IAM/source trust silently or use CLI impersonation as substitute.

Existing supported private dependency injection is a contract,not actual identity establishment. Qualified non-Production federation/Firebase identity path or separately approved canonical shared-auth deployment is an Owner architecture decision. MAC authority cannot imply token-encryption or SQL authority. Effective IAM,trust conditions,SDK initialization,DB login and least-privilege grants remain UNVERIFIED/BLOCKED.
