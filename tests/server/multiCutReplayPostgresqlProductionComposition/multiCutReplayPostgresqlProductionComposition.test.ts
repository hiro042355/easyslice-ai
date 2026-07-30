import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createMultiCutReplayPostgresqlProductionComposition,
} from "../../../lib/server/multiCutReplayPostgresqlProductionComposition";
import type {
  ReplayPostgresqlObservabilityEvent,
} from "../../../lib/server/multiCutReplayPostgresqlObservability";
import type {
  PostgreSQLConnectionConfig,
  PostgreSQLConnectionPool,
  PostgreSQLExecutionFailure,
  PostgreSQLPoolState,
} from "../../../lib/server/productionWorkflowRuntime/postgresqlDriver";

const configuration: PostgreSQLConnectionConfig = Object.freeze({
  host: "postgres.fixture",
  port: 5432,
  database: "replay",
  user: "replay-runtime",
  password: "fixture-secret",
  maxConnections: 4,
  connectionTimeoutMs: 1_000,
  idleTimeoutMs: 30_000,
  applicationName: "multi-cut-replay",
  tls: Object.freeze({ mode: "verify-full" }),
});

type PoolFixture = Readonly<{
  pool: PostgreSQLConnectionPool;
  log: string[];
  setCloseResult(value: "closed" | "already-closed" | "drain-timeout"): void;
  closeOptions: Readonly<{ timeoutMs: number }>[];
}>;

const createPoolFixture = (
  startResult: "ready" | PostgreSQLExecutionFailure = "ready",
): PoolFixture => {
  const log: string[] = [];
  const closeOptions: Readonly<{ timeoutMs: number }>[] = [];
  let state: PostgreSQLPoolState = "created";
  let closeResult: "closed" | "already-closed" | "drain-timeout" = "closed";
  return Object.freeze({
    log,
    closeOptions,
    setCloseResult(value) {
      closeResult = value;
    },
    pool: Object.freeze({
      state: () => state,
      async start() {
        log.push("start");
        if (startResult === "ready") state = "ready";
        return startResult;
      },
      async checkout() {
        throw new Error("not invoked by composition");
      },
      async close(options?: Readonly<{ timeoutMs: number }>) {
        log.push("close");
        if (options) closeOptions.push(options);
        if (closeResult !== "drain-timeout") state = "closed";
        return closeResult;
      },
    }),
  });
};

test("configuration is validated before the pool factory is invoked", async () => {
  let calls = 0;
  const result = await createMultiCutReplayPostgresqlProductionComposition(
    { ...configuration, host: " " },
    {
      poolFactory: Object.freeze({
        create() {
          calls += 1;
          return createPoolFixture().pool;
        },
      }),
    },
  );
  assert.deepEqual(result, {
    status: "failed",
    classification: "configuration-failure",
    safeReason: "invalid-postgresql-configuration",
  });
  assert.equal(calls, 0);
});

test("configuration is injected and production dependencies are wired", async () => {
  const fixture = createPoolFixture();
  let received: PostgreSQLConnectionConfig | undefined;
  const result = await createMultiCutReplayPostgresqlProductionComposition(
    configuration,
    {
      poolFactory: Object.freeze({
        create(config) {
          received = config;
          return fixture.pool;
        },
      }),
    },
  );
  assert.equal(result.status, "ready");
  assert.equal(received, configuration);
  assert.deepEqual(fixture.log, ["start"]);
  if (result.status === "ready") {
    assert.equal(result.composition.compositionVersion, "1.0");
    assert.equal(typeof result.composition.runtime.execute, "function");
    assert.equal(result.composition.state(), "ready");
    assert.equal(Object.isFrozen(result.composition), true);
  }
});

test("startup failure is classified and closes the created pool", async () => {
  const fixture = createPoolFixture(
    Object.freeze({
      status: "failure",
      issue: "connection-unavailable",
      diagnostic: Object.freeze({
        stage: "pool",
        issue: "connection-unavailable",
        retryable: true,
      }),
    }),
  );
  const result = await createMultiCutReplayPostgresqlProductionComposition(
    configuration,
    { poolFactory: Object.freeze({ create: () => fixture.pool }) },
  );
  assert.deepEqual(result, {
    status: "failed",
    classification: "startup-failure",
    safeReason: "pool-start-connection-unavailable",
  });
  assert.deepEqual(fixture.log, ["start", "close"]);
});

test("shutdown closes the pool once and is idempotent", async () => {
  const fixture = createPoolFixture();
  const result = await createMultiCutReplayPostgresqlProductionComposition(
    configuration,
    { poolFactory: Object.freeze({ create: () => fixture.pool }) },
  );
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(await result.composition.shutdown(), { status: "closed" });
  assert.equal(result.composition.state(), "closed");
  assert.deepEqual(await result.composition.shutdown(), {
    status: "already-closed",
  });
  assert.deepEqual(fixture.log, ["start", "close"]);
  assert.deepEqual(fixture.closeOptions, [{ timeoutMs: 5_000 }]);
});

test("shutdown failure is contained and classified", async () => {
  const fixture = createPoolFixture();
  fixture.setCloseResult("drain-timeout");
  const result = await createMultiCutReplayPostgresqlProductionComposition(
    configuration,
    { poolFactory: Object.freeze({ create: () => fixture.pool }) },
  );
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(await result.composition.shutdown(), {
    status: "failed",
    classification: "shutdown-failure",
    safeReason: "pool-close-drain-timeout",
  });
  assert.equal(result.composition.state(), "failed");
});

test("drain policy, concurrent shutdown, and lifecycle events are deterministic", async () => {
  const fixture = createPoolFixture();
  const events: ReplayPostgresqlObservabilityEvent[] = [];
  const result = await createMultiCutReplayPostgresqlProductionComposition(
    configuration,
    {
      poolFactory: Object.freeze({ create: () => fixture.pool }),
      drainTimeoutMs: 25,
      observability: Object.freeze({
        emit: (event) => void events.push(event),
      }),
    },
  );
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  const first = result.composition.shutdown();
  const second = result.composition.shutdown();
  assert.deepEqual(await first, { status: "closed" });
  assert.deepEqual(await second, { status: "closed" });
  assert.deepEqual(fixture.closeOptions, [{ timeoutMs: 25 }]);
  assert.deepEqual(
    events.map(({ eventType }) => eventType),
    [
      "replay-postgresql-pool-draining",
      "replay-postgresql-pool-drained",
      "replay-postgresql-pool-closed",
    ],
  );
});

test("drain timeout emits one timeout and closed event despite observer failure", async () => {
  const fixture = createPoolFixture();
  fixture.setCloseResult("drain-timeout");
  let calls = 0;
  const result = await createMultiCutReplayPostgresqlProductionComposition(
    configuration,
    {
      poolFactory: Object.freeze({ create: () => fixture.pool }),
      drainTimeoutMs: 0,
      observability: Object.freeze({
        emit: () => {
          calls += 1;
          if (calls === 1) throw new Error("observer-private");
        },
      }),
    },
  );
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal((await result.composition.shutdown()).status, "failed");
  assert.equal(calls, 3);
  assert.deepEqual(fixture.closeOptions, [{ timeoutMs: 0 }]);
  assert.equal(result.composition.state(), "failed");
});

test("invalid drain policy fails before pool construction", async () => {
  for (const drainTimeoutMs of [-1, 0.5, Number.POSITIVE_INFINITY]) {
    let calls = 0;
    const result = await createMultiCutReplayPostgresqlProductionComposition(
      configuration,
      {
        drainTimeoutMs,
        poolFactory: Object.freeze({
          create: () => {
            calls += 1;
            return createPoolFixture().pool;
          },
        }),
      },
    );
    assert.equal(result.status, "failed");
    assert.equal(calls, 0);
  }
});

test("composition keeps a one-way boundary and owns no environment access", () => {
  const source = readFileSync(
    "lib/server/multiCutReplayPostgresqlProductionComposition/composition.ts",
    "utf8",
  );
  assert.equal(source.includes("process.env"), false);
  assert.equal(source.includes("multiCutReplayPostgresqlAdapter"), false);
  assert.equal(source.includes("multiCutReplayPostgresqlSqlDefinitions"), false);
  assert.equal(source.includes("globalThis"), false);
});
