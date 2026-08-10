# NEXCUT Production Google Cloud foundation

This Terraform root promotes the validated staging KMS foundation into the
Production-only `nexcut-production` authority. The project ID remains a
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

The deployment identity is intentionally unprivileged here. Break-glass remains
a human-controlled, MFA-protected, audited emergency authority and is not
automated. Service-account keys and static credentials are prohibited; use
Application Default Credentials or approved workload identity.

## Exact active-version authority

The MAC CryptoKey creates an initial `HMAC_SHA256` version, but neither its
number nor provider-native primary state is authoritative. Automatic rotation
is disabled. A controlled bootstrap step must validate exactly one eligible
initial version and record its exact fully qualified numeric resource name in
`PROTECTED_IDENTITY_KMS_ACTIVE_VERSION`. The required
`active_crypto_key_version_name` input has no default and rejects aliases,
nonnumeric versions, and cross-key references. Runtime discovery and fallback
are prohibited. Historical versions are not automatically destroyed.

## Boundaries retained for later phases

Cloud Run is not managed here. Its approved future region is
`asia-northeast1`; future wiring must use `nexcut-prod-runtime`, ADC, the
configured parent CryptoKey, the exact active-version configuration, and a
fail-closed readiness gate. It must not receive raw MAC key material or static
credentials.

The approved initial Production monitoring budget is USD 20 equivalent with
25%, 50%, 75%, 90%, and 100% alerts. A budget is monitoring, not a hard cap.
Billing-budget permissions and mutation are outside this root; configure the
budget only through a separately authorized billing authority.

## Validation workflow

Before any separately authorized provisioning:

1. Validate global availability of the exact project and state bucket IDs.
2. Provision and review the state bootstrap root without applying this root.
3. Initialize this root's GCS backend only after the bucket exists.
4. Run `terraform fmt -check`, `terraform validate`, and a reviewed plan.

No Production apply, backend migration, API activation, identity creation, KMS
creation, or billing mutation is authorized by committing this foundation.
