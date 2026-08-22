output "project_id" {
  description = "Production Google Cloud project ID."
  value       = var.project_id
}

output "kms_location" {
  description = "Cloud KMS location; not a Cloud Run deployment region."
  value       = var.kms_location
}

output "future_cloud_run_region" {
  description = "Production Cloud Run region."
  value       = var.cloud_run_region
}

output "cloud_run_service_name" {
  description = "Private Production Cloud Run service name."
  value       = google_cloud_run_v2_service.production.name
}

output "cloud_run_service_uri" {
  description = "Private Production Cloud Run service URI; IAM authentication remains mandatory."
  value       = google_cloud_run_v2_service.production.uri
}

output "production_image_authority" {
  description = "Reviewed immutable Production Cloud Run image digest."
  value       = var.production_image
}

output "production_container_repository" {
  description = "Private Production Artifact Registry Docker repository. Deployments must use an immutable digest reference."
  value       = "${var.cloud_run_region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.production_app.repository_id}/nexcut-app"
}

output "kms_key_ring_name" {
  description = "Fully qualified Production Cloud KMS KeyRing resource name."
  value       = google_kms_key_ring.protected_identity.id
}

output "kms_crypto_key_name" {
  description = "Fully qualified Production MAC CryptoKey resource name consumed by the GCP KMS adapter."
  value       = google_kms_crypto_key.protected_identity_mac.id
}

output "kms_active_version_configuration_name" {
  description = "Non-secret application configuration name that must receive the bootstrapped exact numeric CryptoKeyVersion resource."
  value       = "PROTECTED_IDENTITY_KMS_ACTIVE_VERSION"
}

output "kms_active_crypto_key_version_name" {
  description = "Non-secret exact numeric CryptoKeyVersion selected by controlled Production bootstrap; null means the pre-runtime foundation has not assigned active authority yet."
  value       = var.active_crypto_key_version_name
  sensitive   = false
}

output "runtime_service_account_email" {
  description = "Production runtime service account email."
  value       = google_service_account.runtime.email
}

output "deployment_service_account_email" {
  description = "Production deployment service account email."
  value       = google_service_account.deployment.email
}

output "rotation_service_account_email" {
  description = "Production KMS rotation service account email."
  value       = google_service_account.rotation.email
}

output "vercel_firebase_service_account_email" {
  description = "Dedicated keyless Vercel-federated Firebase Authentication identity."
  value       = google_service_account.web_auth.email
}

output "vercel_wif_provider_resource" {
  description = "Non-secret provider resource consumed by the request-scoped Vercel credential adapter."
  value       = google_iam_workload_identity_pool_provider.vercel_production.name
}

output "cloud_sql_instance_connection_name" {
  description = "Nonsensitive Cloud SQL Connector target for the Production PostgreSQL instance."
  value       = google_sql_database_instance.production.connection_name
}

output "postgres_database" {
  description = "Production application database name."
  value       = google_sql_database.application.name
}

output "postgres_iam_user" {
  description = "Passwordless IAM database username used by the Production media runtime."
  value       = google_sql_user.media_runtime.name
}

output "database_migration_service_account_email" {
  description = "Separate keyless Production database migration identity."
  value       = google_service_account.database_migration.email
}

output "database_bootstrap_service_account_email" {
  description = "Dedicated one-time keyless Production database bootstrap identity."
  value       = google_service_account.database_bootstrap.email
}

output "media_bucket_name" {
  description = "Private Production media bucket name."
  value       = google_storage_bucket.production_media.name
}

output "media_runtime_service_account_email" {
  description = "Dedicated keyless Vercel-federated Production media runtime identity."
  value       = google_service_account.media_runtime.email
}

output "acquisition_worker_service_name" {
  description = "Private Production Acquisition Worker Cloud Run service name."
  value       = google_cloud_run_v2_service.acquisition_worker.name
}

output "acquisition_worker_service_uri" {
  description = "Private Acquisition Worker URI; IAM authentication remains mandatory."
  value       = google_cloud_run_v2_service.acquisition_worker.uri
}

output "acquisition_worker_service_account_email" {
  description = "Dedicated Production Acquisition Worker runtime identity."
  value       = google_service_account.acquisition_worker.email
}

output "acquisition_invoker_service_account_email" {
  description = "Dedicated keyless Vercel-federated Acquisition Worker invoker identity."
  value       = google_service_account.acquisition_invoker.email
}

output "acquisition_worker_egress_experiment_service_name" {
  description = "Private Environment B Acquisition Worker service name."
  value       = google_cloud_run_v2_service.acquisition_worker_egress_experiment.name
}

output "acquisition_worker_egress_experiment_service_uri" {
  description = "Private Environment B URI; IAM authentication remains mandatory."
  value       = google_cloud_run_v2_service.acquisition_worker_egress_experiment.uri
}

output "acquisition_worker_egress_experiment_static_ip" {
  description = "Environment B controlled outbound IP; this is network metadata, not credential material."
  value       = google_compute_address.acquisition_worker_egress_experiment.address
}
