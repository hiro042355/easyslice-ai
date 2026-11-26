/**
 * Pinned identities for the NEXCUT staging environment.
 *
 * These values are intentionally hard-coded (not env-configurable) so that a
 * misconfigured staging deployment can never borrow production authority.
 * Product Owner decisions: PO-02 (staging bucket `easyslice-staging-media-artifacts`),
 * PO-03 (staging database `easyslice_staging`), PO-04 (staging service account).
 */
export const STAGING_PROJECT_ID = "nexcut-staging" as const;
export const STAGING_REGION = "asia-northeast1" as const;
export const STAGING_MEDIA_BUCKET = "easyslice-staging-media-artifacts" as const;
export const STAGING_CLOUD_SQL_DATABASE = "easyslice_staging" as const;
export const STAGING_SERVICE_ACCOUNT_ID = "easyslice-staging-sa" as const;
export const STAGING_SERVICE_ACCOUNT_EMAIL = `${STAGING_SERVICE_ACCOUNT_ID}@${STAGING_PROJECT_ID}.iam.gserviceaccount.com` as const;
/** Cloud SQL IAM database user name (Google truncates the domain for database users). */
export const STAGING_DATABASE_IAM_USER = `${STAGING_SERVICE_ACCOUNT_ID}@${STAGING_PROJECT_ID}.iam` as const;
export const STAGING_WIF_POOL_ID = "vercel-staging" as const;
export const STAGING_WIF_PROVIDER_ID = "vercel-staging" as const;
export const STAGING_APP_ORIGIN = "https://staging.nexcut.app" as const;

/**
 * WIF provider audiences are keyed by project *number*, which is only known after
 * the staging project exists (`gcloud projects describe nexcut-staging --format='value(projectNumber)'`).
 * We therefore pin the pool/provider names and require a numeric project, instead of
 * inventing a project number.
 */
export const STAGING_WIF_PROVIDER_RESOURCE_PATTERN =
  /^projects\/\d{6,20}\/locations\/global\/workloadIdentityPools\/vercel-staging\/providers\/vercel-staging$/;

export const STAGING_INSTANCE_CONNECTION_NAME_PATTERN =
  /^nexcut-staging:asia-northeast1:[a-z][a-z0-9-]{0,97}$/;

export const isStagingWifProviderResource = (value: string): boolean =>
  STAGING_WIF_PROVIDER_RESOURCE_PATTERN.test(value);

export const isStagingInstanceConnectionName = (value: string): boolean =>
  STAGING_INSTANCE_CONNECTION_NAME_PATTERN.test(value);
