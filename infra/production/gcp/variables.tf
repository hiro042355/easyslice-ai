variable "project_id" {
  description = "The Production-only Google Cloud project authority. The candidate must be externally validated before provisioning."
  type        = string
  default     = "nexcut-prod-jp-2026"

  validation {
    condition     = var.project_id == "nexcut-prod-jp-2026"
    error_message = "This Terraform root is Production-only and must target nexcut-prod-jp-2026."
  }
}

variable "kms_location" {
  description = "The approved Cloud KMS multi-region location. This is not a Cloud Run region."
  type        = string
  default     = "asia1"

  validation {
    condition     = var.kms_location == "asia1"
    error_message = "The approved Production KMS location is asia1."
  }
}

variable "cloud_run_region" {
  description = "The approved Production Cloud Run region."
  type        = string
  default     = "asia-northeast1"

  validation {
    condition     = var.cloud_run_region == "asia-northeast1"
    error_message = "The approved future Production Cloud Run region is asia-northeast1."
  }
}

variable "cloud_sql_region" {
  description = "The approved Production Cloud SQL region."
  type        = string
  default     = "asia-northeast1"

  validation {
    condition     = var.cloud_sql_region == "asia-northeast1"
    error_message = "The approved Production Cloud SQL region is asia-northeast1."
  }
}

variable "media_bucket_name" {
  description = "Globally unique Production media bucket authority."
  type        = string
  default     = "nexcut-prod-jp-2026-media"

  validation {
    condition     = can(regex("^nexcut-prod-jp-2026-media(?:-[a-z0-9]+)?$", var.media_bucket_name))
    error_message = "The Production media bucket must use the approved name or a minimal deterministic suffix."
  }
}

variable "production_image" {
  description = "Immutable Production container image authority containing the KMS-backed readiness gate."
  type        = string
  default     = "asia-northeast1-docker.pkg.dev/nexcut-prod-jp-2026/nexcut-production/nexcut-app@sha256:b0d5fb9fe0d3425e218077be389996325c6f730cad7c0c384ffc5fb2367f6b7e"

  validation {
    condition     = var.production_image == "asia-northeast1-docker.pkg.dev/nexcut-prod-jp-2026/nexcut-production/nexcut-app@sha256:b0d5fb9fe0d3425e218077be389996325c6f730cad7c0c384ffc5fb2367f6b7e"
    error_message = "Production Cloud Run must use the reviewed immutable KMS-readiness image digest."
  }
}

variable "acquisition_worker_image" {
  description = "Immutable Production Acquisition Worker container image authority."
  type        = string
  default     = "asia-northeast1-docker.pkg.dev/nexcut-prod-jp-2026/nexcut-production/nexcut-acquisition-worker@sha256:8f702cec3d83d19fbc06574ad1c9c09bf5932f818c32d039077134b327e0309d"

  validation {
    condition     = var.acquisition_worker_image == "asia-northeast1-docker.pkg.dev/nexcut-prod-jp-2026/nexcut-production/nexcut-acquisition-worker@sha256:8f702cec3d83d19fbc06574ad1c9c09bf5932f818c32d039077134b327e0309d"
    error_message = "The Acquisition Worker must use an immutable digest from the approved Production Artifact Registry."
  }
}

variable "acquisition_provider_image" {
  description = "Immutable bgutil PO Token provider sidecar image authority."
  type        = string
  default     = "asia-northeast1-docker.pkg.dev/nexcut-prod-jp-2026/nexcut-production/nexcut-bgutil-provider@sha256:dde367547487b7458109508c69dbf8533f53d006b81d2616081095374d74d5f2"

  validation {
    condition     = var.acquisition_provider_image == "asia-northeast1-docker.pkg.dev/nexcut-prod-jp-2026/nexcut-production/nexcut-bgutil-provider@sha256:dde367547487b7458109508c69dbf8533f53d006b81d2616081095374d74d5f2"
    error_message = "The bgutil provider must use an immutable digest from the approved Production Artifact Registry."
  }
}

variable "cloud_run_invoker_member" {
  description = "One explicitly approved Google user IAM member for private Production Cloud Run validation."
  type        = string
  sensitive   = false

  validation {
    condition     = can(regex("^user:[^@[:space:]]+@[^@[:space:]]+$", var.cloud_run_invoker_member))
    error_message = "The private Cloud Run invoker must be one explicit Google user IAM member in user:email form."
  }
}

variable "active_crypto_key_version_name" {
  description = "Exact fully qualified numeric Production CryptoKeyVersion selected by the controlled bootstrap authority; null is permitted only while creating the pre-runtime KMS foundation."
  type        = string
  default     = null
  nullable    = true
  sensitive   = false

  validation {
    condition = var.active_crypto_key_version_name == null || can(regex(
      "^projects/nexcut-prod-jp-2026/locations/asia1/keyRings/nexcut-prod-identity/cryptoKeys/protected-identity-mac/cryptoKeyVersions/[1-9][0-9]*$",
      var.active_crypto_key_version_name,
    ))
    error_message = "The active version must be an exact numeric CryptoKeyVersion under the approved Production MAC CryptoKey; aliases and cross-key values are prohibited."
  }
}

variable "rotation_impersonator_member" {
  description = "Approved human principal allowed to obtain short-lived credentials for only the Production rotator service account."
  type        = string
  sensitive   = false

  validation {
    condition     = can(regex("^user:[^@[:space:]]+@[^@[:space:]]+$", var.rotation_impersonator_member))
    error_message = "The rotation impersonator must be one explicit Google user IAM member in user:email form."
  }
}

variable "database_migration_impersonator_member" {
  description = "Approved human operator allowed to obtain short-lived credentials for only the Production database migrator service account."
  type        = string
  sensitive   = false

  validation {
    condition     = can(regex("^user:[^@[:space:]]+@[^@[:space:]]+$", var.database_migration_impersonator_member))
    error_message = "The database migration impersonator must be one explicit Google user IAM member in user:email form."
  }
}

variable "database_bootstrap_impersonator_member" {
  description = "Approved human operator allowed to obtain short-lived credentials for only the one-time Production database bootstrap service account."
  type        = string
  sensitive   = false

  validation {
    condition     = can(regex("^user:[^@[:space:]]+@[^@[:space:]]+$", var.database_bootstrap_impersonator_member))
    error_message = "The database bootstrap impersonator must be one explicit Google user IAM member in user:email form."
  }
}

locals {
  environment                            = "production"
  runtime_service_account_id             = "nexcut-prod-runtime"
  deployment_service_account_id          = "nexcut-prod-deployer"
  rotation_service_account_id            = "nexcut-prod-kms-rotator"
  web_auth_service_account_id            = "nexcut-prod-web-auth"
  media_runtime_service_account_id       = "nexcut-prod-media-runtime"
  database_migration_service_account_id  = "nexcut-prod-db-migrator"
  database_bootstrap_service_account_id  = "nexcut-prod-db-bootstrap"
  acquisition_worker_service_account_id  = "nexcut-prod-acq-worker"
  acquisition_invoker_service_account_id = "nexcut-prod-acq-invoker"
  vercel_workload_identity_pool_id       = "nexcut-prod-vercel"
  vercel_workload_identity_provider_id   = "vercel-production"
  vercel_team_slug                       = "hiro423"
  vercel_owner_id                        = "team_DBeBBBY39xi5l6rkzBzAwQ4A"
  vercel_project_id                      = "prj_sfZiLkSZAtz0Mr6v1fW58vNhCxfu"
  key_ring_name                          = "nexcut-prod-identity"
  crypto_key_name                        = "protected-identity-mac"
}
