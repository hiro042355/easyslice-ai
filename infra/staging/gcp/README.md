# NEXCUT staging Google Cloud foundation

This Terraform root is restricted to the `nexcut-staging` project. It uses
Application Default Credentials and must never receive a credential file,
token, or service-account key.

## Scope

- Enable only Resource Manager, IAM, Service Usage, and Cloud KMS APIs.
- Create the runtime, deployment, and rotation service accounts.
- Create the `asia1` protected-identity MAC key authority.
- Grant runtime MAC signing and exact metadata-read access.
- Grant rotation-only version creation and inspection.

The deployment identity is intentionally unprivileged in this foundation.
Break-glass access remains a human-controlled, MFA-protected deployment-time
authority and is not represented as a service account.

Cloud Run, Production resources, automatic key rotation, key destruction,
service-account keys, and application deployment are out of scope.

## Controlled version semantics

The MAC CryptoKey creates its initial `HMAC_SHA256` version through the Cloud
KMS resource. No automatic rotation period is configured. Later version
creation belongs to the rotation identity. Historical numeric CryptoKeyVersion
resource names remain addressable; this root does not disable or destroy them.

The `kms_crypto_key_name` output identifies the parent key. GCP MAC keys do not
use `CryptoKey.primary` as NEXCUT authority. The application additionally
requires `PROTECTED_IDENTITY_KMS_ACTIVE_VERSION`, whose value is an exact fully
qualified numeric CryptoKeyVersion resource name under that parent key.
Aliases, provider-native primary state, and `latest` are not configuration
authorities.

## Initial active-version bootstrap

After the first separately authorized apply, a controlled deployment-time step
lists versions under exactly the `kms_crypto_key_name` output. It must require
exactly one initial version, require a numeric fully qualified name, state
`ENABLED`, and algorithm `HMAC_SHA256`. The verified name is then recorded as
`PROTECTED_IDENTITY_KMS_ACTIVE_VERSION`. Zero matches, multiple matches, or any
metadata mismatch stop bootstrap. Runtime application code never lists or
selects versions.

Rotation creates and validates a new exact version, validates MAC signing and
readiness against it, then updates the reviewed NEXCUT configuration authority.
Rollback restores the prior exact version in that configuration. Previous
versions remain enabled during the observation window and for historical use.

## Review workflow

Run from this directory:

1. `terraform fmt -check`
2. `terraform init`
3. `terraform validate`
4. `terraform plan -out=staging.tfplan`
5. `terraform show staging.tfplan`

Review the complete plan before a separately authorized apply. Do not run
`terraform apply` as part of this foundation change.

Until a staging remote-state architecture is separately approved, the first
controlled apply may use temporary local state. Local state and plan files are
excluded from Git and must not be copied into the repository. No Production
backend is configured or implied by this foundation.
