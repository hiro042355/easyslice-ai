import "server-only";
import { getVercelOidcToken } from "@vercel/oidc";
import { createProductionMediaWifClient, readProductionMediaWifConfiguration } from "../productionMediaRuntime/mediaWifCredential";
import { withProductionMediaCloudSqlPool } from "../productionMediaRuntime/cloudSqlAdapter";
import { runProbe } from "./probeCore";

export async function executeProductionDatabaseProbe() {
  return runProbe(async run => {
    const auth = createProductionMediaWifClient(readProductionMediaWifConfiguration(), () => getVercelOidcToken());
    const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error("probe-config-unavailable"); return value; };
    return withProductionMediaCloudSqlPool(auth, {
      instanceConnectionName: required("CLOUD_SQL_INSTANCE_CONNECTION_NAME"),
      database: required("POSTGRES_DATABASE"), iamUser: required("POSTGRES_IAM_USER"),
    }, async pool => {
      const client = await pool.connect();
      // Uses the existing pool's bounded query timeout; no unsupported pg option.
      try { return await run({ query: async (sql, values) => {
        const result = await client.query({ text: sql, values: values ? [...values] : undefined });
        return { rows: result.rows };
      } }); }
      finally { client.release(true); }
    });
  });
}
