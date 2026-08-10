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

locals {
  environment                   = "staging"
  runtime_service_account_id    = "nexcut-stg-runtime"
  deployment_service_account_id = "nexcut-stg-deployer"
  rotation_service_account_id   = "nexcut-stg-kms-rotator"
  key_ring_name                 = "nexcut-stg-identity"
  crypto_key_name               = "protected-identity-mac"
}
