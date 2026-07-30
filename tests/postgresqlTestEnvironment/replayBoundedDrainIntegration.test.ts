import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { startPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";
import type { PostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment/foundation";
import {
  PostgreSQLConnectionPoolAdapter,
  type PostgreSQLConnectionConfig,
} from "../../lib/server/productionWorkflowRuntime/postgresqlDriver";

let environment: PostgreSqlTestEnvironment;
let config: PostgreSQLConnectionConfig;

before(async () => {
  environment = await startPostgreSqlTestEnvironment();
  config = {
    ...environment.connection,
    maxConnections: 3,
    connectionTimeoutMs: 5_000,
    idleTimeoutMs: 5_000,
    applicationName: "replay-bounded-drain-integration",
    tls: { mode: "disabled" },
  };
});

after(async () => {
  if (environment) await environment.stop();
});

test("real pool drains after checked-out connection release", async () => {
  const pool = new PostgreSQLConnectionPoolAdapter(config);
  assert.equal(await pool.start(), "ready");
  const connection = await pool.checkout();
  assert.equal("status" in connection, false);
  if ("status" in connection) return;

  const shutdown = pool.close({ timeoutMs: 5_000 });
  const rejected = await pool.checkout();
  assert.equal("status" in rejected && rejected.issue, "disposed");
  assert.equal(connection.release(), "released");
  assert.equal(await shutdown, "closed");
  assert.equal(pool.state(), "closed");
});

test("real pool force-discards at zero deadline and late release is safe", async () => {
  const pool = new PostgreSQLConnectionPoolAdapter(config);
  assert.equal(await pool.start(), "ready");
  const connection = await pool.checkout();
  assert.equal("status" in connection, false);
  if ("status" in connection) return;
  const transaction = await connection.begin();
  assert.equal("status" in transaction, false);

  assert.equal(await pool.close({ timeoutMs: 0 }), "drain-timeout");
  assert.equal(connection.state(), "discarded");
  assert.deepEqual(await transaction.commit(), { status: "invalid-state" });
  assert.equal(connection.release(), "already-released");
  assert.equal(await pool.close({ timeoutMs: 0 }), "already-closed");
  assert.equal(pool.state(), "closed");
});
