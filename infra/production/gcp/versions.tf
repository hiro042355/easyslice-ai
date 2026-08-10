terraform {
  required_version = "~> 1.15.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.41.0"
    }
  }

  backend "gcs" {
    bucket = "nexcut-production-tfstate"
    prefix = "production/gcp-foundation"
  }
}
