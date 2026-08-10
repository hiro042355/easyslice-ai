resource "google_kms_key_ring" "protected_identity" {
  project  = var.project_id
  location = var.kms_location
  name     = local.key_ring_name

  depends_on = [google_project_service.required]
}
resource "google_kms_crypto_key" "protected_identity_mac" {
  name     = local.crypto_key_name
  key_ring = google_kms_key_ring.protected_identity.id
  purpose  = "MAC"

  version_template {
    algorithm = "HMAC_SHA256"
  }

  labels = {
    environment = local.environment
    authority   = "protected-identity"
  }

  lifecycle {
    prevent_destroy = true
  }
}
