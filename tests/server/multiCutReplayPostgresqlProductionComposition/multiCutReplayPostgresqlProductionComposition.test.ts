import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createMultiCutReplayPostgresqlProductionComposition,
} from "../../../lib/server/multiCutReplayPostgresqlProductionComposition";
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
}>;

const createPoolFixture = (
  startResult: "ready" | PostgreSQLExecutionFailure = "ready",
): PoolFixture => {
  const log: string[] = [];
  let state: PostgreSQLPoolState = "created";
  let closeResult: "closed" | "already-closed" | "drain-timeout" = "closed";
  return Object.freeze({
    log,
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
      async close() {
        log.push("close");
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
