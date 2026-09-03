import { getVercelOidcToken } from "@vercel/oidc";
import type { IdentityPoolClient } from "google-auth-library";
import { PostgreSQLConnectionPoolAdapter } from "../productionWorkflowRuntime/postgresqlDriver/postgresqlConnectionPool";
import type {
  PostgreSQLConnectionPool,
  PostgreSQLConnectorConnectionConfig,
} from "../productionWorkflowRuntime/postgresqlDriver/types";
import {
  createProductionMediaWifClient,
  readProductionMediaWifConfiguration,
} from "../productionMediaRuntime/mediaWifCredential";
import {
  createProductionCloudSqlConnectorAuthority,
  type ProductionCloudSqlConfiguration,
  type ProductionCloudSqlConnectorAuthority,
} from "./cloudSqlConnectorAuthority";

type RuntimeState = "created" | "starting" | "ready" | "failed" | "closing" | "closed";

type Dependencies = Readonly<{
  createAuthClient(): IdentityPoolClient;
  createConnectorAuthority(
    authClient: IdentityPoolClient,
    configuration: ProductionCloudSqlConfiguration,
  ): ProductionCloudSqlConnectorAuthority;
  createPool(configuration: PostgreSQLConnectorConnectionConfig): PostgreSQLConnectionPool;
}>;

const required = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`Missing Production database configuration: ${name}`);
  return value;
};

const defaultDependencies: Dependencies = Object.freeze({
  createAuthClient() {
    return createProductionMediaWifClient(
      readProductionMediaWifConfiguration(),
      () => getVercelOidcToken(),
    );
  },
  createConnectorAuthority: createProductionCloudSqlConnectorAuthority,
  createPool: (configuration) => new PostgreSQLConnectionPoolAdapter(configuration),
});

export class ProductionPostgresqlRuntime {
  private runtimeState: RuntimeState = "created";
  private startupPromise: Promise<PostgreSQLConnectionPool> | undefined;
  private pool: PostgreSQLConnectionPool | undefined;
  private connectorAuthority: ProductionCloudSqlConnectorAuthority | undefined;
  private shutdownPromise: Promise<void> | undefined;
  private startupCleanupFailed = false;

  constructor(
    private readonly configuration: ProductionCloudSqlConfiguration,
    private readonly dependencies: Dependencies = defaultDependencies,
  ) {}

  state(): RuntimeState { return this.runtimeState; }

  private hasTerminalIntent(): boolean {
    return this.runtimeState === "closing" || this.runtimeState === "closed";
  }

  acquire(): Promise<PostgreSQLConnectionPool> {
    if (this.hasTerminalIntent()) {
      return Promise.reject(new Error("Production PostgreSQL runtime is closed"));
    }
    if (this.startupPromise) return this.startupPromise;
    this.runtimeState = "starting";
    this.startupPromise = this.start();
    return this.startupPromise;
  }

  private async start(): Promise<PostgreSQLConnectionPool> {
    let authority: ProductionCloudSqlConnectorAuthority | undefined;
    let pool: PostgreSQLConnectionPool | undefined;
    try {
      const authClient = this.dependencies.createAuthClient();
      authority = this.dependencies.createConnectorAuthority(authClient, this.configuration);
      const driverOptions = await authority.getDriverOptions();
      if (this.hasTerminalIntent()) {
        throw new Error("Production PostgreSQL startup was cancelled");
      }
      pool = this.dependencies.createPool({
        database: authority.database,
        user: authority.iamUser,
        connectorDriverOptions: Object.freeze({ stream: driverOptions.stream }),
        maxConnections: 8,
        connectionTimeoutMs: 10_000,
        idleTimeoutMs: 30_000,
        queryTimeoutMs: 10_000,
        applicationName: "nexcut-production-workflow",
      });
      const started = await pool.start();
      if (started !== "ready" && started !== "already-started") throw new Error("Production PostgreSQL pool startup failed");
      if (this.hasTerminalIntent()) {
        throw new Error("Production PostgreSQL startup was cancelled");
      }
      this.connectorAuthority = authority;
      this.pool = pool;
      this.runtimeState = "ready";
      return pool;
    } catch {
      this.startupCleanupFailed = await this.cleanup(pool, authority);
      if (!this.hasTerminalIntent()) this.runtimeState = "failed";
      throw new Error("Production PostgreSQL runtime is unavailable");
    }
  }

  private async cleanup(
    pool: PostgreSQLConnectionPool | undefined,
    authority: ProductionCloudSqlConnectorAuthority | undefined,
  ): Promise<boolean> {
    let failed = false;
    if (pool) {
      try { await pool.close(); } catch { failed = true; }
    }
    if (authority) {
      try { authority.close(); } catch { failed = true; }
    }
    return failed;
  }

  shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.runtimeState = "closing";
    const startupAtShutdown = this.startupPromise;
    this.shutdownPromise = this.finishShutdown(startupAtShutdown);
    return this.shutdownPromise;
  }

  private async finishShutdown(startupAtShutdown: Promise<PostgreSQLConnectionPool> | undefined): Promise<void> {
    try { await startupAtShutdown; } catch { /* startup performed its own closed cleanup */ }
    const cleanupFailed = await this.cleanup(this.pool, this.connectorAuthority);
    this.pool = undefined;
    this.connectorAuthority = undefined;
    this.runtimeState = "closed";
    if (cleanupFailed || this.startupCleanupFailed) throw new Error("Production PostgreSQL runtime shutdown failed");
  }
}

export function createProductionPostgresqlRuntime(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: Dependencies = defaultDependencies,
): ProductionPostgresqlRuntime {
  return new ProductionPostgresqlRuntime({
    instanceConnectionName: required("CLOUD_SQL_INSTANCE_CONNECTION_NAME", environment.CLOUD_SQL_INSTANCE_CONNECTION_NAME),
    database: required("POSTGRES_DATABASE", environment.POSTGRES_DATABASE),
    iamUser: required("POSTGRES_IAM_USER", environment.POSTGRES_IAM_USER),
  }, dependencies);
}
