import { isProductionOwner } from "../productionIdentity/productionOwnerAuthority";
import type { AuthenticatedContext } from "../productionIdentity/types";

export const PROBE_ORIGIN = "https://www.nexcutai.com";
export const PROBE_SQL = Object.freeze({
  begin: "BEGIN READ ONLY",
  metadata: "SELECT current_database() AS database_identity, current_user AS role_identity, current_setting('server_version_num') AS version",
  schema: "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='workflow') AS present",
  history: "SELECT n.nspname AS schema_name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='flyway_schema_history' AND c.relkind IN ('r','p')",
  shape: "SELECT table_schema, column_name, data_type FROM information_schema.columns WHERE table_schema IN ('public','workflow') AND table_name='flyway_schema_history' AND column_name IN ('version','success')",
  privileges: "SELECT has_database_privilege(current_user,current_database(),$1) AS database_create, has_schema_privilege(current_user,'workflow',$2) AS schema_create, has_schema_privilege(current_user,'workflow',$3) AS schema_usage",
  rollback: "ROLLBACK",
});
type Classification = "PASS" | "FAIL" | "NOT_RUN" | "UNKNOWN";
export type ProbeEvidence = Readonly<{
  result: Classification;
  authorityPath: Classification;
  metadata: Classification;
  workflowSchema: "PRESENT" | "ABSENT" | "UNKNOWN";
  historyTable: "PRESENT" | "ABSENT" | "UNKNOWN";
  historyShape: Classification;
  authoritativeHistory: "UNKNOWN";
  migrationVersions: "NOT_RUN";
  runtimeDml: "NOT_RUN";
  runtimeSchemaCreate: "YES" | "NO" | "UNKNOWN";
  runtimeDatabaseCreate: "YES" | "NO" | "UNKNOWN";
  migrationIdentityAuthority: "UNKNOWN";
  failure: "NONE" | "DB_AUTHORITY_PATH_FAILED" | "SQL_METADATA_FAILED" | "CATALOG_PRIVILEGE_DENIED" | "CLEANUP_FAILED" | "INTERNAL_FAILED";
}>;
export interface ProbeConnection {
  query(sql: string, values?: readonly string[]): Promise<{ rows: Record<string, unknown>[] }>;
}
const initial = (): ProbeEvidence => ({ result: "FAIL", authorityPath: "NOT_RUN", metadata: "NOT_RUN",
  workflowSchema: "UNKNOWN", historyTable: "UNKNOWN", historyShape: "NOT_RUN",
  authoritativeHistory: "UNKNOWN", migrationVersions: "NOT_RUN", runtimeDml: "NOT_RUN",
  runtimeSchemaCreate: "UNKNOWN", runtimeDatabaseCreate: "UNKNOWN", migrationIdentityAuthority: "UNKNOWN", failure: "NONE" });

export async function runProbe(withConnection: <T>(run: (connection: ProbeConnection) => Promise<T>) => Promise<T>): Promise<ProbeEvidence> {
  let evidence = initial();
  let connected = false;
  try {
    await withConnection(async connection => {
      connected = true;
      evidence = { ...evidence, authorityPath: "PASS" };
      let begun = false;
      try {
        begun = true;
        await connection.query(PROBE_SQL.begin);
        const meta = await connection.query(PROBE_SQL.metadata);
        if (meta.rows.length !== 1 || typeof meta.rows[0].database_identity !== "string" ||
            typeof meta.rows[0].role_identity !== "string" || typeof meta.rows[0].version !== "string") throw new Error();
        evidence = { ...evidence, metadata: "PASS" };
        const schema = await connection.query(PROBE_SQL.schema);
        if (schema.rows.length !== 1 || typeof schema.rows[0].present !== "boolean") throw new Error();
        evidence = { ...evidence, workflowSchema: schema.rows[0].present ? "PRESENT" : "ABSENT" };
        const history = await connection.query(PROBE_SQL.history);
        evidence = { ...evidence, historyTable: history.rows.length ? "PRESENT" : "ABSENT" };
        if (history.rows.length) {
          const shape = await connection.query(PROBE_SQL.shape);
          const schemaName = history.rows.length === 1 ? history.rows[0].schema_name : undefined;
          evidence = { ...evidence, historyShape: typeof schemaName === "string" &&
            shape.rows.some(row => row.table_schema === schemaName && row.column_name === "version" && row.data_type === "character varying") &&
            shape.rows.some(row => row.table_schema === schemaName && row.column_name === "success" && row.data_type === "boolean") ? "PASS" : "UNKNOWN" };
        }
        // No authoritative Production history location is established: never read versions.
        if (evidence.workflowSchema === "PRESENT") {
          const privileges = await connection.query(PROBE_SQL.privileges, ["CREATE", "CREATE", "USAGE"]);
          const row = privileges.rows[0];
          if (privileges.rows.length !== 1 || typeof row.schema_create !== "boolean" || typeof row.database_create !== "boolean") throw new Error();
          evidence = { ...evidence, runtimeSchemaCreate: row.schema_create ? "YES" : "NO", runtimeDatabaseCreate: row.database_create ? "YES" : "NO" };
        }
        evidence = { ...evidence, result: "PASS" };
      } catch (error) {
        const denied = typeof error === "object" && error !== null && "code" in error && error.code === "42501";
        evidence = { ...evidence, result: "FAIL", failure: denied ? "CATALOG_PRIVILEGE_DENIED" : "SQL_METADATA_FAILED" };
      } finally {
        if (begun) {
          try { await connection.query(PROBE_SQL.rollback); }
          catch { evidence = { ...evidence, result: "FAIL", failure: "CLEANUP_FAILED" }; }
        }
      }
    });
  } catch {
    evidence = { ...evidence, result: "FAIL", authorityPath: connected ? evidence.authorityPath : "FAIL",
      failure: connected ? "CLEANUP_FAILED" : "DB_AUTHORITY_PATH_FAILED" };
  }
  return Object.freeze(evidence);
}

type RouteDependencies = Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  authenticate(request: Request): Promise<{ ok: true; context: AuthenticatedContext } | { ok: false }>;
  probe(): Promise<ProbeEvidence>;
}>;
const reply = (status: number, body: unknown) => Response.json(body, { status,
  headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
export function createProbeRoute(deps: RouteDependencies) {
  // Operational one manual invocation; NOT technical exactly-once. No retries/latch.
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== "POST") return reply(405, { error: "METHOD_REJECTED" });
      if (deps.environment.VERCEL_ENV !== "production" || deps.environment.NEXCUT_PRODUCTION_DB_PROBE_ENABLED !== "true") return reply(404, { error: "PROBE_UNAVAILABLE" });
      const url = new URL(request.url);
      if (url.origin !== PROBE_ORIGIN || request.headers.get("origin") !== PROBE_ORIGIN) return reply(403, { error: "ORIGIN_REJECTED" });
      if (url.search || request.headers.has("transfer-encoding")) return reply(400, { error: "REQUEST_REJECTED" });
      const length = request.headers.get("content-length");
      if (length !== null && !/^0+$/.test(length)) return reply(400, { error: "REQUEST_REJECTED" });
      // No body stream is accepted, so a slow/malicious stream cannot stall auth.
      if (request.body !== null) return reply(400, { error: "REQUEST_REJECTED" });
      if (!request.headers.get("cookie")?.split(";").some(part => {
        const value = part.trim();
        return value.startsWith("__Host-nexcut_session=") && value.length > "__Host-nexcut_session=".length;
      })) return reply(401, { error: "AUTHENTICATION_REQUIRED" });
      const auth = await deps.authenticate(request);
      if (!auth.ok) return reply(401, { error: "AUTHENTICATION_REQUIRED" });
      if (!isProductionOwner(auth.context.identity.userId, deps.environment.NEXCUT_PRODUCTION_OWNER_UID)) return reply(404, { error: "OWNER_REJECTED" });
      const evidence = await deps.probe();
      return reply(evidence.result === "PASS" ? 200 : 503, evidence);
    } catch { return reply(503, { error: "INTERNAL_FAILED" }); }
  };
}
