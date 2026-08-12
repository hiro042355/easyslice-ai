resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = local.runtime_service_account_id
  display_name = "NEXCUT Production runtime"
  description  = "Production application runtime identity for protected-identity Cloud KMS MAC use."

  depends_on = [google_project_service.required]
}

resource "google_service_account" "deployment" {
  project      = var.project_id
  account_id   = local.deployment_service_account_id
  display_name = "NEXCUT Production deployer"
  description  = "Reserved Production deployment identity; no project privileges are granted by this foundation."

  depends_on = [google_project_service.required]
}

resource "google_service_account" "rotation" {
  project      = var.project_id
  account_id   = local.rotation_service_account_id
  display_name = "NEXCUT Production KMS rotator"
  description  = "Production identity for controlled CryptoKeyVersion creation and metadata inspection."

  depends_on = [google_project_service.required]
}

resource "google_service_account" "web_auth" {
  project      = var.project_id
  account_id   = local.web_auth_service_account_id
  display_name = "NEXCUT Production web authentication"
  description  = "Keyless Vercel-federated identity for Firebase Authentication session operations only."

  depends_on = [google_project_service.required]
}
