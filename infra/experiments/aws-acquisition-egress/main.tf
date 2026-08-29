data "aws_caller_identity" "current" {}

data "aws_ssm_parameter" "amazon_linux_2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

data "google_project" "production" {
  project_id = var.gcp_project_id
}

locals {
  name                   = "nexcut-aws-acquisition-experiment"
  gcp_service_account_id = "nexcut-prod-aws-acq-exp"
  gcp_pool_id            = "nexcut-aws-acq-exp"
  gcp_provider_id        = "aws-tokyo-controlled-host"
  experiment_bucket      = "nexcut-production-acquisition-host-experiment-${var.aws_account_id}"
  control_prefix         = "acquisition-control/v1/"
  estimated_compute_cost = var.reviewed_instance_hourly_usd * var.maximum_lifetime_hours
  role_principal         = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.aws_experiment.name}/attribute.aws_role/${local.name}"
  tags = {
    Project         = "nexcut-aws-acquisition-egress"
    Environment     = "controlled-experiment"
    MaximumLifetime = "8h"
    YouTubeAttempts = "0"
  }
}

resource "aws_vpc" "experiment" {
  cidr_block           = "10.87.0.0/24"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = local.name }
}

resource "aws_subnet" "experiment" {
  vpc_id                  = aws_vpc.experiment.id
  cidr_block              = "10.87.0.0/26"
  map_public_ip_on_launch = false

  tags = { Name = local.name }
}

resource "aws_internet_gateway" "experiment" {
  vpc_id = aws_vpc.experiment.id
  tags   = { Name = local.name }
}

resource "aws_route_table" "experiment" {
  vpc_id = aws_vpc.experiment.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.experiment.id
  }

  tags = { Name = local.name }
}

resource "aws_route_table_association" "experiment" {
  subnet_id      = aws_subnet.experiment.id
  route_table_id = aws_route_table.experiment.id
}

resource "aws_eip" "experiment" {
  domain = "vpc"
  tags   = { Name = local.name }
}

resource "aws_security_group" "experiment" {
  name        = local.name
  description = "No ingress; SSM-only controlled acquisition experiment"
  vpc_id      = aws_vpc.experiment.id

  egress {
    description = "HTTPS only for SSM, package authorities, GCP APIs, and fixed benign egress proof"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "VPC resolver UDP"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = ["10.87.0.2/32"]
  }

  egress {
    description = "VPC resolver TCP"
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    cidr_blocks = ["10.87.0.2/32"]
  }

  tags = { Name = local.name }
}

resource "aws_iam_role" "experiment" {
  name = local.name
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.experiment.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "experiment" {
  name = local.name
  role = aws_iam_role.experiment.name
}

resource "google_iam_workload_identity_pool" "aws_experiment" {
  workload_identity_pool_id = local.gcp_pool_id
  display_name              = "NEXCUT AWS Acquisition"
  description               = "Isolated AWS controlled-host comparison; no Production runtime identity reuse."
}

resource "google_iam_workload_identity_pool_provider" "aws_experiment" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.aws_experiment.workload_identity_pool_id
  workload_identity_pool_provider_id = local.gcp_provider_id
  display_name                       = "AWS Tokyo controlled host"

  aws {
    account_id = var.aws_account_id
  }

  attribute_mapping = {
    "google.subject"         = "assertion.arn"
    "attribute.account"      = "assertion.account"
    "attribute.aws_role"     = "assertion.arn.extract('assumed-role/{role_name}/')"
    "attribute.aws_instance" = "assertion.arn.extract('assumed-role/{role_and_session}').extract('/{session}')"
  }

  attribute_condition = "assertion.account == '${var.aws_account_id}' && attribute.aws_role == '${local.name}'"
}

resource "google_service_account" "aws_experiment" {
  account_id   = local.gcp_service_account_id
  display_name = "NEXCUT AWS acquisition experiment"
  description  = "Dedicated short-lived WIF identity for the controlled AWS host."
}

resource "google_service_account_iam_member" "aws_experiment_impersonator" {
  service_account_id = google_service_account.aws_experiment.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.role_principal
}

resource "google_artifact_registry_repository_iam_member" "aws_experiment_reader" {
  project    = var.gcp_project_id
  location   = "asia-northeast1"
  repository = "nexcut-production"
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.aws_experiment.email}"
}

resource "google_storage_bucket" "experiment" {
  name                        = local.experiment_bucket
  location                    = "ASIA-NORTHEAST1"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 1
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket_iam_member" "aws_experiment_objects" {
  bucket = google_storage_bucket.experiment.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.aws_experiment.email}"
}

resource "aws_instance" "experiment" {
  ami                                  = var.amazon_linux_2023_ami
  instance_type                        = var.instance_type
  subnet_id                            = aws_subnet.experiment.id
  vpc_security_group_ids               = [aws_security_group.experiment.id]
  iam_instance_profile                 = aws_iam_instance_profile.experiment.name
  associate_public_ip_address          = false
  key_name                             = null
  user_data_replace_on_change          = true
  instance_initiated_shutdown_behavior = "terminate"

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
    instance_metadata_tags      = "disabled"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 30
    encrypted             = true
    delete_on_termination = true
  }

  user_data = templatefile("${path.module}/templates/user-data.sh.tftpl", {
    aws_region                     = var.aws_region
    expected_eip                   = aws_eip.experiment.public_ip
    maximum_lifetime_hours         = var.maximum_lifetime_hours
    gcp_project_number             = data.google_project.production.number
    gcp_pool_id                    = local.gcp_pool_id
    gcp_provider_id                = local.gcp_provider_id
    gcp_service_account            = google_service_account.aws_experiment.email
    experiment_bucket              = google_storage_bucket.experiment.name
    production_bucket              = "nexcut-prod-jp-2026-media"
    worker_image                   = var.worker_image
    provider_image                 = var.provider_image
    readiness_script_gzip          = base64gzip(file("${path.module}/runtime/readiness"))
    run_once_script_gzip           = base64gzip(file("${path.module}/runtime/run-once"))
    safeguard_verifier_script_gzip = base64gzip(file("${path.module}/runtime/verify-safeguard.py"))
  })

  lifecycle {
    precondition {
      condition     = data.aws_caller_identity.current.account_id == var.aws_account_id
      error_message = "Authenticated AWS account does not match the approved authority."
    }
    precondition {
      condition     = data.aws_ssm_parameter.amazon_linux_2023.value == var.amazon_linux_2023_ami
      error_message = "The official AL2023 AMI authority changed after review."
    }
    precondition {
      condition     = local.estimated_compute_cost < var.spend_ceiling_usd
      error_message = "Reviewed compute estimate exceeds the Owner spend ceiling."
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.ssm_core,
    google_service_account_iam_member.aws_experiment_impersonator,
    google_artifact_registry_repository_iam_member.aws_experiment_reader,
    google_storage_bucket_iam_member.aws_experiment_objects,
  ]

  tags = { Name = local.name }
}

check "experiment_user_data_size" {
  assert {
    condition     = length(aws_instance.experiment.user_data) <= 15000
    error_message = "Rendered experiment user_data must remain within the 15,000-byte safety budget."
  }
}

resource "aws_eip_association" "experiment" {
  allocation_id = aws_eip.experiment.id
  instance_id   = aws_instance.experiment.id
}

resource "aws_ssm_document" "experiment" {
  name            = "NexcutAcquisitionExperimentRunbook"
  document_type   = "Command"
  document_format = "JSON"
  target_type     = "/AWS::EC2::Instance"

  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Fixed NEXCUT experiment readiness/run-once entry points only"
    parameters = {
      Action = {
        type           = "String"
        allowedPattern = "^(readiness|run-once)$"
        description    = "Closed action enum; no arbitrary command input"
      }
    }
    mainSteps = [{
      action = "aws:runShellScript"
      name   = "runClosedEntryPoint"
      inputs = {
        runCommand = [
          "if [ '{{ Action }}' = 'readiness' ]; then exec /opt/nexcut-experiment/readiness; fi",
          "if [ '{{ Action }}' = 'run-once' ]; then exec /opt/nexcut-experiment/run-once; fi",
          "exit 64",
        ]
      }
    }]
  })
}
