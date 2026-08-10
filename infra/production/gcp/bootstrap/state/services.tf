resource "google_project_service" "storage" {
  project                    = var.state_project_id
  service                    = "storage.googleapis.com"
  disable_dependent_services = false
  disable_on_destroy         = false
}
