import { resolve } from "node:path";
import { GenericContainer, type StartedNetwork, Wait } from "testcontainers";
import { FLYWAY_COMMUNITY_IMAGE, POSTGRESQL_CONTAINER_PORT, POSTGRESQL_NETWORK_ALIAS, POSTGRESQL_STARTUP_TIMEOUT_MS } from "./constants";

export type FlywayConnection = Readonly<{ database: string; user: string; password: string }>;
export type FlywayCommand = "migrate" | "validate";
export type FlywayRun = Readonly<{ image: typeof FLYWAY_COMMUNITY_IMAGE; command: FlywayCommand; succeeded: true }>;
export type FlywayCommandOptions = Readonly<{ target?: string }>;

export const WORKFLOW_MIGRATIONS_PATH = resolve(process.cwd(), "db", "workflow", "migrations");

export async function runFlywayCommand(
  network: StartedNetwork,
  connection: FlywayConnection,
  command: FlywayCommand,
  options: FlywayCommandOptions = {},
): Promise<FlywayRun> {
  const environment = {
    FLYWAY_URL: `jdbc:postgresql://${POSTGRESQL_NETWORK_ALIAS}:${POSTGRESQL_CONTAINER_PORT}/${connection.database}`,
    FLYWAY_USER: connection.user,
    FLYWAY_PASSWORD: connection.password,
    FLYWAY_LOCATIONS: "filesystem:/flyway/sql",
    FLYWAY_CONNECT_RETRIES: "10",
    FLYWAY_VALIDATE_MIGRATION_NAMING: "true",
    ...(options.target ? { FLYWAY_TARGET: options.target } : {}),
  };
  const container = await new GenericContainer(FLYWAY_COMMUNITY_IMAGE)
    .withNetwork(network)
    .withEnvironment(environment)
    .withCopyDirectoriesToContainer([{ source: WORKFLOW_MIGRATIONS_PATH, target: "/flyway/sql" }])
    .withCommand([command])
    .withWaitStrategy(Wait.forOneShotStartup())
    .withStartupTimeout(POSTGRESQL_STARTUP_TIMEOUT_MS)
    .start();
  await container.stop({ timeout: 5_000, remove: true, removeVolumes: true });
  return { image: FLYWAY_COMMUNITY_IMAGE, command, succeeded: true };
}

export const runFlywayMigrate = (network: StartedNetwork, connection: FlywayConnection, options?: FlywayCommandOptions) =>
  runFlywayCommand(network, connection, "migrate", options);

export const runFlywayValidate = (network: StartedNetwork, connection: FlywayConnection, options?: FlywayCommandOptions) =>
  runFlywayCommand(network, connection, "validate", options);
