output "state_bucket_name" {
  description = "Production GCS backend bucket name."
  value       = google_storage_bucket.terraform_state.name
}

output "state_bucket_location" {
  description = "Production GCS backend bucket location."
  value       = google_storage_bucket.terraform_state.location
}

output "state_authority_members" {
  description = "Reviewed IAM members able to administer and recover versioned state objects."
  value       = local.state_authority_members
}
