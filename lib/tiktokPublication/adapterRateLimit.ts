import type { PublicationQueryClient } from "../publicationRecords/repository";

/**
 * Durable Core -> adapter call budget.
 *
 * The budget lives in PostgreSQL, not in process memory, so every Core instance
 * that shares the database sees the same counters. Each decision is a single
 * statement, which is atomic on its own; the per-tenant advisory lock inside the
 * lease statement serializes concurrent lease attempts across processes.
 *
 * This module is marker-free so it can run under `tsx`.
 */
export type AdapterRateLimitScope = "PUBLISH" | "STATUS";

export type AdapterRateLimitPolicy = Readonly<{
  /** Publication requests admitted per tenant per minute. */
  publishPerMinute: number;
  /** Status (reconciliation) queries admitted per tenant per minute. */
  statusPerMinute: number;
  /** Concurrent in-flight publication requests per tenant. */
  maxConcurrentPublishes: number;
  /** How long a dispatch lease may live before it is considered abandoned. */
  leaseSeconds: number;
}>;

export const DEFAULT_ADAPTER_RATE_LIMIT_POLICY: AdapterRateLimitPolicy = Object.freeze({
  publishPerMinute: 10,
  statusPerMinute: 30,
  maxConcurrentPublishes: 2,
  leaseSeconds: 120,
});

export type AdapterBudgetDecision =
  | Readonly<{ code: "ALLOWED"; remaining: number }>
  | Readonly<{ code: "LIMITED"; retryAfterSeconds: number }>;

export type AdapterLeaseDecision =
  | Readonly<{ code: "ACQUIRED" }>
  | Readonly<{ code: "LIMITED"; retryAfterSeconds: number }>;

export type AdapterRateLimiter = Readonly<{
  consume: (tenantId: string, scope: AdapterRateLimitScope) => Promise<AdapterBudgetDecision>;
  acquireLease: (tenantId: string, leaseId: string) => Promise<AdapterLeaseDecision>;
  releaseLease: (tenantId: string, leaseId: string) => Promise<void>;
  policy: AdapterRateLimitPolicy;
}>;

const positiveInteger = (value: number | undefined, fallback: number): number =>
  Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : fallback;

/**
 * Fixed-window counter. The window start is computed from the database clock, so
 * two Core instances with skewed clocks still agree on the same bucket.
 */
const CONSUME_SQL = `
WITH bucket AS (
  SELECT to_timestamp(floor(extract(epoch FROM now()) / $3::double precision) * $3::double precision) AS started_at
), upsert AS (
  INSERT INTO workflow.publication_adapter_rate_limits (tenant_id, scope, window_start, consumed)
  SELECT $1, $2, started_at, 1 FROM bucket
  ON CONFLICT (tenant_id, scope, window_start)
  DO UPDATE SET consumed = workflow.publication_adapter_rate_limits.consumed + 1
   WHERE workflow.publication_adapter_rate_limits.consumed < $4::integer
  RETURNING consumed
)
SELECT
  (SELECT count(*)::integer FROM upsert) AS granted,
  COALESCE(
    (SELECT consumed FROM upsert),
    (SELECT consumed FROM workflow.publication_adapter_rate_limits
      WHERE tenant_id = $1 AND scope = $2 AND window_start = (SELECT started_at FROM bucket))
  )::integer AS consumed,
  GREATEST(1, ceil(extract(epoch FROM (
    (SELECT started_at FROM bucket) + make_interval(secs => $3::double precision) - now()
  ))))::integer AS retry_after_seconds`;

const ACQUIRE_SQL = `
WITH lock AS (
  SELECT pg_advisory_xact_lock(hashtext($1))
), pruned AS (
  DELETE FROM workflow.publication_adapter_leases WHERE tenant_id = $1 AND expires_at <= now()
), held AS (
  SELECT count(*)::integer AS active
  FROM workflow.publication_adapter_leases, lock
  WHERE tenant_id = $1 AND expires_at > now()
), already AS (
  SELECT count(*)::integer AS held
  FROM workflow.publication_adapter_leases, lock
  WHERE tenant_id = $1 AND lease_id = $2 AND expires_at > now()
), inserted AS (
  INSERT INTO workflow.publication_adapter_leases (tenant_id, lease_id, acquired_at, expires_at)
  SELECT $1, $2, now(), now() + make_interval(secs => $3::double precision)
  WHERE (SELECT active FROM held) < $4::integer AND (SELECT held FROM already) = 0
  ON CONFLICT (tenant_id, lease_id) DO NOTHING
  RETURNING lease_id
)
SELECT
  (SELECT count(*)::integer FROM inserted) AS granted,
  (SELECT held FROM already) AS already_held,
  GREATEST(1, ceil(extract(epoch FROM (
    (SELECT min(expires_at) FROM workflow.publication_adapter_leases, lock
      WHERE tenant_id = $1 AND expires_at > now()) - now()
  ))))::integer AS retry_after_seconds`;

export function createAdapterRateLimiter(
  client: PublicationQueryClient,
  overrides: Partial<AdapterRateLimitPolicy> = {},
): AdapterRateLimiter {
  const policy: AdapterRateLimitPolicy = Object.freeze({
    publishPerMinute: positiveInteger(overrides.publishPerMinute, DEFAULT_ADAPTER_RATE_LIMIT_POLICY.publishPerMinute),
    statusPerMinute: positiveInteger(overrides.statusPerMinute, DEFAULT_ADAPTER_RATE_LIMIT_POLICY.statusPerMinute),
    maxConcurrentPublishes: positiveInteger(
      overrides.maxConcurrentPublishes,
      DEFAULT_ADAPTER_RATE_LIMIT_POLICY.maxConcurrentPublishes,
    ),
    leaseSeconds: positiveInteger(overrides.leaseSeconds, DEFAULT_ADAPTER_RATE_LIMIT_POLICY.leaseSeconds),
  });

  const limits: Readonly<Record<AdapterRateLimitScope, number>> = Object.freeze({
    PUBLISH: policy.publishPerMinute,
    STATUS: policy.statusPerMinute,
  });

  return Object.freeze({
    policy,
    async consume(tenantId, scope) {
      const limit = limits[scope];
      const result = await client.query<{ granted: number; consumed: number; retry_after_seconds: number }>(
        CONSUME_SQL,
        [tenantId, scope, 60, limit],
      );
      const row = result.rows[0];
      if (!row) return Object.freeze({ code: "LIMITED" as const, retryAfterSeconds: 60 });
      if (Number(row.granted) === 1) {
        return Object.freeze({
          code: "ALLOWED" as const,
          remaining: Math.max(0, limit - Number(row.consumed ?? limit)),
        });
      }
      return Object.freeze({
        code: "LIMITED" as const,
        retryAfterSeconds: Math.min(3600, Math.max(1, Number(row.retry_after_seconds ?? 60))),
      });
    },

    async acquireLease(tenantId, leaseId) {
      const result = await client.query<{
        granted: number;
        already_held: number;
        retry_after_seconds: number;
      }>(ACQUIRE_SQL, [tenantId, leaseId, policy.leaseSeconds, policy.maxConcurrentPublishes]);
      const row = result.rows[0];
      if (row && (Number(row.granted) === 1 || Number(row.already_held) > 0)) {
        // A lease already held by this publication id means the same publication is
        // in flight; the caller treats it as a retryable conflict, not a new post.
        return Number(row.granted) === 1
          ? Object.freeze({ code: "ACQUIRED" as const })
          : Object.freeze({ code: "LIMITED" as const, retryAfterSeconds: Math.min(3600, Math.max(1, Number(row.retry_after_seconds ?? 30))) });
      }
      return Object.freeze({
        code: "LIMITED" as const,
        retryAfterSeconds: Math.min(3600, Math.max(1, Number(row?.retry_after_seconds ?? 30))),
      });
    },

    async releaseLease(tenantId, leaseId) {
      await client.query(
        `DELETE FROM workflow.publication_adapter_leases WHERE tenant_id = $1 AND lease_id = $2`,
        [tenantId, leaseId],
      );
    },
  });
}
