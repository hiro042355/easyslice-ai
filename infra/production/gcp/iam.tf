resource "google_project_iam_custom_role" "kms_metadata_reader" {
  project     = var.project_id
  role_id     = "nexcutProdKmsMetadataReader"
  title       = "NEXCUT Production KMS metadata reader"
  description = "Read only the CryptoKey and exact CryptoKeyVersion metadata required by the runtime adapter."
  stage       = "GA"

  permissions = [
    "cloudkms.cryptoKeys.get",
    "cloudkms.cryptoKeyVersions.get",
  ]

  depends_on = [google_project_service.required]
}

resource "google_project_iam_custom_role" "kms_version_rotator" {
  project     = var.project_id
  role_id     = "nexcutProdKmsVersionRotator"
  title       = "NEXCUT Production KMS version rotator"
  description = "Create and inspect versions without active-authority, disable, destroy, restore, or IAM permissions."
  stage       = "GA"

  permissions = [
    "cloudkms.cryptoKeys.get",
    "cloudkms.cryptoKeyVersions.create",
    "cloudkms.cryptoKeyVersions.get",
    "cloudkms.cryptoKeyVersions.list",
  ]

  depends_on = [google_project_service.required]
}

resource "google_kms_crypto_key_iam_member" "runtime_mac_signer" {
  crypto_key_id = google_kms_crypto_key.protected_identity_mac.id
  role          = "roles/cloudkms.signer"
  member        = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_kms_crypto_key_iam_member" "runtime_metadata_reader" {
  crypto_key_id = google_kms_crypto_key.protected_identity_mac.id
  role          = google_project_iam_custom_role.kms_metadata_reader.name
  member        = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_kms_crypto_key_iam_member" "rotation_version_manager" {
  crypto_key_id = google_kms_crypto_key.protected_identity_mac.id
  role          = google_project_iam_custom_role.kms_version_rotator.name
  member        = "serviceAccount:${google_service_account.rotation.email}"
}

resource "google_service_account_iam_member" "rotation_short_lived_impersonator" {
  service_account_id = google_service_account.rotation.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = var.rotation_impersonator_member
}
