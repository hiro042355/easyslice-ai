import {
  createProductionPostgresqlRuntime,
  type ProductionPostgresqlRuntime,
} from "../productionDatabaseRuntime/productionPostgresqlRuntime";
import { PostgresqlProductionWorkflowApiCsrfAuthority } from "./postgresqlProductionWorkflowApiCsrfAuthority";
import type { ProductionWorkflowApiCsrfAuthority } from "./productionWorkflowApiCsrfTypes";

export type ProductionWorkflowApiCsrfRuntime = Readonly<{
  runtimeVersion: "1.0";
  authority: ProductionWorkflowApiCsrfAuthority;
  shutdown(): Promise<void>;
}>;

export type ProductionWorkflowApiCsrfRuntimeResult =
  | Readonly<{ status: "ready"; runtime: ProductionWorkflowApiCsrfRuntime }>
  | Readonly<{ status: "unavailable" }>;

type DatabaseRuntime = Pick<ProductionPostgresqlRuntime, "acquire" | "shutdown">;
type Dependencies = Readonly<{
  createDatabaseRuntime(environment: Readonly<Record<string, string | undefined>>): DatabaseRuntime;
}>;

const unavailable = (): ProductionWorkflowApiCsrfRuntimeResult => Object.freeze({ status: "unavailable" });

// Transport and pool tuning belong exclusively to the shared foundation.
// Explicit legacy overrides, valid or malformed, are unsupported rather than
// silently ignored or normalized into defaults by this CSRF composition.
const legacyOverrides = [
  "POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_TLS_MODE",
  "POSTGRES_MAX_CONNECTIONS", "POSTGRES_CONNECTION_TIMEOUT_MS", "POSTGRES_IDLE_TIMEOUT_MS", "POSTGRES_QUERY_TIMEOUT_MS",
] as const;

export function createProductionWorkflowApiCsrfRuntimeProvider(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: Dependencies = { createDatabaseRuntime: createProductionPostgresqlRuntime },
) {
  let database: DatabaseRuntime | undefined;
  let startup: Promise<ProductionWorkflowApiCsrfRuntimeResult> | undefined;
  let shutdownPromise: Promise<void> | undefined;
  let terminal = false;

  async function start(): Promise<ProductionWorkflowApiCsrfRuntimeResult> {
    try {
      if (terminal || legacyOverrides.some((key) => environment[key] !== undefined)) return unavailable();
      database = dependencies.createDatabaseRuntime(environment);
      const pool = await database.acquire();
      if (terminal) return unavailable();
      const durable = new PostgresqlProductionWorkflowApiCsrfAuthority(pool);
      const authority = Object.freeze<ProductionWorkflowApiCsrfAuthority>({
        authorityVersion: "1.0",
        issueWithAtomicCeiling: (input) => terminal ? Promise.resolve({ status: "unavailable" as const }) : durable.issueWithAtomicCeiling(input),
        validate: (input) => terminal ? Promise.resolve({ status: "unavailable" as const }) : durable.validate(input),
        revokeToken: (input) => terminal ? Promise.resolve({ status: "unavailable" as const }) : durable.revokeToken(input),
        revokeSession: (input) => terminal ? Promise.resolve({ status: "unavailable" as const }) : durable.revokeSession(input),
      });
      return Object.freeze({ status: "ready", runtime: Object.freeze({ runtimeVersion: "1.0", authority, shutdown }) });
    } catch {
      // Shared startup owns partial cleanup; shutdown terminalizes its state.
      try { await database?.shutdown(); } catch { /* no raw provider diagnostics */ }
      return unavailable();
    }
  }

  function get(): Promise<ProductionWorkflowApiCsrfRuntimeResult> {
    if (terminal) return Promise.resolve(unavailable());
    startup ??= Promise.resolve().then(start);
    return startup;
  }

  function shutdown(): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    terminal = true;
    shutdownPromise = (async () => {
      await startup;
      try { await database?.shutdown(); }
      catch { throw new Error("Production CSRF runtime shutdown failed"); }
    })();
    return shutdownPromise;
  }

  return Object.freeze({ get, shutdown });
}

// Creating the provider allocates no DB/WIF/Connector resources.
const provider = createProductionWorkflowApiCsrfRuntimeProvider();
export const getProductionWorkflowApiCsrfRuntime = provider.get;
export const shutdownProductionWorkflowApiCsrfRuntime = provider.shutdown;
