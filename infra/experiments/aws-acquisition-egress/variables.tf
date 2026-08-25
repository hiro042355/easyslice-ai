variable "aws_account_id" {
  description = "Exact Owner-approved AWS account authority."
  type        = string
  default     = "990565447095"

  validation {
    condition     = var.aws_account_id == "990565447095"
    error_message = "The AWS experiment must remain in the approved account."
  }
}

variable "aws_region" {
  type    = string
  default = "ap-northeast-1"

  validation {
    condition     = var.aws_region == "ap-northeast-1"
    error_message = "The controlled-host experiment is restricted to Tokyo."
  }
}

variable "amazon_linux_2023_ami" {
  description = "Official AL2023 x86_64 AMI resolved through the AWS public SSM parameter during preflight."
  type        = string
  default     = "ami-0f7e90d3283d2e250"

  validation {
    condition     = var.amazon_linux_2023_ami == "ami-0f7e90d3283d2e250"
    error_message = "The AMI must match the reviewed official AL2023 authority."
  }
}

variable "instance_type" {
  type    = string
  default = "m7i.xlarge"

  validation {
    condition     = var.instance_type == "m7i.xlarge"
    error_message = "The comparison host must use m7i.xlarge."
  }
}

variable "gcp_project_id" {
  type    = string
  default = "nexcut-prod-jp-2026"
}

variable "worker_image" {
  type    = string
  default = "asia-northeast1-docker.pkg.dev/nexcut-prod-jp-2026/nexcut-production/nexcut-acquisition-worker@sha256:7282415934fae66fef07693c04ff04ac82d5824244913d7e108a3f4fce2edbb6"

  validation {
    condition     = var.worker_image == "asia-northeast1-docker.pkg.dev/nexcut-prod-jp-2026/nexcut-production/nexcut-acquisition-worker@sha256:7282415934fae66fef07693c04ff04ac82d5824244913d7e108a3f4fce2edbb6"
    error_message = "The AWS host must use the approved immutable Worker digest."
  }
}

variable "provider_image" {
  type    = string
  default = "asia-northeast1-docker.pkg.dev/nexcut-prod-jp-2026/nexcut-production/nexcut-bgutil-provider@sha256:dde367547487b7458109508c69dbf8533f53d006b81d2616081095374d74d5f2"

  validation {
    condition     = var.provider_image == "asia-northeast1-docker.pkg.dev/nexcut-prod-jp-2026/nexcut-production/nexcut-bgutil-provider@sha256:dde367547487b7458109508c69dbf8533f53d006b81d2616081095374d74d5f2"
    error_message = "The AWS host must use the approved immutable provider digest."
  }
}

variable "maximum_lifetime_hours" {
  type    = number
  default = 8

  validation {
    condition     = var.maximum_lifetime_hours == 8
    error_message = "The experiment maximum lifetime must remain eight hours."
  }
}

variable "spend_ceiling_usd" {
  type    = number
  default = 10
}

variable "reviewed_instance_hourly_usd" {
  description = "AWS Price List API evidence for Tokyo Linux m7i.xlarge On-Demand on 2026-08-23."
  type        = number
  default     = 0.2604
}
