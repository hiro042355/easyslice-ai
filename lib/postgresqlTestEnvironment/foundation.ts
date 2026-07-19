import { randomBytes } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Network, type StartedNetwork } from "testcontainers";
import type { Pool } from "pg";
import { POSTGRESQL_NETWORK_ALIAS, POSTGRESQL_STARTUP_TIMEOUT_MS, POSTGRESQL_TEST_IMAGE } from "./constants";
import { createPostgreSqlTestPool, type PostgreSqlTestConnection } from "./connectionFactory";
import { validatePostgreSqlFoundationEnvironment } from "./environmentValidator";
import { runFlywayMigrate, runFlywayValidate, type FlywayRun } from "./flywayRunner";
import { waitForPostgreSqlReadiness, type PostgreSqlReadiness } from "./readiness";

export type PostgreSqlTestEnvironment = Readonly<{
  connection: PostgreSqlTestConnection;
  pool: Pool;
  readiness: PostgreSqlReadiness;
  flyway: Readonly<{ migrate: FlywayRun; validate: FlywayRun }>;
  containerId: string;
  networkId: string;
  replayMigrations: () => Promise<FlywayRun>;
  validateMigrations: () => Promise<FlywayRun>;
  stop: () => Promise<void>;
}>;

const ephemeralIdentifier = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;

export async function startPostgreSqlTestEnvironment(options: Readonly<{ migrationTarget?: string }> = {}): Promise<PostgreSqlTestEnvironment> {
  validatePostgreSqlFoundationEnvironment();
  let network: StartedNetwork | undefined;
  let postgres: StartedPostgreSqlContainer | undefined;
  let pool: Pool | undefined;
  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    const failures: unknown[] = [];
    if (pool) await pool.end().catch((error: unknown) => failures.push(error));
    if (postgres) await postgres.stop({ timeout: 10_000, remove: true, removeVolumes: true }).catch((error: unknown) => failures.push(error));
    if (network) await network.stop().catch((error: unknown) => failures.push(error));
    if (failures.length) throw new AggregateError(failures, "postgresql-foundation-teardown-failed");
  };

  try {
    network = await new Network().start();
    const database = ephemeralIdentifier("foundation");
    const user = ephemeralIdentifier("foundation_user");
    const password = randomBytes(24).toString("base64url");
    postgres = await new PostgreSqlContainer(POSTGRESQL_TEST_IMAGE)
      .withDatabase(database)
      .withUsername(user)
      .withPassword(password)
      .withEnvironment({ TZ: "UTC" })
      .withCommand(["postgres", "-c", "timezone=UTC"])
      .withNetwork(network)
      .withNetworkAliases(POSTGRESQL_NETWORK_ALIAS)
      .withStartupTimeout(POSTGRESQL_STARTUP_TIMEOUT_MS)
      .start();
    const connection: PostgreSqlTestConnection = { host: postgres.getHost(), port: postgres.getPort(), database, user, password };
    pool = createPostgreSqlTestPool(connection);
    const readiness = await waitForPostgreSqlReadiness(pool);
    const flywayConnection = { database, user, password };
    const migrate = await runFlywayMigrate(network, flywayConnection, options.migrationTarget ? { target: options.migrationTarget } : undefined);
    const validate = await runFlywayValidate(network, flywayConnection, options.migrationTarget ? { target: options.migrationTarget } : undefined);
    const flyway = { migrate, validate };
    return {
      connection,
      pool,
      readiness,
      flyway,
      containerId: postgres.getId(),
      networkId: network.getId(),
      replayMigrations: () => runFlywayMigrate(network!, flywayConnection),
      validateMigrations: () => runFlywayValidate(network!, flywayConnection),
      stop,
    };
  } catch (error) {
    await stop().catch(() => undefined);
    throw error;
  }
}
