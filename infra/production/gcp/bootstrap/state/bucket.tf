resource "google_storage_bucket" "terraform_state" {
  project                     = var.state_project_id
  name                        = var.state_bucket_name
  location                    = var.state_bucket_location
  force_destroy               = false
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  labels = {
    environment = "production"
    authority   = "terraform-state"
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.storage]
}

resource "google_storage_bucket_iam_member" "state_object_authority" {
  for_each = local.state_authority_members

  bucket = google_storage_bucket.terraform_state.name
  role   = "roles/storage.objectAdmin"
  member = each.value
}
