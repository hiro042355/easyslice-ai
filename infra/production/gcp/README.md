# NEXCUT Production Google Cloud foundation

This Terraform root promotes the validated staging KMS foundation into the
Production-only `nexcut-prod-jp-2026` authority. The project ID remains a
candidate until external global availability validation succeeds. This root
does not create the project or link billing and must never silently rename it.
The externally approved project name is `NEXCUT Production`, and the approved
billing account is `01E8C0-25438D-D384CE`; both remain outside this root so no
project or billing mutation can occur through the KMS foundation.

## Bootstrap and remote state

The separate `bootstrap/state` root owns the candidate
`nexcut-production-tfstate` bucket. Its availability must also be validated
externally. Bootstrap uses controlled temporary local state; that local state
must be secured outside Git and removed only after verified recovery evidence
exists. The workload root consumes the GCS backend at prefix
`production/gcp-foundation` only after the bucket is provisioned by a separately
authorized operation. Do not initialize or migrate this backend before then.

## Foundation scope

- Enable only Resource Manager, IAM, Service Usage, and Cloud KMS APIs.
- Create separate runtime, deployment, and rotation service accounts.
- Create the `asia1` protected-identity MAC key authority.
- Grant runtime MAC signing and exact metadata-read access.
- Grant rotation-only version creation and inspection.
- Enable Artifact Registry and create the private `nexcut-production` Docker
  repository in `asia-northeast1`.
- Grant repository-scoped image publication only to `nexcut-prod-deployer`.
- Enable Cloud Run and define one private `nexcut-production` service in
  `asia-northeast1` from the reviewed immutable image digest.
- Run as `nexcut-prod-runtime`, with zero minimum and two maximum instances,
  one CPU, 1 GiB memory, concurrency 20, and a 300-second request timeout.
- Gate startup on `/api/health/ready`, which reuses the Production KMS provider
  metadata and real MAC probe; keep `/api/health/live` independent of KMS.
- Create a zonal Cloud SQL Enterprise PostgreSQL 18 instance in
  `asia-northeast1` using `db-custom-1-3840`, 10 GiB SSD with automatic growth,
  automated backups, seven-day PITR logs, deletion protection, IAM database
  authentication, and required Cloud SQL Connector enforcement. No authorized
  network is configured.
- Create separate keyless runtime and migration service accounts and IAM
  database users. Google IAM permits connection and login; schema grants remain
  an explicit migration-bootstrap responsibility and are not runtime authority.
- Create one private regional Production media bucket with uniform bucket-level
  access and public access prevention. The runtime receives bucket-scoped
  `roles/storage.objectUser`, not project-wide storage administration.
- Delete only intermediate objects carrying an explicit custom-time after seven
  days. Input and durable output objects must omit custom-time and are therefore
  outside the lifecycle deletion rule.

Production deployment authority is an immutable image digest in the form
`asia-northeast1-docker.pkg.dev/nexcut-prod-jp-2026/nexcut-production/nexcut-app@sha256:<digest>`.
Tags may aid operators but are never deployment authority. Automatic cleanup
is intentionally deferred: the deployed digest and rollback-worthy images must
not be deleted, and the initial retention target is the most recent ten tagged
or referenced Production images. The repository is private; neither public
principals nor the runtime service account receive writer access.

The deployment identity is intentionally unprivileged here. Break-glass remains
a human-controlled, MFA-protected, audited emergency authority and is not
automated. Service-account keys and static credentials are prohibited; use
Application Default Credentials or approved workload identity.

## Exact active-version authority

The MAC CryptoKey creates an initial `HMAC_SHA256` version, but neither its
number nor provider-native primary state is authoritative. Automatic rotation
is disabled. Production bootstrap has two distinct authorities. Infrastructure
creation authority may create the pre-runtime KMS foundation while
`active_crypto_key_version_name` is null. After that apply, a controlled
bootstrap step must inspect only this Production CryptoKey, require exactly one
eligible `ENABLED` `HMAC_SHA256` initial version, and record its exact fully
qualified numeric resource name in `PROTECTED_IDENTITY_KMS_ACTIVE_VERSION`.

Runtime active authority is separate and mandatory: every future Cloud Run or
runtime resource must require `active_crypto_key_version_name` to be non-null
before deployment and must wire that exact value to
`PROTECTED_IDENTITY_KMS_ACTIVE_VERSION`. When non-null, the input rejects
aliases, nonnumeric versions, and cross-key references. The
`kms_active_crypto_key_version_name` output is null only during pre-runtime
foundation bootstrap and otherwise equals the explicitly configured version.
This two-phase sequence is not fallback or runtime discovery. Historical
versions are not automatically destroyed.

## Private Cloud Run authority

Cloud Run ingress accepts the managed service endpoint so an explicitly
authorized human can perform authenticated validation. Invocation remains
private: this root grants `roles/run.invoker` only to
`cloud_run_invoker_member`, never to `allUsers` or `allAuthenticatedUsers`.
The service uses ADC through `nexcut-prod-runtime`; it receives only the
non-secret parent CryptoKey name and exact numeric active version. It receives
no raw MAC key material, static credential, Gemini, OAuth, or YouTube secret.

The deployment identity receives Cloud Run Developer and service-account-user
authority only. It receives no KMS lifecycle authority. This commit defines
the service and its IAM but does not authorize `terraform apply`.

The approved initial Production monitoring budget is USD 20 equivalent with
25%, 50%, 75%, 90%, and 100% alerts. A budget is monitoring, not a hard cap.
Billing-budget permissions and mutation are outside this root; configure the
budget only through a separately authorized billing authority.

## Future durable-storage application composition

The ownership application phase consumes only server-side configuration:
`MEDIA_BUCKET_NAME`, `CLOUD_SQL_INSTANCE_CONNECTION_NAME`, `POSTGRES_DATABASE`,
`POSTGRES_IAM_USER`, and dedicated media WIF/service-account configuration.
None may use a `NEXT_PUBLIC_` name. The Cloud SQL Node.js Connector must provide
the connection transport and short-lived IAM authentication; no runtime
database password or service-account key is permitted.

## Database migration authority

The approved human operator may obtain short-lived credentials for only
`nexcut-prod-db-migrator`. That service account has Cloud SQL connector and IAM
database login authority; it is separate from the media runtime identity and
has no static key.

Database and schema ownership are not granted through project IAM. Before the
first Production Flyway run, the existing database owner must grant the
migrator only the database/schema privileges required to create and migrate the
`workflow` schema. The media runtime must remain DML-only and must never receive
schema ownership, migration authority, `CREATE ROLE`, or `CREATE DATABASE`.

## Validation workflow

Before any separately authorized provisioning:

1. Validate global availability of the exact project and state bucket IDs.
2. Provision and review the state bootstrap root without applying this root.
3. Initialize this root's GCS backend only after the bucket exists.
4. Run `terraform fmt -check`, `terraform validate`, and a reviewed plan.

No Production apply, backend migration, API activation, identity creation, KMS
creation, or billing mutation is authorized by committing this foundation.
