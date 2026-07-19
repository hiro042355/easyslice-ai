import type { Pool } from "pg";
import { POSTGRESQL_READINESS_TIMEOUT_MS, POSTGRESQL_TEST_MAJOR, POSTGRESQL_TEST_PATCH } from "./constants";
import { bootstrapUtcClock } from "./clockBootstrap";

export type PostgreSqlReadiness = Readonly<{
  serverVersion: string;
  serverVersionNum: number;
  timezone: "UTC";
  readWrite: true;
}>;

const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function waitForPostgreSqlReadiness(pool: Pool, timeoutMs = POSTGRESQL_READINESS_TIMEOUT_MS): Promise<PostgreSqlReadiness> {
  const deadline = Date.now() + timeoutMs;
  let lastFailure: unknown;
  while (Date.now() < deadline) {
    const client = await pool.connect().catch((error: unknown) => { lastFailure = error; return undefined; });
    if (!client) { await delay(150); continue; }
    try {
      await bootstrapUtcClock(client);
      const version = await client.query<{ server_version: string }>("SHOW server_version");
      const number = await client.query<{ server_version_num: string }>("SHOW server_version_num");
      const serverVersion = version.rows[0]?.server_version ?? "";
      const serverVersionNum = Number.parseInt(number.rows[0]?.server_version_num ?? "", 10);
      if (Math.trunc(serverVersionNum / 10_000) !== POSTGRESQL_TEST_MAJOR || !serverVersion.startsWith(POSTGRESQL_TEST_PATCH)) {
        throw new Error("postgresql-foundation-server-version-mismatch");
      }
      await client.query("CREATE TEMP TABLE foundation_rw_probe (value integer NOT NULL)");
      await client.query("INSERT INTO foundation_rw_probe (value) VALUES ($1)", [18]);
      const probe = await client.query<{ value: number }>("SELECT value FROM foundation_rw_probe");
      await client.query("DROP TABLE foundation_rw_probe");
      if (probe.rows[0]?.value !== 18) throw new Error("postgresql-foundation-read-write-failed");
      return { serverVersion, serverVersionNum, timezone: "UTC", readWrite: true };
    } catch (error) { lastFailure = error; } finally { client.release(); }
    await delay(150);
  }
  throw new Error("postgresql-foundation-readiness-timeout", { cause: lastFailure });
}
