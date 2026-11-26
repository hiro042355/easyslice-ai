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

variable "rotation_impersonator_member" {
  description = "Approved human bootstrap principal allowed to obtain short-lived credentials for only the staging rotator service account."
  type        = string
  sensitive   = false

  validation {
    condition     = can(regex("^user:[^@[:space:]]+@[^@[:space:]]+$", var.rotation_impersonator_member))
    error_message = "The rotation impersonator must be one explicit Google user IAM member in user:email form."
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

variable "staging_app_origin" {
  description = "Exact HTTPS origin allowed to upload staging media objects through the bucket CORS policy."
  type        = string
  default     = "https://staging.nexcut.app"

  validation {
    condition     = var.staging_app_origin == "https://staging.nexcut.app"
    error_message = "The only approved staging application origin is https://staging.nexcut.app."
  }
}

variable "vercel_team_id" {
  description = "Vercel team ID whose OIDC tokens may federate into the staging pool."
  type        = string

  validation {
    condition     = can(regex("^team_[A-Za-z0-9]{6,64}$", var.vercel_team_id))
    error_message = "vercel_team_id must be an exact Vercel team ID (team_...)."
  }
}

variable "vercel_project_id" {
  description = "Vercel project ID of the staging deployment whose OIDC tokens may federate."
  type        = string

  validation {
    condition     = can(regex("^prj_[A-Za-z0-9]{6,64}$", var.vercel_project_id))
    error_message = "vercel_project_id must be an exact Vercel project ID (prj_...)."
  }
}

variable "vercel_oidc_issuer_uri" {
  description = "Vercel OIDC issuer for the staging team, https://oidc.vercel.com/<team-slug>."
  type        = string

  validation {
    condition = (
      can(regex("^https://oidc\\.vercel\\.com/[a-z0-9][a-z0-9-]*$", var.vercel_oidc_issuer_uri)) &&
      !can(regex("prod", var.vercel_oidc_issuer_uri))
    )
    error_message = "The staging OIDC issuer must be a Vercel team issuer and must not reference production."
  }
}

variable "vercel_oidc_audience" {
  description = "Vercel OIDC audience for the staging team, https://vercel.com/<team-slug>."
  type        = string

  validation {
    condition = (
      can(regex("^https://vercel\\.com/[a-z0-9][a-z0-9-]*$", var.vercel_oidc_audience)) &&
      !can(regex("prod", var.vercel_oidc_audience))
    )
    error_message = "The staging OIDC audience must be a Vercel team audience and must not reference production."
  }
}
