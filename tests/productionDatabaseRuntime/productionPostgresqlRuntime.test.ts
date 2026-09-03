import assert from "node:assert/strict";
import test from "node:test";
import type { TLSSocket } from "node:tls";
import type { IdentityPoolClient } from "google-auth-library";
import { ProductionPostgresqlRuntime } from "../../lib/server/productionDatabaseRuntime/productionPostgresqlRuntime";
import type { PostgreSQLConnectionPool, PostgreSQLPoolState } from "../../lib/server/productionWorkflowRuntime/postgresqlDriver";

const configuration = Object.freeze({
  instanceConnectionName: "nexcut-prod-jp-2026:asia-northeast1:nexcut-prod-postgresql",
  database: "nexcut",
  iamUser: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam",
});

type HarnessOptions = Readonly<{
  startFailure?: boolean;
  poolConstructionFailure?: boolean;
  poolCloseFailure?: boolean;
  connectorCloseFailure?: boolean;
}>;

function harness(options: HarnessOptions = {}) {
  const events: string[] = [];
  let connectorCreations = 0;
  let poolCreations = 0;
  let starts = 0;
  let poolCloses = 0;
  let connectorCloses = 0;
  let state: PostgreSQLPoolState = "created";
  const pool: PostgreSQLConnectionPool = {
    state: () => state,
    async start() {
      starts += 1;
      if (options.startFailure) return { status: "failure", issue: "connection-unavailable", diagnostic: { stage: "pool", issue: "connection-unavailable", retryable: true } };
      state = "ready";
      return "ready";
    },
    async checkout() { return { status: "failure", issue: "disposed", diagnostic: { stage: "checkout", issue: "disposed", retryable: false } }; },
    async close() {
      poolCloses += 1; events.push("pool-close"); state = "closed";
      if (options.poolCloseFailure) throw new Error("sensitive pool close detail");
      return "closed";
    },
  };
  const runtime = new ProductionPostgresqlRuntime(configuration, {
    createAuthClient: () => ({} as IdentityPoolClient),
    createConnectorAuthority() {
      connectorCreations += 1;
      return {
        database: configuration.database,
        iamUser: configuration.iamUser,
        async getDriverOptions() { return { stream: () => ({} as TLSSocket) }; },
        close() {
          connectorCloses += 1; events.push("connector-close");
          if (options.connectorCloseFailure) throw new Error("sensitive connector close detail");
        },
      };
    },
    createPool() {
      poolCreations += 1;
      if (options.poolConstructionFailure) throw new Error("pool construction failed");
      return pool;
    },
  });
  return { runtime, pool, events, counts: () => ({ connectorCreations, poolCreations, starts, poolCloses, connectorCloses }) };
}

test("concurrent startup creates and starts one runtime-owned pool", async () => {
  const subject = harness();
  const [first, second, third] = await Promise.all([
    subject.runtime.acquire(), subject.runtime.acquire(), subject.runtime.acquire(),
  ]);
  assert.equal(first, subject.pool);
  assert.equal(second, first);
  assert.equal(third, first);
  assert.deepEqual(subject.counts(), { connectorCreations: 1, poolCreations: 1, starts: 1, poolCloses: 0, connectorCloses: 0 });

  await subject.runtime.shutdown();
  await subject.runtime.shutdown();
  assert.deepEqual(subject.events, ["pool-close", "connector-close"]);
  assert.deepEqual(subject.counts(), { connectorCreations: 1, poolCreations: 1, starts: 1, poolCloses: 1, connectorCloses: 1 });
  await assert.rejects(subject.runtime.acquire(), /closed/);
});

test("startup failure is cached and partial resources close exactly once", async () => {
  const subject = harness({ startFailure: true });
  await assert.rejects(subject.runtime.acquire(), /unavailable/);
  await assert.rejects(subject.runtime.acquire(), /unavailable/);
  assert.equal(subject.runtime.state(), "failed");
  assert.deepEqual(subject.events, ["pool-close", "connector-close"]);
  assert.deepEqual(subject.counts(), { connectorCreations: 1, poolCreations: 1, starts: 1, poolCloses: 1, connectorCloses: 1 });
  await subject.runtime.shutdown();
  assert.deepEqual(subject.events, ["pool-close", "connector-close"]);
});

test("pool construction failure closes connector and publishes no pool", async () => {
  const subject = harness({ poolConstructionFailure: true });
  await assert.rejects(subject.runtime.acquire(), /unavailable/);
  assert.deepEqual(subject.counts(), { connectorCreations: 1, poolCreations: 1, starts: 0, poolCloses: 0, connectorCloses: 1 });
});

test("shutdown before acquire establishes synchronous terminal intent", async () => {
  const subject = harness();
  const shutdown = subject.runtime.shutdown();
  assert.equal(subject.runtime.state(), "closing");
  await assert.rejects(subject.runtime.acquire(), /closed/);
  await shutdown;
  assert.equal(subject.runtime.state(), "closed");
  assert.deepEqual(subject.counts(), { connectorCreations: 0, poolCreations: 0, starts: 0, poolCloses: 0, connectorCloses: 0 });
});

test("shutdown during startup prevents publication and cleans created authority", async () => {
  let resolveOptions: ((value: { stream: () => TLSSocket }) => void) | undefined;
  const options = new Promise<{ stream: () => TLSSocket }>((resolve) => { resolveOptions = resolve; });
  const events: string[] = [];
  let poolCreations = 0;
  const runtime = new ProductionPostgresqlRuntime(configuration, {
    createAuthClient: () => ({} as IdentityPoolClient),
    createConnectorAuthority: () => ({
      database: configuration.database,
      iamUser: configuration.iamUser,
      getDriverOptions: () => options,
      close() { events.push("connector-close"); },
    }),
    createPool: () => { poolCreations += 1; throw new Error("must not publish"); },
  });
  const acquisition = runtime.acquire();
  const shutdown = runtime.shutdown();
  assert.equal(runtime.state(), "closing");
  await assert.rejects(runtime.acquire(), /closed/);
  resolveOptions?.({ stream: () => ({} as TLSSocket) });
  await assert.rejects(acquisition, /unavailable/);
  await shutdown;
  assert.equal(runtime.state(), "closed");
  assert.equal(poolCreations, 0);
  assert.deepEqual(events, ["connector-close"]);
});

test("ready runtime rejects acquire synchronously after shutdown intent", async () => {
  const subject = harness();
  await subject.runtime.acquire();
  const shutdown = subject.runtime.shutdown();
  assert.equal(subject.runtime.state(), "closing");
  await assert.rejects(subject.runtime.acquire(), /closed/);
  await shutdown;
  assert.equal(subject.runtime.state(), "closed");
});

test("pool close failure still closes Connector and terminalizes with a closed error", async () => {
  const subject = harness({ poolCloseFailure: true });
  await subject.runtime.acquire();
  const first = subject.runtime.shutdown();
  const second = subject.runtime.shutdown();
  assert.equal(first, second);
  await assert.rejects(first, (error: Error) => {
    assert.equal(error.message, "Production PostgreSQL runtime shutdown failed");
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(String(error), /sensitive/);
    return true;
  });
  assert.deepEqual(subject.events, ["pool-close", "connector-close"]);
  assert.equal(subject.runtime.state(), "closed");
  await assert.rejects(subject.runtime.acquire(), /closed/);
});

test("Connector close failure follows pool attempt and leaves terminal state", async () => {
  const subject = harness({ connectorCloseFailure: true });
  await subject.runtime.acquire();
  await assert.rejects(subject.runtime.shutdown(), /shutdown failed/);
  assert.deepEqual(subject.events, ["pool-close", "connector-close"]);
  assert.equal(subject.runtime.state(), "closed");
  await assert.rejects(subject.runtime.acquire(), /closed/);
});

test("both startup cleanup failures are attempted and outward error remains closed", async () => {
  const subject = harness({ startFailure: true, poolCloseFailure: true, connectorCloseFailure: true });
  await assert.rejects(subject.runtime.acquire(), (error: Error) => {
    assert.equal(error.message, "Production PostgreSQL runtime is unavailable");
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(String(error), /sensitive/);
    return true;
  });
  assert.deepEqual(subject.events, ["pool-close", "connector-close"]);
  await assert.rejects(subject.runtime.shutdown(), /shutdown failed/);
  assert.equal(subject.runtime.state(), "closed");
});
