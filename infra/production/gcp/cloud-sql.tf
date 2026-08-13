locals {
  cloud_sql_instance_name = "nexcut-prod-postgresql"
  application_database    = "nexcut"
}

resource "google_sql_database_instance" "production" {
  project             = var.project_id
  name                = local.cloud_sql_instance_name
  region              = var.cloud_sql_region
  database_version    = "POSTGRES_18"
  deletion_protection = true

  settings {
    tier                  = "db-custom-1-3840"
    edition               = "ENTERPRISE"
    availability_type     = "ZONAL"
    disk_type             = "PD_SSD"
    disk_size             = 10
    disk_autoresize       = true
    connector_enforcement = "REQUIRED"

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }

    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }

    ip_configuration {
      ipv4_enabled = true
    }

    deletion_protection_enabled = true
  }

  depends_on = [google_project_service.required]
}

resource "google_sql_database" "application" {
  project  = var.project_id
  name     = local.application_database
  instance = google_sql_database_instance.production.name
}

resource "google_sql_user" "media_runtime" {
  project  = var.project_id
  instance = google_sql_database_instance.production.name
  name     = trimsuffix(google_service_account.media_runtime.email, ".gserviceaccount.com")
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

resource "google_sql_user" "database_migration" {
  project  = var.project_id
  instance = google_sql_database_instance.production.name
  name     = trimsuffix(google_service_account.database_migration.email, ".gserviceaccount.com")
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

resource "google_sql_user" "database_bootstrap" {
  project  = var.project_id
  instance = google_sql_database_instance.production.name
  name     = trimsuffix(google_service_account.database_bootstrap.email, ".gserviceaccount.com")
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

resource "google_project_iam_member" "media_runtime_cloud_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.media_runtime.email}"
}

resource "google_project_iam_member" "media_runtime_cloud_sql_instance_user" {
  project = var.project_id
  role    = "roles/cloudsql.instanceUser"
  member  = "serviceAccount:${google_service_account.media_runtime.email}"
}

resource "google_project_iam_member" "database_migration_cloud_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.database_migration.email}"
}

resource "google_project_iam_member" "database_migration_cloud_sql_instance_user" {
  project = var.project_id
  role    = "roles/cloudsql.instanceUser"
  member  = "serviceAccount:${google_service_account.database_migration.email}"
}

resource "google_project_iam_member" "database_bootstrap_cloud_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.database_bootstrap.email}"
}

resource "google_project_iam_member" "database_bootstrap_cloud_sql_instance_user" {
  project = var.project_id
  role    = "roles/cloudsql.instanceUser"
  member  = "serviceAccount:${google_service_account.database_bootstrap.email}"
}
