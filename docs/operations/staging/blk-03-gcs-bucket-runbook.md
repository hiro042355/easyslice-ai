# BLK-03: `easyslice-staging-media-artifacts` bucket

Status: **configuration code complete, not applied.** No staging bucket exists
because of this branch.

## Implemented configuration

`infra/staging/gcp/media-storage.tf` declares, inside the `nexcut-staging`
project only:

| Property | Value | Reason |
| :--- | :--- | :--- |
| Name | `easyslice-staging-media-artifacts` | Pinned by the design document |
| Location | `ASIA-NORTHEAST1` | Co-located with the staging Cloud SQL region |
| Storage class | `STANDARD` | Short-lived upload staging |
| Lifecycle | Delete objects at age 3 days; abort incomplete multipart uploads at age 1 day | The design allows 3-day retention of raw uploads |
| Versioning | Disabled | No historical object copies for short-lived uploads |
| Soft delete | `retention_duration_seconds = 0` | Avoids hidden retained copies outside the 3-day rule |
| Public access | `public_access_prevention = "enforced"` | No public objects, including signed-URL misuse |
| Uniform access | `uniform_bucket_level_access = true` | No per-object ACLs |
| CORS | `https://staging.nexcut.app`, methods `GET, HEAD, POST, PUT`, response headers `Content-Type, Range`, max age 3600 | Browser resumable upload restricted to the staging origin |
| IAM | `roles/storage.objectAdmin` for `easyslice-staging-sa@…` scoped to this bucket | Read/write objects without project-wide storage rights |
| Protection | `prevent_destroy = true` | Accidental `terraform destroy` cannot delete staged media |
| Labels | `environment = staging`, `managed_by = terraform`, `purpose = media-artifacts` | Cost and inventory attribution |

Uniform bucket-level access means object ACLs cannot override the bucket IAM
policy, so the application must use IAM/WIF credentials and signed URLs; it must
not call `object.makePublic()` or set `public: true` on uploads. The runtime
already writes objects with `nexcutOwnerUid`, `nexcutJobId`, `nexcutMediaId`,
and `nexcutExpectedSize` metadata, and `app/api/media/admit` finalization checks
those values before persisting ownership.

## Approval gate

Creating the bucket, the service account, or the bucket IAM binding is a real
cloud change. Do not run `terraform apply` before PO approval of PO-03 (change
ticket id recorded).

## Preconditions

- Terraform `~> 1.15.0` and provider `~> 7.41.0` (see `versions.tf`).
- `nexcut-staging` project access with permission to create buckets, service
  accounts, and IAM bindings.
- `staging_app_origin` supplied as `https://staging.nexcut.app` (the variable
  rejects any other origin).
- `vercel_team_id` and `vercel_project_id` supplied for BLK-04; they are part of
  the same root, so a plan without them fails validation.

## Plan and apply (approval required)

```bash
terraform -chdir=infra/staging/gcp init
terraform -chdir=infra/staging/gcp fmt -check
terraform -chdir=infra/staging/gcp validate
terraform -chdir=infra/staging/gcp plan -out=staging.tfplan
# Review: exactly one bucket, one service account, one IAM member, plus WIF objects.
terraform -chdir=infra/staging/gcp apply staging.tfplan
```

`terraform validate` requires downloading the provider binary. On the current
developer Windows host an Application Control policy blocks
`terraform-provider-google_v7.41.0_x5.exe`, so validation is executed by the CI
workflow (`.github/workflows/staging-infrastructure.yml`) on `ubuntu-latest`.
That CI run proves configuration validity only; it does not apply anything.

## Verification after apply

```bash
gcloud storage buckets describe gs://easyslice-staging-media-artifacts \
  --project=nexcut-staging --format=json
gcloud storage buckets describe gs://easyslice-staging-media-artifacts \
  --project=nexcut-staging \
  --format='value(lifecycle_config.rule[].condition.age, lifecycle_config.rule[].action.type, iam_config.uniform_bucket_level_access, iam_config.public_access_prevention)'
gcloud storage buckets get-iam-policy gs://easyslice-staging-media-artifacts \
  --project=nexcut-staging
```

Expected:

- `location: ASIA-NORTHEAST1`, `storageClass: STANDARD`.
- Two lifecycle rules: delete at age 3, abort incomplete multipart at age 1.
- `uniformBucketLevelAccess: true`, `publicAccessPrevention: enforced`.
- `corsConfig[0].origin == ["https://staging.nexcut.app"]`.
- IAM policy contains only the staging service account with
  `roles/storage.objectAdmin` on the bucket, plus the project's own owners.
- `gcloud storage buckets describe ... --format='value(versioning_enabled)'`
  is `False`.

Application-level check (after WIF is configured): a staging deployment's
`MEDIA_BUCKET_NAME=easyslice-staging-media-artifacts` with
`GCP_PROJECT_ID=nexcut-staging` must create a resumable upload URL via
`POST /api/media/admit` for an authenticated staging session. Until an
authenticated staging session exists, this remains an acceptance item, not a
verified result.

## Diagnosis

| Symptom | Likely cause | Action |
| :--- | :--- | :--- |
| `403 storage.objects.create` | WIF not bound, or bucket name/project mismatch | Re-check BLK-04 bindings and `MEDIA_BUCKET_NAME`/`GCP_PROJECT_ID` |
| CORS error in browser | Origin not exactly `https://staging.nexcut.app` | Confirm the deployment origin; do not add wildcards |
| Upload succeeds but object is public | Illegal; UBLA/PAP prevents it | Treat as incident; check for IAM changes outside Terraform |
| Object survives beyond 3 days | Lifecycle not applied or object recreated | Re-run `gcloud storage buckets update` through Terraform, inspect labels |
| Signed URL works from another origin | CORS unaffected by signed URLs; storage IAM leaked | Audit bucket IAM and WIF principalSet |

## Rollback

The bucket is protected with `prevent_destroy`. To remove it, remove the
protection in a reviewed change, empty the bucket only after exporting the
evidence required by the change ticket, then apply. Never delete the bucket to
"reset" an environment: the same bucket is the only staging media store, and
deletion is irreversible for objects already past the lifecycle window.
