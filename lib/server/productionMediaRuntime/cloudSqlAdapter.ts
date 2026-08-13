import { AuthTypes, Connector, IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import type { IdentityPoolClient } from "google-auth-library";
import { Pool } from "pg";

export type ProductionMediaCloudSqlConfiguration = Readonly<{
  instanceConnectionName: string;
  database: string;
  iamUser: string;
}>;

export const withProductionMediaCloudSqlPool = async <T>(
  authClient: IdentityPoolClient,
  configuration: ProductionMediaCloudSqlConfiguration,
  operation: (pool: Pool) => Promise<T>,
): Promise<T> => {
  if (configuration.instanceConnectionName !== "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql") throw new Error("Invalid Production Cloud SQL authority");
  if (configuration.database !== "nexcut") throw new Error("Invalid Production database authority");
  if (configuration.iamUser !== "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam") throw new Error("Invalid Production IAM database user authority");
  type ConnectorAuth = NonNullable<ConstructorParameters<typeof Connector>[0]>["auth"];
  const connector = new Connector({ auth: authClient as unknown as ConnectorAuth });
  let pool: Pool | undefined;
  try {
    const options = await connector.getOptions({
      instanceConnectionName: configuration.instanceConnectionName,
      ipType: IpAddressTypes.PUBLIC,
      authType: AuthTypes.IAM,
    });
    pool = new Pool({
      ...options,
      user: configuration.iamUser,
      database: configuration.database,
      max: 1,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 1_000,
      query_timeout: 10_000,
    });
    return await operation(pool);
  } finally {
    if (pool) await pool.end();
    connector.close();
  }
};
