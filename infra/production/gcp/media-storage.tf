resource "google_storage_bucket" "production_media" {
  project                     = var.project_id
  name                        = var.media_bucket_name
  location                    = var.cloud_run_region
  storage_class               = "STANDARD"
  force_destroy               = false
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = false
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      days_since_custom_time = 7
      send_age_if_zero       = false
    }
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      age            = 7
      matches_prefix = ["acquisition-handoff/v1/"]
    }
  }

  depends_on = [google_project_service.required]
}

resource "google_storage_bucket_iam_member" "media_runtime_object_user" {
  bucket = google_storage_bucket.production_media.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.media_runtime.email}"
}

resource "google_storage_bucket_iam_member" "acquisition_worker_control_object_user" {
  bucket = google_storage_bucket.production_media.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.acquisition_worker.email}"

  condition {
    title       = "acquisition-control-v1-only"
    description = "Restrict the Acquisition Worker to exact idempotency control objects; media objects remain denied."
    expression  = "resource.type == 'storage.googleapis.com/Object' && resource.name.startsWith('projects/_/buckets/${google_storage_bucket.production_media.name}/objects/acquisition-control/v1/')"
  }
}

resource "google_storage_bucket_iam_member" "acquisition_worker_handoff_object_creator" {
  bucket = google_storage_bucket.production_media.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.acquisition_worker.email}"

  condition {
    title       = "acquisition-handoff-v1-create-only"
    description = "Allow the Acquisition Worker to create temporary handoff media only; read, delete, and canonical media access remain denied."
    expression  = "resource.type == 'storage.googleapis.com/Object' && resource.name.startsWith('projects/_/buckets/${google_storage_bucket.production_media.name}/objects/acquisition-handoff/v1/')"
  }
}
