resource "google_iam_workload_identity_pool" "vercel_production" {
  project                   = var.project_id
  workload_identity_pool_id = local.vercel_workload_identity_pool_id
  display_name              = "NEXCUT Production Vercel"
  description               = "Production-only Vercel OIDC federation for server-side Firebase Authentication."

  depends_on = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "vercel_production" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.vercel_production.workload_identity_pool_id
  workload_identity_pool_provider_id = local.vercel_workload_identity_provider_id
  display_name                       = "NEXCUT Vercel Production"
  description                        = "Trusts only the approved Vercel owner, project, and Production environment."

  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.owner_id"    = "assertion.owner_id"
    "attribute.project_id"  = "assertion.project_id"
    "attribute.environment" = "assertion.environment"
  }

  attribute_condition = "assertion.owner_id == '${local.vercel_owner_id}' && assertion.project_id == '${local.vercel_project_id}' && assertion.environment == 'production'"

  oidc {
    issuer_uri        = "https://oidc.vercel.com/${local.vercel_team_slug}"
    allowed_audiences = ["https://vercel.com/${local.vercel_team_slug}"]
  }
}

resource "google_service_account_iam_member" "vercel_firebase_impersonator" {
  service_account_id = google_service_account.web_auth.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.vercel_production.name}/attribute.project_id/${local.vercel_project_id}"
}

resource "google_service_account_iam_member" "vercel_media_runtime_impersonator" {
  service_account_id = google_service_account.media_runtime.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.vercel_production.name}/attribute.project_id/${local.vercel_project_id}"
}

resource "google_project_iam_custom_role" "firebase_session_runtime" {
  project     = var.project_id
  role_id     = "nexcutProdFirebaseSessionRuntime"
  title       = "NEXCUT Production Firebase session runtime"
  description = "Minimum Firebase Authentication permissions for revocation-aware verification and session lifecycle."
  stage       = "GA"

  permissions = [
    "firebaseauth.users.createSession",
    "firebaseauth.users.get",
    "firebaseauth.users.update",
  ]

  depends_on = [google_project_service.required]
}

resource "google_project_iam_member" "web_auth_firebase_session_runtime" {
  project = var.project_id
  role    = google_project_iam_custom_role.firebase_session_runtime.name
  member  = "serviceAccount:${google_service_account.web_auth.email}"
}
