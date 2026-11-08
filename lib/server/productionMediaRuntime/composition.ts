import "server-only";
import { getVercelOidcToken } from "@vercel/oidc";
import { createProductionMediaWifClient, readProductionMediaWifConfiguration } from "./mediaWifCredential";
import { createProductionMediaBucket } from "./gcsAdapter";
import { withProductionMediaCloudSqlPool, validateMediaCloudSqlAuthority } from "./cloudSqlAdapter";
import type { Pool } from "pg";

const required = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`Missing Production media configuration: ${name}`);
  return value;
};

export type ProductionMediaRuntimeResources = Readonly<{
  pool: Pool;
  bucket: ReturnType<typeof createProductionMediaBucket>;
}>;

export const withProductionMediaRuntime = async <T>(
  operation: (resources: ProductionMediaRuntimeResources) => Promise<T>,
): Promise<T> => {
  // Step 1: Environment guard - required before any client/credential initialization
  const environment = required("APP_ENVIRONMENT", process.env.APP_ENVIRONMENT);

  // Step 2: Validate WIF configuration before fetching OIDC token or initializing client
  const configuration = readProductionMediaWifConfiguration(process.env, environment);
  const auth = createProductionMediaWifClient(configuration, () => getVercelOidcToken());

  // Step 3: Validate GCS bucket authority
  const bucketName = required("MEDIA_BUCKET_NAME", process.env.MEDIA_BUCKET_NAME);
  const bucket = createProductionMediaBucket(auth, bucketName, environment);

  // Step 4: Validate Cloud SQL configuration tuple before opening pool/connections
  const cloudSqlConfig = Object.freeze({
    instanceConnectionName: required("CLOUD_SQL_INSTANCE_CONNECTION_NAME", process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME),
    database: required("POSTGRES_DATABASE", process.env.POSTGRES_DATABASE),
    iamUser: required("POSTGRES_IAM_USER", process.env.POSTGRES_IAM_USER),
  });
  validateMediaCloudSqlAuthority(environment, cloudSqlConfig);

  return withProductionMediaCloudSqlPool(
    auth,
    cloudSqlConfig,
    (pool) => operation(Object.freeze({ pool, bucket })),
    undefined,
    environment,
  );
};
