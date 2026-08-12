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

  depends_on = [google_project_service.required]
}

resource "google_storage_bucket_iam_member" "media_runtime_object_user" {
  bucket = google_storage_bucket.production_media.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.media_runtime.email}"
}
