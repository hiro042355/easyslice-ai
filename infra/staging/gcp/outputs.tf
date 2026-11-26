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

output "kms_active_crypto_key_version_name" {
  description = "Non-secret exact numeric CryptoKeyVersion selected by controlled staging bootstrap and supplied to runtime configuration."
  value       = var.active_crypto_key_version_name
  sensitive   = false
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

output "staging_media_bucket_name" {
  description = "Staging-only media bucket governed by the three-day lifecycle rule."
  value       = google_storage_bucket.media.name
}

output "staging_media_service_account_email" {
  description = "Staging media runtime service account consumed by GCP_MEDIA_WIF_SERVICE_ACCOUNT."
  value       = google_service_account.media_runtime.email
}

output "staging_wif_provider_resource" {
  description = "WIF provider resource consumed by GCP_WIF_PROVIDER_RESOURCE (numeric project form)."
  value       = google_iam_workload_identity_pool_provider.vercel_staging.name
}

output "staging_cloud_sql_database" {
  description = "Staging database name the media runtime must use."
  value       = "easyslice_staging"
}

output "staging_database_iam_user" {
  description = "Cloud SQL IAM database user the media runtime must use."
  value       = "easyslice-staging-sa@nexcut-staging.iam"
}
