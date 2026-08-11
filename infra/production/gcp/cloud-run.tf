locals {
  cloud_run_service_name = "nexcut-production"
  kms_crypto_key_name    = "projects/${var.project_id}/locations/${var.kms_location}/keyRings/${local.key_ring_name}/cryptoKeys/${local.crypto_key_name}"
}

resource "google_cloud_run_v2_service" "production" {
  project             = var.project_id
  name                = local.cloud_run_service_name
  location            = var.cloud_run_region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true

  template {
    service_account                  = google_service_account.runtime.email
    timeout                          = "300s"
    max_instance_request_concurrency = 20

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = var.production_image

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "PROTECTED_IDENTITY_KMS_CRYPTO_KEY"
        value = local.kms_crypto_key_name
      }

      env {
        name  = "PROTECTED_IDENTITY_KMS_ACTIVE_VERSION"
        value = var.active_crypto_key_version_name
      }

      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 10
        period_seconds        = 10
        failure_threshold     = 12

        http_get {
          path = "/api/health/ready"
          port = 8080
        }
      }

      liveness_probe {
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 30
        failure_threshold     = 3

        http_get {
          path = "/api/health/live"
          port = 8080
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    precondition {
      condition     = var.active_crypto_key_version_name != null
      error_message = "Production Cloud Run requires the controlled exact active CryptoKeyVersion authority."
    }
  }

  depends_on = [
    google_project_service.required,
    google_kms_crypto_key_iam_member.runtime_mac_signer,
    google_kms_crypto_key_iam_member.runtime_metadata_reader,
  ]
}

resource "google_project_iam_member" "deployment_cloud_run_developer" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.deployment.email}"
}

resource "google_service_account_iam_member" "deployment_runtime_user" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployment.email}"
}

resource "google_cloud_run_v2_service_iam_member" "private_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.production.location
  name     = google_cloud_run_v2_service.production.name
  role     = "roles/run.invoker"
  member   = var.cloud_run_invoker_member
}
