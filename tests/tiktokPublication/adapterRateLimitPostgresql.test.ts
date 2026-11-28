import assert from "node:assert/strict";
import test from "node:test";
import { withPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";
import { createAdapterRateLimiter } from "../../lib/tiktokPublication/adapterRateLimit";

/**
 * Core -> adapter budget against a real PostgreSQL database. These tests measure
 * the durable limit itself: concurrent bursts, multiple limiter instances (a stand-in
 * for several Core processes sharing one database), lease expiry, and tenant isolation.
 */
const tenantA = "tenant-rate-a";
const tenantB = "tenant-rate-b";

test("a concurrent burst never admits more than the per-minute publish limit", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const limiter = createAdapterRateLimiter(environment.pool, { publishPerMinute: 10 });
    // Fire 60 simultaneous decisions across independent limiter instances (one per simulated process).
    const instances = Array.from({ length: 6 }, () => createAdapterRateLimiter(environment.pool, { publishPerMinute: 10 }));
    const decisions = await Promise.all(
      Array.from({ length: 60 }, (_, index) => instances[index % instances.length]!.consume(tenantA, "PUBLISH")),
    );
    const allowed = decisions.filter((decision) => decision.code === "ALLOWED").length;
    const limited = decisions.filter((decision) => decision.code === "LIMITED");
    assert.equal(allowed, 10, "exactly the configured limit is admitted");
    assert.equal(limited.length, 50);
    for (const decision of limited) {
      assert.ok(decision.code === "LIMITED" && decision.retryAfterSeconds >= 1 && decision.retryAfterSeconds <= 60);
    }
    const stored = await environment.pool.query<{ consumed: number }>(
      `SELECT consumed FROM workflow.publication_adapter_rate_limits WHERE tenant_id = $1 AND scope = 'PUBLISH'`,
      [tenantA],
    );
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0]?.consumed, 10, "the counter never exceeds the limit");
    assert.equal(limiter.policy.publishPerMinute, 10);
  });
});

test("status and publish budgets are independent and per tenant", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const limiter = createAdapterRateLimiter(environment.pool, { publishPerMinute: 2, statusPerMinute: 3 });
    const burst = await Promise.all(Array.from({ length: 10 }, () => limiter.consume(tenantA, "STATUS")));
    assert.equal(burst.filter((d) => d.code === "ALLOWED").length, 3);
    // Tenant A's exhausted status budget must not affect tenant A's publish budget or tenant B.
    assert.equal((await limiter.consume(tenantA, "PUBLISH")).code, "ALLOWED");
    assert.equal((await limiter.consume(tenantB, "STATUS")).code, "ALLOWED");
  });
});

test("concurrent lease acquisition respects the in-flight cap across limiter instances", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const instances = Array.from({ length: 5 }, () =>
      createAdapterRateLimiter(environment.pool, { maxConcurrentPublishes: 2, leaseSeconds: 120 }),
    );
    const results = await Promise.all(
      instances.map((limiter, index) => limiter.acquireLease(tenantA, `lease-${index}`)),
    );
    assert.equal(results.filter((r) => r.code === "ACQUIRED").length, 2, "only two leases are granted");
    const held = await environment.pool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM workflow.publication_adapter_leases WHERE tenant_id = $1 AND expires_at > now()`,
      [tenantA],
    );
    assert.equal(held.rows[0]?.count, 2);
  });
});

test("a released lease frees capacity and an expired lease is reclaimed", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const limiter = createAdapterRateLimiter(environment.pool, { maxConcurrentPublishes: 1, leaseSeconds: 120 });
    assert.equal((await limiter.acquireLease(tenantB, "lease-first")).code, "ACQUIRED");
    assert.equal((await limiter.acquireLease(tenantB, "lease-second")).code, "LIMITED");
    await limiter.releaseLease(tenantB, "lease-first");
    assert.equal((await limiter.acquireLease(tenantB, "lease-second")).code, "ACQUIRED");

    // Simulate a crashed holder: its lease expires without release and must stop blocking.
    await environment.pool.query(
      `UPDATE workflow.publication_adapter_leases SET acquired_at = now() - interval '2 minutes', expires_at = now() - interval '1 second' WHERE tenant_id = $1 AND lease_id = $2`,
      [tenantB, "lease-second"],
    );
    assert.equal((await limiter.acquireLease(tenantB, "lease-third")).code, "ACQUIRED");
  });
});

test("the same lease id cannot be acquired twice", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const limiter = createAdapterRateLimiter(environment.pool, { maxConcurrentPublishes: 5 });
    assert.equal((await limiter.acquireLease(tenantA, "dup")).code, "ACQUIRED");
    assert.equal((await limiter.acquireLease(tenantA, "dup")).code, "LIMITED");
  });
});

test("a database failure is thrown, never converted into an allowed decision", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const failing = {
      query: async () => {
        throw new Error("connection terminated");
      },
    };
    const limiter = createAdapterRateLimiter(failing, { publishPerMinute: 10 });
    await assert.rejects(() => limiter.consume(tenantA, "PUBLISH"), /connection terminated/);
    await assert.rejects(() => limiter.acquireLease(tenantA, "lease-x"), /connection terminated/);
    // Still usable after recovery against the healthy pool.
    assert.equal((await createAdapterRateLimiter(environment.pool).consume(tenantA, "PUBLISH")).code, "ALLOWED");
  });
});
