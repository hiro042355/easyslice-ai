resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = local.runtime_service_account_id
  display_name = "NEXCUT staging runtime"
  description  = "Staging application runtime identity for protected-identity Cloud KMS MAC use."

  depends_on = [google_project_service.required]
}

resource "google_service_account" "deployment" {
  project      = var.project_id
  account_id   = local.deployment_service_account_id
  display_name = "NEXCUT staging deployer"
  description  = "Reserved staging deployment identity; no project privileges are granted by this foundation."

  depends_on = [google_project_service.required]
}

resource "google_service_account" "rotation" {
  project      = var.project_id
  account_id   = local.rotation_service_account_id
  display_name = "NEXCUT staging KMS rotator"
  description  = "Staging identity for controlled CryptoKeyVersion creation and metadata inspection."

  depends_on = [google_project_service.required]
}
