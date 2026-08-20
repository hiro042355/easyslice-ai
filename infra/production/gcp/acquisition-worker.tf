locals {
  acquisition_worker_service_name = "nexcut-prod-acquisition-worker"
}

resource "google_cloud_run_v2_service" "acquisition_worker" {
  project             = var.project_id
  name                = local.acquisition_worker_service_name
  location            = var.cloud_run_region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true

  template {
    service_account                  = google_service_account.acquisition_worker.email
    timeout                          = "300s"
    max_instance_request_concurrency = 1

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    volumes {
      name = "acquisition-workspace"

      empty_dir {
        medium     = "MEMORY"
        size_limit = "4Gi"
      }
    }

    containers {
      name       = "acquisition-worker"
      image      = var.acquisition_worker_image
      depends_on = ["bgutil-provider"]

      ports {
        name           = "http1"
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "2"
          memory = "8Gi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "ACQUISITION_TIMEOUT_MS"
        value = "240000"
      }

      env {
        name  = "MEDIA_BUCKET_NAME"
        value = google_storage_bucket.production_media.name
      }

      volume_mounts {
        name       = "acquisition-workspace"
        mount_path = "/workspace/acquisitions"
      }

      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 5
        period_seconds        = 5
        failure_threshold     = 24

        http_get {
          path = "/readyz"
          port = 8080
        }
      }

      liveness_probe {
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 30
        failure_threshold     = 3

        http_get {
          path = "/healthz"
          port = 8080
        }
      }
    }

    containers {
      name  = "bgutil-provider"
      image = var.acquisition_provider_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 5
        period_seconds        = 5
        failure_threshold     = 24

        http_get {
          path = "/ping"
          port = 4416
        }
      }

      liveness_probe {
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 30
        failure_threshold     = 3

        http_get {
          path = "/ping"
          port = 4416
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.required,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "acquisition_worker_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.acquisition_worker.location
  name     = google_cloud_run_v2_service.acquisition_worker.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.acquisition_invoker.email}"
}
