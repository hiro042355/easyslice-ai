/**
 * Vercel Staging -> GCP Workload Identity Federation (BLK-04).
 *
 * Vercel OIDC tokens carry `owner_id`, `project_id` and `environment` claims but
 * no git branch claim. Cross-environment access is therefore prevented by
 * combining:
 *   1. this dedicated staging project (`nexcut-staging`), which contains no
 *      production resources,
 *   2. a dedicated pool/provider that does not exist in production,
 *   3. an attribute condition requiring the staging Vercel team, project and
 *      `environment == "preview"`,
 *   4. a principalSet binding for that environment only, and
 *   5. a service account whose staging-only permissions are bucket-scoped.
 */
resource "google_iam_workload_identity_pool" "vercel_staging" {
  project                   = var.project_id
  workload_identity_pool_id = "vercel-staging"
  display_name              = "Vercel staging"
  description               = "OIDC federation for Vercel staging deployments only (PO-04)."

  depends_on = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "vercel_staging" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.vercel_staging.workload_identity_pool_id
  workload_identity_pool_provider_id = "vercel-staging"
  display_name                       = "Vercel staging OIDC"
  description                        = "Accepts only staging Vercel deployment OIDC tokens."

  oidc {
    issuer_uri        = var.vercel_oidc_issuer_uri
    allowed_audiences = [var.vercel_oidc_audience]
  }

  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.owner"       = "assertion.owner_id"
    "attribute.project"     = "assertion.project_id"
    "attribute.environment" = "assertion.environment"
  }

  attribute_condition = join(" && ", [
    "assertion.owner_id == '${var.vercel_team_id}'",
    "assertion.project_id == '${var.vercel_project_id}'",
    "assertion.environment == 'preview'",
  ])
}

resource "google_service_account_iam_member" "vercel_staging_wif_user" {
  service_account_id = google_service_account.media_runtime.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.vercel_staging.name}/attribute.environment/preview"
}

// Cloud SQL access: connect through the Cloud SQL connector (client) and log in
// as the IAM database user (instanceUser). Both are project-scoped so they are
// limited to this staging project, which owns no production resources.
resource "google_project_iam_member" "media_runtime_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.media_runtime.email}"
}

resource "google_project_iam_member" "media_runtime_cloudsql_instance_user" {
  project = var.project_id
  role    = "roles/cloudsql.instanceUser"
  member  = "serviceAccount:${google_service_account.media_runtime.email}"
}
