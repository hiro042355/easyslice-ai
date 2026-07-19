import { Pool, type PoolConfig } from "pg";

export type PostgreSqlTestConnection = Readonly<{
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}>;

export function createPostgreSqlTestPool(
  connection: PostgreSqlTestConnection,
  overrides: Pick<PoolConfig, "max" | "connectionTimeoutMillis" | "idleTimeoutMillis"> = {},
): Pool {
  return new Pool({
    ...connection,
    max: overrides.max ?? 4,
    connectionTimeoutMillis: overrides.connectionTimeoutMillis ?? 10_000,
    idleTimeoutMillis: overrides.idleTimeoutMillis ?? 10_000,
    allowExitOnIdle: true,
    application_name: "easyslice-postgresql-foundation-test",
    ssl: false,
  });
}
