import { startPostgreSqlTestEnvironment, type PostgreSqlTestEnvironment } from "./foundation";

export async function withPostgreSqlTestEnvironment<T>(run: (environment: PostgreSqlTestEnvironment) => Promise<T>): Promise<T> {
  const environment = await startPostgreSqlTestEnvironment();
  try { return await run(environment); } finally { await environment.stop(); }
}
