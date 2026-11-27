import type { IdentityPoolClient } from "google-auth-library";
import { Pool } from "pg";
import {
  createProductionCloudSqlConnectorAuthority,
  type ProductionCloudSqlConfiguration,
  type ProductionCloudSqlConnectorAuthority,
} from "../productionDatabaseRuntime/cloudSqlConnectorAuthority";

export type ProductionMediaCloudSqlConfiguration = ProductionCloudSqlConfiguration;

type Dependencies = Readonly<{
  createConnectorAuthority(
    authClient: IdentityPoolClient,
    configuration: ProductionCloudSqlConfiguration,
  ): ProductionCloudSqlConnectorAuthority;
  createPool(configuration: ConstructorParameters<typeof Pool>[0]): Pool;
}>;

const defaultDependencies: Dependencies = Object.freeze({
  createConnectorAuthority: createProductionCloudSqlConnectorAuthority,
  createPool: (configuration) => new Pool(configuration),
});

export const validateMediaCloudSqlAuthority = (
  environment: string | undefined,
  configuration: ProductionMediaCloudSqlConfiguration,
): void => {
  if (!environment || (environment !== "production" && environment !== "staging")) {
    throw new Error(`Unauthorized or missing APP_ENVIRONMENT: ${String(environment)}`);
  }
  if (!configuration.instanceConnectionName) {
    throw new Error("Missing Cloud SQL instance connection name");
  }
  if (!configuration.database) {
    throw new Error("Missing Cloud SQL database name");
  }
  if (!configuration.iamUser) {
    throw new Error("Missing Cloud SQL IAM user");
  }

  if (environment === "production") {
    if (configuration.instanceConnectionName !== "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql") {
      throw new Error("Invalid Production Cloud SQL authority: instance mismatch");
    }
    if (configuration.database !== "nexcut") {
      throw new Error("Invalid Production Cloud SQL authority: database mismatch");
    }
    if (configuration.iamUser !== "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam") {
      throw new Error("Invalid Production Cloud SQL authority: IAM user mismatch");
    }
  } else if (environment === "staging") {
    if (
      configuration.instanceConnectionName === "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql" ||
      configuration.database === "nexcut" ||
      configuration.iamUser === "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam"
    ) {
      throw new Error("Invalid Staging Cloud SQL authority: production database credentials cannot be used in staging");
    }
    throw new Error("Staging Cloud SQL authority requires explicit Product Owner configuration approval");
  }
};

export const withProductionMediaCloudSqlPool = async <T>(
  authClient: IdentityPoolClient,
  configuration: ProductionMediaCloudSqlConfiguration,
  operation: (pool: Pool) => Promise<T>,
  dependencies: Dependencies = defaultDependencies,
  environment: string | undefined = process.env.APP_ENVIRONMENT,
): Promise<T> => {
  validateMediaCloudSqlAuthority(environment, configuration);
  const authority = dependencies.createConnectorAuthority(authClient, configuration);
  let pool: Pool | undefined;
  let outcome: Readonly<{ status: "success"; value: T }> | Readonly<{ status: "failure"; error: unknown }>;
  try {
    const options = await authority.getDriverOptions();
    pool = dependencies.createPool({
      ...options,
      user: authority.iamUser,
      database: authority.database,
      max: 1,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 1_000,
      query_timeout: 10_000,
    });
    outcome = Object.freeze({ status: "success", value: await operation(pool) });
  } catch (error) {
    outcome = Object.freeze({ status: "failure", error });
  }

  const cleanupErrors: unknown[] = [];
  try {
    await pool?.end();
  } catch (error) {
    cleanupErrors.push(error);
  }

  try {
    authority.close();
  } catch (error) {
    cleanupErrors.push(error);
  }

  if (outcome.status === "success") {
    if (cleanupErrors.length > 0) {
      throw new Error("Production media Cloud SQL cleanup failed");
    }
    return outcome.value;
  }

  throw outcome.error;
};
