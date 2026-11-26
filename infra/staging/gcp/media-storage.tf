locals {
  media_bucket_name = "easyslice-staging-media-artifacts"
  media_sa_id       = "easyslice-staging-sa"
}

resource "google_service_account" "media_runtime" {
  project      = var.project_id
  account_id   = local.media_sa_id
  display_name = "NEXCUT staging media runtime"
  description  = "Staging-only identity for media object storage and Cloud SQL IAM access (PO-04)."

  depends_on = [google_project_service.required]
}

resource "google_storage_bucket" "media" {
  project                     = var.project_id
  name                        = local.media_bucket_name
  location                    = "ASIA-NORTHEAST1"
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # Object lifecycle: uploaded media is deleted three days after creation or
  # replacement (design 01 §2.1, PO-02). Incomplete resumable uploads are aborted
  # after one day so orphaned parts cannot accumulate.
  lifecycle_rule {
    condition {
      age = 3
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      age = 1
    }
    action {
      type = "AbortIncompleteMultipartUpload"
    }
  }

  # GCS soft delete defaults to seven days, which would retain objects for ten days
  # in total despite the three-day lifecycle rule. Staging disables soft delete so
  # the deletion window matches the approved retention decision.
  soft_delete_policy {
    retention_duration_seconds = 0
  }

  versioning {
    enabled = false
  }

  cors {
    origin          = [var.staging_app_origin]
    method          = ["GET", "HEAD", "POST", "PUT"]
    response_header = ["Content-Type", "Content-Length", "Content-Range", "Range", "ETag", "x-goog-resumable"]
    max_age_seconds = 3600
  }

  labels = {
    environment = local.environment
    purpose     = "media-artifacts"
    authority   = "tiktok-publisher"
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.required]
}

// The runtime identity may only administer objects in this bucket; it has no
// project-wide storage role (PO-02: bucket-scoped objectAdmin).
resource "google_storage_bucket_iam_member" "media_runtime_object_admin" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.media_runtime.email}"
}
