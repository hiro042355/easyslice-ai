# Runtime identity readiness
IDENTITY_READY=NO for the current application: Production-bound Firebase WIF cannot be treated as a verified nonproduction identity. Fresh three staging service accounts exist/enabled and global WIF list empty. Presence is not effective Firebase/DB/key permission proof. Mission13 direct MAC signer/custom metadata/rotator policies are dated source evidence, not new live role audits. No credential retrieval, impersonation, identity creation or IAM change.

| Role | Existing evidence | Minimum permitted privileges / missing proof |
|---|---|---|
| WEB_RUNTIME | nexcut-stg-runtime@nexcut-staging.iam.gserviceaccount.com exists; current web verifier Production-bound | Exact nonprod Firebase issuer/audience/session/revocation/owner trust; scoped DB DML/key use/secret binding only; no DDL/key administration; effective access UNKNOWN |
| WORKER_RUNTIME | Accepted local MockTikTokWorker only; real worker defaultfalse | No real worker needed for firstOAuth; later operation-specific creator-only authority, owner/generation checks, no cookie/code/token queue; no qualified real identity |
| DATABASE_MIGRATOR | No dedicated qualified identity among enumerated staging accounts; other candidates UNKNOWN | Independent target history/checksum/version/DDL/grants approval; not runtime or inferred Production authority |
| SECRET_MANAGER / key operator | Staging rotator exists but known MAC version role, not token wrapping/binding proof | Dedicated approved binding/version/rotation/recovery administrator; runtime use-only; independent encrypted recovery and revoke policy |
| DEPLOYER | nexcut-stg-deployer@nexcut-staging.iam.gserviceaccount.com exists, effective hosting access UNKNOWN | Exact isolated project/artifact/binding references; no Production aliases, DB ownership or root keys; rollback operator authority missing |

Source Firebase client uses env references (values unread), server uses Vercel OIDC/Production GCP trust. Genuine separate Firebase project/domain/session integration, provider-specific nonprod trust and account free eligibility remain unverified. Do not copy Production secrets or derive authority from flags/requests/reports. Rotation/revocation must preserve bounded pool drain and required decryptable old versions. No runtime/secret credentials provisioned by this plan.
