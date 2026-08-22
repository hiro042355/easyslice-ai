locals {
  acquisition_worker_egress_experiment_service_name = "nexcut-prod-acquisition-worker-egress-b"
  acquisition_worker_egress_experiment_network_name = "nexcut-prod-acquisition-egress-b"
  acquisition_worker_egress_experiment_subnet_name  = "nexcut-prod-acquisition-egress-b"
}

resource "google_compute_network" "acquisition_worker_egress_experiment" {
  project                 = var.project_id
  name                    = local.acquisition_worker_egress_experiment_network_name
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"

  depends_on = [google_project_service.required]
}

resource "google_compute_subnetwork" "acquisition_worker_egress_experiment" {
  project                  = var.project_id
  name                     = local.acquisition_worker_egress_experiment_subnet_name
  region                   = var.cloud_run_region
  network                  = google_compute_network.acquisition_worker_egress_experiment.id
  ip_cidr_range            = "10.42.0.0/26"
  private_ip_google_access = true
}

resource "google_compute_address" "acquisition_worker_egress_experiment" {
  project      = var.project_id
  name         = "nexcut-prod-acquisition-egress-b"
  region       = var.cloud_run_region
  address_type = "EXTERNAL"
  network_tier = "PREMIUM"

  depends_on = [google_project_service.required]
}

resource "google_compute_router" "acquisition_worker_egress_experiment" {
  project = var.project_id
  name    = "nexcut-prod-acquisition-egress-b"
  region  = var.cloud_run_region
  network = google_compute_network.acquisition_worker_egress_experiment.id
}

resource "google_compute_router_nat" "acquisition_worker_egress_experiment" {
  project                            = var.project_id
  name                               = "nexcut-prod-acquisition-egress-b"
  region                             = var.cloud_run_region
  router                             = google_compute_router.acquisition_worker_egress_experiment.name
  nat_ip_allocate_option             = "MANUAL_ONLY"
  nat_ips                            = [google_compute_address.acquisition_worker_egress_experiment.self_link]
  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"

  subnetwork {
    name                    = google_compute_subnetwork.acquisition_worker_egress_experiment.id
    source_ip_ranges_to_nat = ["ALL_IP_RANGES"]
  }

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

resource "google_cloud_run_v2_service" "acquisition_worker_egress_experiment" {
  project             = var.project_id
  name                = local.acquisition_worker_egress_experiment_service_name
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

    vpc_access {
      egress = "ALL_TRAFFIC"

      network_interfaces {
        network    = google_compute_network.acquisition_worker_egress_experiment.name
        subnetwork = google_compute_subnetwork.acquisition_worker_egress_experiment.name
      }
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
      image      = var.acquisition_worker_egress_experiment_image
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

      env {
        name  = "EXPECTED_EGRESS_IP"
        value = google_compute_address.acquisition_worker_egress_experiment.address
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
    google_compute_router_nat.acquisition_worker_egress_experiment,
    google_project_service.required,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "acquisition_worker_egress_experiment_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.acquisition_worker_egress_experiment.location
  name     = google_cloud_run_v2_service.acquisition_worker_egress_experiment.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.acquisition_invoker.email}"
}
