variable "state_project_id" {
  description = "Production Terraform state project candidate; availability must be externally validated before provisioning."
  type        = string
  default     = "nexcut-prod-jp-2026"

  validation {
    condition     = var.state_project_id == "nexcut-prod-jp-2026"
    error_message = "Production state authority must remain nexcut-prod-jp-2026."
  }
}

variable "state_bucket_name" {
  description = "Globally unique Production state bucket candidate; availability must be externally validated before provisioning."
  type        = string
  default     = "nexcut-production-tfstate"

  validation {
    condition     = var.state_bucket_name == "nexcut-production-tfstate"
    error_message = "The approved candidate is nexcut-production-tfstate; conflicts require Owner Decision rather than automatic renaming."
  }
}

variable "state_bucket_location" {
  description = "Approved Production state bucket location."
  type        = string
  default     = "asia"

  validation {
    condition     = var.state_bucket_location == "asia"
    error_message = "The approved Production state location is asia."
  }
}

variable "state_admin_member" {
  description = "Explicit human or group IAM member that administers Production Terraform state objects."
  type        = string

  validation {
    condition     = can(regex("^(user|group):[^@[:space:]]+@[^@[:space:]]+$", var.state_admin_member))
    error_message = "State admin must be one explicit user: or group: IAM member."
  }
}

variable "state_recovery_member" {
  description = "Explicit human or group IAM member authorized to restore versioned Production Terraform state objects."
  type        = string

  validation {
    condition     = can(regex("^(user|group):[^@[:space:]]+@[^@[:space:]]+$", var.state_recovery_member))
    error_message = "State recovery owner must be one explicit user: or group: IAM member."
  }
}

locals {
  state_authority_members = toset([
    var.state_admin_member,
    var.state_recovery_member,
  ])
}
