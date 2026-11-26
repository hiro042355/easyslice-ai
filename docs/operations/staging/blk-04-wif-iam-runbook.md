# BLK-04: Vercel staging → GCP Workload Identity Federation

Status: **configuration code complete, not applied.** No staging pool, provider,
service account, or IAM binding has been created by this branch.

## Authority

`infra/staging/gcp/vercel-wif.tf` and `media-storage.tf` define a dedicated
staging identity. Production (`nexcut-prod-jp-2026`, pool `nexcut-prod-vercel`)
is never referenced.

| Object | Value |
| :--- | :--- |
| Workload Identity pool | `vercel-staging` |
| Provider | `vercel-staging` |
| Provider resource | `projects/<staging project number>/locations/global/workloadIdentityPools/vercel-staging/providers/vercel-staging` |
| Service account | `easyslice-staging-sa@nexcut-staging.iam.gserviceaccount.com` |
| SA role on project | `roles/cloudsql.client`, `roles/cloudsql.instanceUser` |
| SA role on bucket | `roles/storage.objectAdmin` on `easyslice-staging-media-artifacts` only |
| Federation role on SA | `roles/iam.workloadIdentityUser` for `attribute.environment/preview` |

The staging project number is discovered at apply time
(`gcloud projects describe nexcut-staging --format='value(projectNumber)'`); it
is not invented in code or documentation. The runtime accepts any provider
resource whose shape is exactly
`projects/<numeric>/locations/global/workloadIdentityPools/vercel-staging/providers/vercel-staging`,
and rejects the production project number and the production pool/provider name.

## Why the condition is shaped this way

Vercel OIDC tokens contain `sub`, `owner_id`, `project_id`, and `environment`,
but no git branch claim. Branch-based conditions are therefore impossible. The
provider enforces all of:

```
assertion.owner_id == '<vercel team id>'
&& assertion.project_id == '<vercel staging project id>'
&& assertion.environment == 'preview'
```

Combined with a staging-only GCP project, a staging-only pool/provider, and a
bucket-scoped service account, a production deployment token cannot obtain
staging credentials, and a staging token cannot touch production resources.
The issuer and audience must be the Vercel production OIDC issuer/audience
values; the variables reject values containing `prod` and the localhost issuer.

## Approval gate

Creating the pool, provider, service account, or bindings is a real IAM change.
Do not run `terraform apply` before PO approval of PO-04 (change ticket id
recorded). Do not create service-account keys: WIF is the only credential path.

## Preconditions

- `vercel_team_id` matches `^team_…$` and `vercel_project_id` matches `^prj_…$`.
- `vercel_oidc_issuer_uri` is `https://oidc.vercel.com/<team>` and
  `vercel_oidc_audience` is `https://vercel.com/<team>` (the root rejects
  `prod`, `localhost`, and any other host).
- `staging_app_origin` is `https://staging.nexcut.app`.
- The staging Cloud SQL instance exists (or will be created in the same
  approved change) so `roles/cloudsql.client` and `roles/cloudsql.instanceUser`
  are meaningful.

## Apply (approval required)

```bash
terraform -chdir=infra/staging/gcp plan -out=staging.tfplan \
  -var="project_id=nexcut-staging" \
  -var="staging_app_origin=https://staging.nexcut.app" \
  -var="vercel_team_id=team_..." \
  -var="vercel_project_id=prj_..." \
  -var="vercel_oidc_issuer_uri=https://oidc.vercel.com/team_..." \
  -var="vercel_oidc_audience=https://vercel.com/team_..."
terraform -chdir=infra/staging/gcp apply staging.tfplan
```

`terraform validate` is executed in CI
(`.github/workflows/staging-infrastructure.yml`) because the local Windows host
blocks the provider binary via Application Control. That does not replace the
approved apply.

## Verification after apply

```bash
gcloud iam workload-identity-pools describe vercel-staging \
  --project=nexcut-staging --location=global
gcloud iam workload-identity-pools providers describe vercel-staging \
  --project=nexcut-staging --location=global \
  --workload-identity-pool=vercel-staging
gcloud iam service-accounts get-iam-policy \
  easyslice-staging-sa@nexcut-staging.iam.gserviceaccount.com \
  --project=nexcut-staging
gcloud projects get-iam-policy nexcut-staging \
  --flatten='bindings[].members' \
  --filter='bindings.members:easyslice-staging-sa@nexcut-staging.iam.gserviceaccount.com' \
  --format='table(bindings.role)'
```

Expected:

- Provider `attributeCondition` contains the staging team, staging project, and
  `assertion.environment == 'preview'`.
- SA IAM policy has exactly one `roles/iam.workloadIdentityUser` member:
  `principalSet://iam.googleapis.com/projects/<number>/locations/global/workloadIdentityPools/vercel-staging/attribute.environment/preview`.
- Project roles for the SA are only `roles/cloudsql.client` and
  `roles/cloudsql.instanceUser` (plus any explicitly approved additions). No
  `roles/editor`, `roles/owner`, `roles/storage.admin`, or
  `roles/iam.serviceAccountTokenCreator`.
- No service-account key exists:
  `gcloud iam service-accounts keys list --iam-account=easyslice-staging-sa@nexcut-staging.iam.gserviceaccount.com`
  lists only Google-managed keys.

## Runtime configuration (staging deployment)

| Variable | Value |
| :--- | :--- |
| `APP_ENVIRONMENT` | `staging` |
| `GCP_PROJECT_ID` | `nexcut-staging` |
| `GCP_WIF_PROVIDER_RESOURCE` | provider resource with the staging project number |
| `GCP_MEDIA_WIF_SERVICE_ACCOUNT` | `easyslice-staging-sa@nexcut-staging.iam.gserviceaccount.com` |
| `MEDIA_BUCKET_NAME` | `easyslice-staging-media-artifacts` |

`readProductionMediaWifConfiguration` validates this tuple and rejects
production values, the production pool name, a mismatched project, and an
unknown environment. `AUTHORIZED_PROJECT_MAP` in `gcsAdapter.ts` restricts each
environment to its own project, closing the earlier cross-environment bug where
staging resolved to the production project.

## Diagnosis

| Symptom | Likely cause | Action |
| :--- | :--- | :--- |
| `invalid_grant` / `unauthorized_client` from STS | Condition mismatch (team/project/environment) | Compare the token claims with `attribute_condition`; staging deployments must use the staging Vercel project |
| `403 iam.serviceAccounts.getAccessToken` | principalSet missing or wrong pool | Confirm the SA policy member and the pool name |
| `403 storage.objects.create` despite STS success | Bucket IAM missing or wrong bucket | Confirm `MEDIA_BUCKET_NAME` and the bucket-scoped binding |
| Cloud SQL login denied | `roles/cloudsql.instanceUser` missing, or DB user is not `easyslice-staging-sa@nexcut-staging.iam` | Check the role and the database user; do not use password auth |
| Production credentials accepted in staging | Configuration bypass | This must fail; runtime validation rejects production values — treat any success as a defect |

## Rollback

Remove the SA IAM member, the two project role bindings, and the pool/provider
in a reviewed change. The service account and its bucket binding are shared with
BLK-03, so remove storage access only after staging uploads are drained. Never
delete the pool while staging deployments are running: they will fail closed,
which is safer than a credential fallback, but it is still an outage.
