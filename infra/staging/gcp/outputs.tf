output "project_id" {
  description = "Staging Google Cloud project ID."
  value       = var.project_id
}

output "kms_location" {
  description = "Cloud KMS location; not a Cloud Run deployment region."
  value       = var.kms_location
}

output "kms_key_ring_name" {
  description = "Fully qualified staging Cloud KMS KeyRing resource name."
  value       = google_kms_key_ring.protected_identity.id
}

output "kms_crypto_key_name" {
  description = "Fully qualified staging MAC CryptoKey resource name consumed by the GCP KMS adapter."
  value       = google_kms_crypto_key.protected_identity_mac.id
}

output "kms_active_version_configuration_name" {
  description = "Non-secret application configuration name that must receive the bootstrapped exact numeric CryptoKeyVersion resource."
  value       = "PROTECTED_IDENTITY_KMS_ACTIVE_VERSION"
}

output "runtime_service_account_email" {
  description = "Staging runtime service account email."
  value       = google_service_account.runtime.email
}

output "deployment_service_account_email" {
  description = "Staging deployment service account email."
  value       = google_service_account.deployment.email
}

output "rotation_service_account_email" {
  description = "Staging KMS rotation service account email."
  value       = google_service_account.rotation.email
}
