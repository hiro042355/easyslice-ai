resource "google_artifact_registry_repository" "production_app" {
  project       = var.project_id
  location      = var.cloud_run_region
  repository_id = "nexcut-production"
  description   = "Private Production container images for NEXCUT."
  format        = "DOCKER"

  labels = {
    environment = local.environment
    authority   = "production-runtime"
  }

  depends_on = [google_project_service.required]
}

resource "google_artifact_registry_repository_iam_member" "deployment_writer" {
  project    = var.project_id
  location   = google_artifact_registry_repository.production_app.location
  repository = google_artifact_registry_repository.production_app.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployment.email}"
}
