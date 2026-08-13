import "server-only";
import { getVercelOidcToken } from "@vercel/oidc";
import { createProductionMediaWifClient, readProductionMediaWifConfiguration } from "./mediaWifCredential";
import { createProductionMediaBucket } from "./gcsAdapter";
import { withProductionMediaCloudSqlPool } from "./cloudSqlAdapter";
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
  const configuration = readProductionMediaWifConfiguration();
  const auth = createProductionMediaWifClient(configuration, () => getVercelOidcToken());
  const bucket = createProductionMediaBucket(auth, required("MEDIA_BUCKET_NAME", process.env.MEDIA_BUCKET_NAME));
  return withProductionMediaCloudSqlPool(auth, {
    instanceConnectionName: required("CLOUD_SQL_INSTANCE_CONNECTION_NAME", process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME),
    database: required("POSTGRES_DATABASE", process.env.POSTGRES_DATABASE),
    iamUser: required("POSTGRES_IAM_USER", process.env.POSTGRES_IAM_USER),
  }, (pool) => operation(Object.freeze({ pool, bucket })));
};
