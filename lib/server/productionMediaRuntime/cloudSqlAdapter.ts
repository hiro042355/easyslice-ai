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

export const withProductionMediaCloudSqlPool = async <T>(
  authClient: IdentityPoolClient,
  configuration: ProductionMediaCloudSqlConfiguration,
  operation: (pool: Pool) => Promise<T>,
  dependencies: Dependencies = defaultDependencies,
): Promise<T> => {
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
  let cleanupFailed = false;
  if (pool) {
    try { await pool.end(); } catch { cleanupFailed = true; }
  }
  try { authority.close(); } catch { cleanupFailed = true; }
  if (outcome.status === "failure") throw outcome.error;
  if (cleanupFailed) throw new Error("Production media Cloud SQL cleanup failed");
  return outcome.value;
};
