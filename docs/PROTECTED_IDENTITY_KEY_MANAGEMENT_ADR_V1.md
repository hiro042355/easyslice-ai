# Protected Identity Key Management ADR V1

## 1. Status

Accepted on 2026-08-10. This document is the normative V1 Production architecture decision for protected-identity key management. It authorizes a later provider adapter, readiness, and composition Change Set, but does not create cloud resources or change Production code.

## 2. Context

The repository already defines provider-neutral protected-identity contracts, HMAC-SHA-256 algorithm version 1, fixed domain separation, active and historical key-reference semantics, fail-closed behavior, and a deterministic test-only provider. Production requires a concrete cryptographic authority without exposing raw HMAC key material to the application.

## 3. Decision

Adopt Google Cloud Platform as the Production platform, Google Cloud Run as the application runtime, and Google Cloud KMS as the protected-identity cryptographic authority. Use a Cloud KMS MAC key with `HMAC_SHA256`. Production, staging, and preview are isolated environments. Production key authority is inaccessible from preview.

The application invokes MAC operations through a future Production adapter. Key material remains inside Cloud KMS. Google Secret Manager may hold non-cryptographic credentials, but it is not the protected-identity cryptographic key authority.

## 4. Hosting Architecture

Deploy immutable container images as Cloud Run revisions. Use separate GCP projects for Production, staging, and preview. Each environment has independent runtime identity, configuration, key namespace, and readiness. A concrete region is selected during provisioning after data-residency, service-compatibility, latency, and organization-policy validation.

## 5. Key Authority

One environment-local Cloud KMS MAC `CryptoKey` owns protected-identity key versions. The required algorithm is `HMAC_SHA256`; no provider default may substitute another algorithm. Cloud KMS performs MAC generation and verification. The application receives the resulting MAC and non-secret key reference only.

Cloud KMS and Google Secret Manager have distinct responsibilities. Secret Manager must not become the cryptographic key authority or return protected-identity HMAC material to Production application code.

## 6. Active Key Semantics

For GCP Cloud KMS MAC keys, `CryptoKey.primary` is not an active-version authority. The active authority is the NEXCUT environment configuration value containing the approved, fully qualified, numeric `CryptoKeyVersion` resource name under the configured MAC `CryptoKey`. New protected identities use that exact version and persist its non-secret reference. The adapter must not infer the active version from creation time, lexical order, version listing, latest-version lookup, provider-native primary state, or a fallback configuration.

Missing, disabled, invalid, or inaccessible active authority fails closed. No key is generated locally and no previous, test, or default key is substituted.

## 7. Historical Key Semantics

Existing protected identities are processed with the exact fully qualified `CryptoKeyVersion` stored in their key reference. Historical resolution never substitutes the primary, latest, nearest, or another enabled version. A missing, disabled, destroyed, malformed, unauthorized, or unavailable historical version produces the existing neutral provider failure.

Rotation never changes the meaning of an existing protected identity. Historical MAC operations remain within Cloud KMS and do not expose key material.

## 8. Credential Model

Cloud Run uses an environment-specific service identity and Application Default Credentials. Credentials are short-lived and platform-issued. Static service-account JSON keys, long-lived Production cloud credentials, fallback credentials, and deterministic test-provider fallback are prohibited.

Credential issuance, refresh, and revocation remain Google Cloud identity responsibilities. Application code must not implement a parallel credential lifecycle.

## 9. IAM Boundaries

Four identities are separated:

1. The runtime identity may perform the required MAC generation and verification operations and minimum key/version metadata reads on the environment-local key only. It cannot create versions, change active-version configuration, disable or destroy versions, or administer IAM.
2. The deployment identity may deploy Cloud Run revisions and bind the approved runtime identity. It receives no KMS lifecycle or cryptographic-use authority unless a separate audited deployment requirement is approved.
3. The rotation operator may create and validate key versions. The deployment authority controls the reviewed NEXCUT active-version configuration transition. Neither identity has routine destruction authority.
4. The break-glass administrator owns audited emergency disable, recovery, exceptional rotation, and separately approved destruction actions. Strong authentication, explicit approval, and audit evidence are mandatory.

Least privilege applies at project, key ring, key, and version boundaries supported by the provider. Production duties must not be collapsed into one identity.

## 10. Environment Separation

Production, staging, and preview use separate GCP projects, service identities, key rings or equivalent namespaces, MAC keys, configuration, and audit scopes. Preview cannot access Production key authority. Cross-environment key references are invalid and fail closed.

Local and test environments never receive Production credentials or references. Promotion moves immutable application artifacts, not key material or environment identity.

## 11. Startup Semantics

A Production component that requires protected identities must validate provider configuration, the configured MAC key, the explicitly configured exact active version, its ownership by that key, algorithm compatibility, credential availability, and required MAC capability before accepting dependent work. Failure blocks startup of that dependent capability or leaves it unavailable; it never enables a degraded cryptographic mode.

Startup must not log secrets, raw provider responses, credentials, or key material. Safe reference metadata and fixed failure classifications are sufficient.

## 12. Readiness Semantics

Protected-identity readiness is a required additive Production readiness gate. It is true only when provider configuration is valid, the active key reference is resolvable, the expected algorithm and version are compatible, the runtime identity can perform the required operation, and historical exact-version capability is supported.

Provider or key-authority unavailability sets readiness false for dependent capabilities. A cached or previously observed success does not authorize unknown or stale authority. This ADR introduces no cache; any future cache requires an explicit bounded policy that preserves fail-closed semantics.

Readiness evidence contains safe classifications and non-secret references only. It never contains key material, credentials, provider exception bodies, MAC inputs, or MAC outputs.

## 13. Failure Mapping Boundary

The future provider adapter maps provider-specific failures once into the existing neutral classifications:

- `provider-unavailable`
- `key-not-found`
- `key-version-unavailable`
- `invalid-key-reference`
- `crypto-failure`
- `configuration-failure`

Authorization denial that does not prove absence is mapped to a safe unavailable or configuration outcome according to the existing contract boundary; it is never disclosed as raw IAM detail. Downstream layers do not reinterpret, enrich, or infer provider failures. Raw Google API exceptions remain private.

## 14. Rotation Procedure

Routine rotation follows this sequence:

1. The rotation operator creates a new `CryptoKeyVersion` under the approved MAC key.
2. The new version state and `HMAC_SHA256` compatibility are validated.
3. MAC operation, exact historical lookup, and readiness checks pass.
4. The reviewed NEXCUT active-version configuration changes to the exact fully qualified numeric name of the new version.
5. New identities are verified to persist the new exact version reference.
6. The old version remains enabled and readable.
7. Enhanced monitoring continues for at least the rollback observation window.
8. Historical inventory confirms that old-version operations remain available.

Provider-native primary or automatic rotation is not used for the GCP MAC authority. The NEXCUT active-version configuration transition and its evidence remain authoritative.

## 15. Rollback Procedure

The minimum rollback observation window is seven days. If validation or monitoring detects a problem, the deployment authority restores the prior exact fully qualified numeric version in NEXCUT active-version configuration, redeploys or reloads that configuration, reruns readiness, confirms new operations use the restored version, and records the incident and transition evidence.

The seven-day window does not authorize deletion afterward. The former version remains governed by the indefinite historical-retention decision. Rollback never rewrites existing identity references.

## 16. Historical Retention

Retired `CryptoKeyVersion` resources are retained indefinitely by default and remain available for exact historical operations. A version becomes deletion-eligible only when all conditions hold:

1. Production references to the version are proven to be zero.
2. Any required migration is complete.
3. The verification horizon has ended.
4. Historical inventory independently verifies that the version is unnecessary.
5. Security and Data authorities provide two-person approval.

Runtime and routine rotation identities have no destruction permission. Disable and destroy are distinct actions. Scheduled or permanent destruction requires explicit break-glass governance and audit evidence.

## 17. Disaster Recovery

The target is a Google Cloud KMS multi-region deployment, with `asia1` as the first candidate. Before provisioning, Deployment and Security owners must validate data residency, service compatibility, organization policy, quotas, latency, and operational availability. A failed validation does not permit an arbitrary replacement; it requires a documented DR amendment.

The Production key project is separate from application projects. Historical inventory, IAM policy, safe resource identifiers, and active-version authority are auditable and recoverable as configuration metadata. Raw key material is not exported into application backups.

Destructive operations are strongly restricted. Provider or key-authority outage is fail closed. A secondary application deployment capability must be able to use the same approved multi-region key authority without changing identity meaning. Recovery validation covers active and historical versions.

## 18. RPO / RTO Objectives

The architecture objective is RPO 0 for committed key versions and active-pointer authority. This is a NEXCUT objective, not a statement of provider SLA.

The architecture objective is 60 minutes for application or regional recovery. A provider-wide Cloud KMS outage is outside a NEXCUT-only RTO guarantee: dependent capabilities fail closed, readiness remains false, and no insecure replacement authority is introduced.

Provisioning must validate whether the selected region, topology, support plan, and recovery procedure can meet these objectives before Production launch.

## 19. Secret Exposure Policy

Plaintext key material must never be returned to application/domain layers, logged, serialized, placed in diagnostics or telemetry, persisted, exposed through API or UI, or copied into environment configuration. MAC inputs and results receive only the handling required by their existing contracts.

Errors contain fixed safe classifications. Credentials and provider response details remain inside the provider boundary. Memory lifetime for any sensitive transient provider data is minimized. No fallback key, empty key, random local key, or test key is valid in Production.

## 20. Local and Test Separation

The deterministic provider remains test-only and outside Production exports, dependency graphs, composition, and bundles. Local tests may use that provider without claiming cloud integration. Production-like tests may use an authoritative fake client but must be reported separately from live Cloud KMS validation.

Local cloud access, when explicitly required, uses a non-Production identity and non-Production key project. Local environment secrets never select or override Production authority.

## 21. Consequences

- The next authorized Change Set may add a Google Cloud KMS provider adapter, provider configuration, readiness validation, and Production composition wiring.
- Cloud KMS becomes an online dependency of protected-identity projection and historical verification.
- The exact `CryptoKeyVersion` reference becomes durable continuity evidence.
- Strong IAM separation and indefinite historical retention reduce deletion risk but add operational governance.
- Provider latency, quotas, availability, and per-operation cost require Production-like and live validation.
- The provider-neutral domain contract, algorithm version, domain separation, and failure boundary remain unchanged.

## 22. Rejected Alternatives

- AWS ECS Fargate with AWS KMS HMAC keys is viable but rejected for V1 because HMAC rotation requires distinct-key manual rotation and is less direct than the approved `CryptoKeyVersion` model.
- Azure Container Apps with Azure Managed HSM is viable but rejected for V1 because its dedicated HSM operational and cost profile is disproportionate to the initial deployment.
- Vercel with external cloud KMS is rejected for V1 because cross-provider identity exchange, readiness, latency, and failure surfaces are unnecessary when Cloud Run and Cloud KMS can share one authority boundary.
- Environment-injected HMAC secrets and platform environment variables are rejected because they expose raw key material to the application and weaken exact historical lifecycle authority.
- Google Secret Manager is rejected as the protected-identity cryptographic authority; it remains appropriate only for separate non-cryptographic credentials.
- A custom vault or self-hosted HSM is rejected because it adds unapproved infrastructure and operational ownership.

## 23. Remaining Deployment-Time Validations

Architecture-level Production-blocking open decisions are zero. The following are provisioning parameters and validation evidence, not architecture alternatives:

- GCP organization, billing account, Production/staging/preview project IDs, and resource names.
- Concrete Cloud Run region after data-residency and service-compatibility review.
- Confirmation that `asia1` satisfies residency, organization policy, quota, latency, and service requirements.
- Concrete service-account names, IAM bindings, key ring and MAC key names, and audit destinations.
- Support plan, budget, KMS quota, expected operation volume, latency target, and alert thresholds.
- Secondary deployment location and exercised recovery runbook.
- Evidence that RPO 0 and 60-minute application/regional RTO objectives are achievable.
- Live Cloud KMS validation, rotation drill, rollback drill, historical lookup drill, permission-denial tests, and deletion-protection review.

Failure of a deployment-time validation blocks Production provisioning or requires an explicit amendment. It does not authorize fallback, silent provider replacement, algorithm change, weaker IAM, or key-material exposure.

## References

- [Cloud KMS MAC signing](https://docs.cloud.google.com/sdk/gcloud/reference/kms/mac-sign)
- [Cloud KMS key creation and `HMAC_SHA256`](https://docs.cloud.google.com/kms/docs/create-key)
- [Cloud KMS key management](https://docs.cloud.google.com/kms/docs/key-management-service)
- [Cloud KMS key-version destruction and restoration](https://docs.cloud.google.com/kms/docs/destroy-restore)
- [Cloud KMS locations](https://docs.cloud.google.com/kms/docs/locations)
- [Cloud Run service identity and Secret Manager integration](https://docs.cloud.google.com/run/docs/configuring/services/secrets)
