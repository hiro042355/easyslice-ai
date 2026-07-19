import { validatePostgreSqlFoundationEnvironment } from "./environmentValidator";
import { startPostgreSqlTestEnvironment } from "./foundation";

export async function verifyPostgreSqlCiBootstrap(): Promise<void> {
  validatePostgreSqlFoundationEnvironment();
  const environment = await startPostgreSqlTestEnvironment();
  await environment.stop();
}
