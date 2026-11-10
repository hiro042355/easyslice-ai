/**
 * Local-Only Connection Authority Guard
 * Scope: Ensures database clients/harnesses strictly connect to disposable local test environments.
 */

export type ConnectionTarget = Readonly<{
  host: string;
  port: number;
  database: string;
  user?: string;
}>;

const FORBIDDEN_HOST_PATTERNS = [
  /google/i,
  /cloudsql/i,
  /gcp/i,
  /prod/i,
  /staging/i,
  /easyslice/i,
  /vercel/i,
  /supabase/i,
  /neon/i,
  /amazonaws/i,
  /azure/i,
];

const PERMITTED_LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "testcontainers",
  "testcontainers-postgres",
]);

export function validateLocalOnlyConnectionAuthority(target: ConnectionTarget): void {
  const host = target.host.trim().toLowerCase();

  // 1. Fail closed on empty/undefined host
  if (!host) {
    throw new Error("local-connection-guard: host cannot be empty");
  }

  // 2. Reject remote/cloud identifiers in host, database, or user
  for (const pattern of FORBIDDEN_HOST_PATTERNS) {
    if (pattern.test(host)) {
      throw new Error(`local-connection-guard: remote cloud host forbidden: "${host}"`);
    }
    if (pattern.test(target.database)) {
      throw new Error(`local-connection-guard: remote cloud database identifier forbidden: "${target.database}"`);
    }
    if (target.user && pattern.test(target.user)) {
      throw new Error(`local-connection-guard: remote cloud user identifier forbidden: "${target.user}"`);
    }
  }

  // 3. Reject if host is not an explicit local test environment marker
  if (!PERMITTED_LOCAL_HOSTS.has(host) && !host.startsWith("172.") && !host.startsWith("10.")) {
    throw new Error(`local-connection-guard: non-local connection target rejected: "${host}"`);
  }
}
