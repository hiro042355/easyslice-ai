import { AuthTypes, Connector, IpAddressTypes, type DriverOptions } from "@google-cloud/cloud-sql-connector";
import type { IdentityPoolClient } from "google-auth-library";
import {
  isStagingInstanceConnectionName,
  STAGING_CLOUD_SQL_DATABASE,
  STAGING_DATABASE_IAM_USER,
} from "../../staging/stagingEnvironment";

export type ProductionCloudSqlConfiguration = Readonly<{
  instanceConnectionName: string;
  database: string;
  iamUser: string;
}>;

export type ProductionCloudSqlConnector = Readonly<{
  getOptions(options: Readonly<{
    instanceConnectionName: string;
    ipType: IpAddressTypes;
    authType: AuthTypes;
  }>): Promise<DriverOptions>;
  close(): void;
}>;

export type ProductionCloudSqlConnectorAuthority = Readonly<{
  database: string;
  iamUser: string;
  getDriverOptions(): Promise<DriverOptions>;
  close(): void;
}>;

type Dependencies = Readonly<{
  createConnector(authClient: IdentityPoolClient): ProductionCloudSqlConnector;
}>;

const defaultDependencies: Dependencies = Object.freeze({
  createConnector(authClient) {
    type ConnectorAuth = NonNullable<ConstructorParameters<typeof Connector>[0]>["auth"];
    return new Connector({ auth: authClient as unknown as ConnectorAuth });
  },
});

function validate(configuration: ProductionCloudSqlConfiguration): void {
  // The staging tuple is recognized structurally. The caller (media runtime or
  // PostgreSQL runtime) has already validated APP_ENVIRONMENT and the WIF service
  // account, so a staging tuple can only reach this point under staging authority.
  if (isStagingInstanceConnectionName(configuration.instanceConnectionName)) {
    if (configuration.database !== STAGING_CLOUD_SQL_DATABASE) {
      throw new Error("Invalid Staging database authority");
    }
    if (configuration.iamUser !== STAGING_DATABASE_IAM_USER) {
      throw new Error("Invalid Staging IAM database user authority");
    }
    return;
  }
  if (configuration.instanceConnectionName !== "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql") {
    throw new Error("Invalid Production Cloud SQL authority");
  }
  if (configuration.database !== "nexcut") throw new Error("Invalid Production database authority");
  if (configuration.iamUser !== "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam") {
    throw new Error("Invalid Production IAM database user authority");
  }
}

export function createProductionCloudSqlConnectorAuthority(
  authClient: IdentityPoolClient,
  configuration: ProductionCloudSqlConfiguration,
  dependencies: Dependencies = defaultDependencies,
): ProductionCloudSqlConnectorAuthority {
  validate(configuration);
  let connector: ProductionCloudSqlConnector;
  try {
    connector = dependencies.createConnector(authClient);
  } catch {
    throw new Error("Production Cloud SQL transport is unavailable");
  }
  let closed = false;
  let optionsPromise: Promise<DriverOptions> | undefined;

  return Object.freeze({
    database: configuration.database,
    iamUser: configuration.iamUser,
    getDriverOptions() {
      if (closed) return Promise.reject(new Error("Production Cloud SQL authority is closed"));
      optionsPromise ??= connector.getOptions({
        instanceConnectionName: configuration.instanceConnectionName,
        ipType: IpAddressTypes.PUBLIC,
        authType: AuthTypes.IAM,
      }).catch(() => {
        if (!closed) {
          closed = true;
          try { connector.close(); } catch { /* closed diagnostic below */ }
        }
        throw new Error("Production Cloud SQL transport is unavailable");
      });
      return optionsPromise;
    },
    close() {
      if (closed) return;
      closed = true;
      try { connector.close(); }
      catch { throw new Error("Production Cloud SQL authority cleanup failed"); }
    },
  });
}
