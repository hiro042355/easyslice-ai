variable "project_id" {
  description = "The staging-only Google Cloud project authority."
  type        = string
  default     = "nexcut-staging"

  validation {
    condition     = var.project_id == "nexcut-staging"
    error_message = "This Terraform root is staging-only and must target nexcut-staging."
  }
}
variable "kms_location" {
  description = "The approved Cloud KMS multi-region location. This is not a Cloud Run region."
  type        = string
  default     = "asia1"

  validation {
    condition     = var.kms_location == "asia1"
    error_message = "The approved staging KMS location is asia1."
  }
}

variable "active_crypto_key_version_name" {
  description = "Exact fully qualified numeric staging CryptoKeyVersion selected by the controlled bootstrap authority."
  type        = string
  sensitive   = false

  validation {
    condition = can(regex(
      "^projects/nexcut-staging/locations/asia1/keyRings/nexcut-stg-identity/cryptoKeys/protected-identity-mac/cryptoKeyVersions/[1-9][0-9]*$",
      var.active_crypto_key_version_name,
    ))
    error_message = "The active version must be an exact numeric CryptoKeyVersion under the approved nexcut-staging MAC CryptoKey; aliases and cross-key values are prohibited."
  }
}

locals {
  environment                   = "staging"
  runtime_service_account_id    = "nexcut-stg-runtime"
  deployment_service_account_id = "nexcut-stg-deployer"
  rotation_service_account_id   = "nexcut-stg-kms-rotator"
  key_ring_name                 = "nexcut-stg-identity"
  crypto_key_name               = "protected-identity-mac"
}
