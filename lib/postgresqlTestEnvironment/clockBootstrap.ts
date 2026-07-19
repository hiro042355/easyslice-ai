import type { PoolClient } from "pg";

export async function bootstrapUtcClock(client: PoolClient): Promise<void> {
  await client.query("SET TIME ZONE 'UTC'");
  const result = await client.query<{ TimeZone: string }>("SHOW timezone");
  if (result.rows[0]?.TimeZone !== "UTC") {
    throw new Error("postgresql-foundation-timezone-not-utc");
  }
}
