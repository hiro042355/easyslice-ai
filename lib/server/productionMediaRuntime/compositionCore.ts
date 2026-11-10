import {
  createProductionMediaWifClient,
  readProductionMediaWifConfiguration,
  type ProductionMediaWifConfiguration,
} from "./mediaWifCredential";
import {
  createProductionMediaBucket,
  resolveAuthorizedBucketName,
} from "./gcsAdapter";
import {
  withProductionMediaCloudSqlPool,
  validateMediaCloudSqlAuthority,
  type ProductionMediaCloudSqlConfiguration,
} from "./cloudSqlAdapter";
import type { Pool } from "pg";

const required = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`Missing Production media configuration: ${name}`);
  return value;
};

export type ValidatedMediaRuntimeConfiguration = Readonly<{
  environment: "production" | "staging";
  wifConfiguration: ProductionMediaWifConfiguration;
  authorizedBucketName: string;
  cloudSqlConfiguration: ProductionMediaCloudSqlConfiguration;
}>;

export type MediaRuntimeClientFactories = Readonly<{
  getOidcToken: () => Promise<string>;
  createWifClient: typeof createProductionMediaWifClient;
  createBucket: typeof createProductionMediaBucket;
  withCloudSqlPool: typeof withProductionMediaCloudSqlPool;
}>;

export const createProductionMediaRuntimeClientFactories = (
  getOidcToken: () => Promise<string>,
): MediaRuntimeClientFactories => Object.freeze({
  getOidcToken,
  createWifClient: createProductionMediaWifClient,
  createBucket: createProductionMediaBucket,
  withCloudSqlPool: withProductionMediaCloudSqlPool,
});

/**
 * Phase A: Pure Configuration Validation.
 * Validates the entire environment authority across WIF, GCS, and Cloud SQL.
 * Does NOT create WIF clients, retrieve OIDC tokens, initialize GCS Storage instances,
 * create Cloud SQL connectors, or instantiate database connection pools.
 */
export const validateMediaRuntimeConfiguration = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): ValidatedMediaRuntimeConfiguration => {
  // Step 1: Environment validation
  const rawEnvironment = required("APP_ENVIRONMENT", env.APP_ENVIRONMENT);
  if (rawEnvironment !== "production" && rawEnvironment !== "staging") {
    throw new Error(`Unauthorized or missing APP_ENVIRONMENT: ${rawEnvironment}`);
  }
  const environment = rawEnvironment;

  // Step 2: Pure WIF authority validation (synchronous; no network/OIDC token retrieval)
  const wifConfiguration = readProductionMediaWifConfiguration(env, environment);

  // Step 3: Pure GCS bucket authority validation
  const rawBucketName = required("MEDIA_BUCKET_NAME", env.MEDIA_BUCKET_NAME);
  const authorizedBucketName = resolveAuthorizedBucketName(environment, rawBucketName);

  // Step 4: Pure Cloud SQL connection tuple validation
  const cloudSqlConfiguration = Object.freeze({
    instanceConnectionName: required("CLOUD_SQL_INSTANCE_CONNECTION_NAME", env.CLOUD_SQL_INSTANCE_CONNECTION_NAME),
    database: required("POSTGRES_DATABASE", env.POSTGRES_DATABASE),
    iamUser: required("POSTGRES_IAM_USER", env.POSTGRES_IAM_USER),
  });
  validateMediaCloudSqlAuthority(environment, cloudSqlConfiguration);

  return Object.freeze({
    environment,
    wifConfiguration,
    authorizedBucketName,
    cloudSqlConfiguration,
  });
};

export type ProductionMediaRuntimeResources = Readonly<{
  pool: Pool;
  bucket: ReturnType<typeof createProductionMediaBucket>;
}>;

/**
 * Core media runtime executor.
 * Pure dependency-injectable executor enforcing Phase A (Validation) -> Phase B (Initialization).
 */
export const executeProductionMediaRuntime = async <T>(
  operation: (resources: ProductionMediaRuntimeResources) => Promise<T>,
  factories: MediaRuntimeClientFactories,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<T> => {
  // === Phase A: Pure configuration validation ===
  const validated = validateMediaRuntimeConfiguration(env);

  // === Phase B: Resource initialization (Only after Phase A passes 100%) ===
  // 1. Create WIF client with deferred OIDC supplier
  const auth = factories.createWifClient(validated.wifConfiguration, factories.getOidcToken);

  // 2. Create authorized GCS Storage bucket object
  const bucket = factories.createBucket(auth, validated.authorizedBucketName, validated.environment);

  // 3. Connect Cloud SQL pool and execute callback with callback-scoped cleanup
  return factories.withCloudSqlPool(
    auth,
    validated.cloudSqlConfiguration,
    (pool) => operation(Object.freeze({ pool, bucket })),
    undefined,
    validated.environment,
  );
};
