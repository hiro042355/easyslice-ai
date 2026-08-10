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
  description = "The approved future Cloud Run region; no Cloud Run resource is managed by this root."
  type        = string
  default     = "asia-northeast1"

  validation {
    condition     = var.cloud_run_region == "asia-northeast1"
    error_message = "The approved future Production Cloud Run region is asia-northeast1."
  }
}

variable "active_crypto_key_version_name" {
  description = "Exact fully qualified numeric Production CryptoKeyVersion selected by the controlled bootstrap authority."
  type        = string
  sensitive   = false

  validation {
    condition = can(regex(
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

locals {
  environment                   = "production"
  runtime_service_account_id    = "nexcut-prod-runtime"
  deployment_service_account_id = "nexcut-prod-deployer"
  rotation_service_account_id   = "nexcut-prod-kms-rotator"
  key_ring_name                 = "nexcut-prod-identity"
  crypto_key_name               = "protected-identity-mac"
}
