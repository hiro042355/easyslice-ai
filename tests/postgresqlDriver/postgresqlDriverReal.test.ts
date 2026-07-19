import assert from "node:assert/strict";
import test from "node:test";
import { PostgreSQLConnectionPoolAdapter, type PostgreSQLConnectionConfig, type PostgreSQLParameter } from "../../lib/server/productionWorkflowRuntime/postgresqlDriver";
import { withPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";

const request = (statementId: string, text: string, values: readonly PostgreSQLParameter[] = [], expectedResult: "none" | "single" | "many" = "none") => ({ statementId, text, values, expectedResult } as const);

test("real pool, dedicated connection, codecs, cardinality, and lifecycle", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const config: PostgreSQLConnectionConfig = { ...environment.connection, maxConnections: 4, connectionTimeoutMs: 5_000, idleTimeoutMs: 5_000, applicationName: "postgresql-driver-foundation-test", tls: { mode: "disabled" } };
    const pool = new PostgreSQLConnectionPoolAdapter(config);
    const before = await pool.checkout();
    assert.equal("status" in before && before.status, "failure");
    assert.equal(await pool.start(), "ready");
    assert.equal(await pool.start(), "already-started");
    const connection = await pool.checkout();
    assert.equal("status" in connection, false);
    if ("status" in connection) return;

    const bytes = new Uint8Array(32).fill(7);
    const json = { nested: [1, true, null], ordered: ["a", "b"] };
    const result = await connection.query(request("driver.type-roundtrip", `
      SELECT $1::int8 AS big_value, $2::numeric AS numeric_value, $3::uuid AS uuid_value,
             $4::bytea AS bytes_value, $5::timestamptz AS time_value, $6::jsonb AS json_value,
             $7::boolean AS bool_value, $8::text AS text_value, NULL::text AS null_value
    `, [
      { kind: "bigint", value: "9007199254740992" }, { kind: "string", value: "123.4500" },
      { kind: "uuid", value: "123e4567-e89b-42d3-a456-426614174000" }, { kind: "bytea", value: bytes },
      { kind: "utc-timestamp", value: "2026-07-16T01:02:03.123456Z" }, { kind: "json", value: json },
      { kind: "boolean", value: true }, { kind: "string", value: "driver" },
    ], "single"));
    assert.equal(result.status, "success");
    if (result.status === "success") {
      assert.equal(result.rows[0]?.big_value, "9007199254740992");
      assert.equal(result.rows[0]?.numeric_value, "123.4500");
      assert.equal(result.rows[0]?.time_value, "2026-07-16T01:02:03.123456Z");
      assert.deepEqual(result.rows[0]?.bytes_value, new Uint8Array(32).fill(7));
      assert.deepEqual(result.rows[0]?.json_value, json);
      assert.equal(result.rows[0]?.null_value, null);
    }
    bytes[0] = 1;
    json.ordered[0] = "changed";

    assert.equal((await connection.query(request("driver.not-found", "SELECT 1 WHERE false", [], "single"))).status, "not-found");
    assert.equal((await connection.query(request("driver.cardinality", "SELECT value FROM (VALUES (1), (2)) AS x(value)", [], "single"))).status, "cardinality-conflict");
    assert.equal(connection.release(), "released");
    assert.equal(connection.release(), "already-released");
    assert.equal((await connection.query(request("driver.after-release", "SELECT 1", [], "single"))).status, "failure");
    assert.equal(await pool.close(), "closed");
    assert.equal(await pool.close(), "already-closed");
  });
});

test("real SQLSTATE, failed transaction, commit, rollback, cancellation, and termination", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const pool = new PostgreSQLConnectionPoolAdapter({ ...environment.connection, maxConnections: 6, connectionTimeoutMs: 5_000, idleTimeoutMs: 5_000, applicationName: "postgresql-driver-failure-test", tls: { mode: "disabled" } });
    assert.equal(await pool.start(), "ready");
    const connection = await pool.checkout();
    if ("status" in connection) throw new Error("checkout-failed");
    assert.equal((await connection.query(request("driver.fixture-parent", "CREATE TEMP TABLE driver_parent (id integer PRIMARY KEY)"))).status, "success");
    assert.equal((await connection.query(request("driver.fixture-child", "CREATE TEMP TABLE driver_child (id integer UNIQUE, parent_id integer REFERENCES driver_parent(id), value integer CHECK (value > 0))"))).status, "success");
    assert.equal((await connection.query(request("driver.parent", "INSERT INTO driver_parent VALUES (1)"))).status, "success");
    assert.equal((await connection.query(request("driver.child", "INSERT INTO driver_child VALUES (1, 1, 1)"))).status, "success");
    assert.equal((await connection.query(request("driver.unique", "INSERT INTO driver_child VALUES (1, 1, 1)"))).status, "failure");
    assert.equal((await connection.query(request("driver.fk", "INSERT INTO driver_child VALUES (2, 99, 1)"))).status, "failure");
    assert.equal((await connection.query(request("driver.check", "INSERT INTO driver_child VALUES (3, 1, 0)"))).status, "failure");
    assert.equal((await connection.query(request("driver.undefined-table", "SELECT * FROM driver_missing", [], "many"))).status, "failure");
    assert.equal((await connection.query(request("driver.undefined-column", "SELECT missing FROM driver_parent", [], "many"))).status, "failure");

    const committed = await connection.begin();
    if ("status" in committed) throw new Error("begin-failed");
    assert.equal((await committed.query(request("driver.tx-insert", "INSERT INTO driver_parent VALUES (2)"))).status, "success");
    assert.deepEqual(await committed.commit(), { status: "committed" });
    assert.equal(committed.release(), "released");

    const rollbackConnection = await pool.checkout();
    if ("status" in rollbackConnection) throw new Error("checkout-failed");
    const rolled = await rollbackConnection.begin();
    if ("status" in rolled) throw new Error("begin-failed");
    assert.equal((await rolled.query(request("driver.tx-error", "SELECT * FROM table_that_does_not_exist", [], "many"))).status, "failure");
    assert.equal((await rolled.query(request("driver.tx-after-error", "SELECT 1", [], "single"))).status, "failure");
    assert.deepEqual(await rolled.rollback(), { status: "rolled-back" });
    assert.equal(rolled.release(), "released");

    const cancelledConnection = await pool.checkout();
    if ("status" in cancelledConnection) throw new Error("checkout-failed");
    await cancelledConnection.query(request("driver.timeout-set", "SET statement_timeout = 50"));
    const cancelled = await cancelledConnection.query(request("driver.cancelled", "SELECT pg_sleep(1)", [], "single"));
    assert.equal(cancelled.status, "failure");
    if (cancelled.status === "failure") assert.equal(cancelled.issue, "query-cancelled");
    cancelledConnection.release();

    const terminatedConnection = await pool.checkout();
    if ("status" in terminatedConnection) throw new Error("checkout-failed");
    const terminated = await terminatedConnection.query(request("driver.terminate", "SELECT pg_terminate_backend(pg_backend_pid())", [], "single"));
    assert.equal(terminated.status, "failure");
    terminatedConnection.discard();
    assert.equal(await pool.close(), "closed");
  });
});

test("real read-only, deadlock, and serialization conflicts are conservatively classified", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    await environment.pool.query("CREATE TABLE public.driver_conflict_probe (id integer PRIMARY KEY, value integer NOT NULL)");
    await environment.pool.query("INSERT INTO public.driver_conflict_probe VALUES (1, 0), (2, 0)");
    const pool = new PostgreSQLConnectionPoolAdapter({ ...environment.connection, maxConnections: 6, connectionTimeoutMs: 5_000, idleTimeoutMs: 5_000, applicationName: "postgresql-driver-conflict-test", tls: { mode: "disabled" } });
    assert.equal(await pool.start(), "ready");

    const readOnlyConnection = await pool.checkout();
    if ("status" in readOnlyConnection) throw new Error("checkout-failed");
    const readOnly = await readOnlyConnection.begin();
    if ("status" in readOnly) throw new Error("begin-failed");
    assert.equal((await readOnly.query(request("driver.read-only-mode", "SET TRANSACTION READ ONLY"))).status, "success");
    const readOnlyFailure = await readOnly.query(request("driver.read-only-write", "UPDATE public.driver_conflict_probe SET value = 1 WHERE id = 1"));
    assert.equal(readOnlyFailure.status, "failure");
    if (readOnlyFailure.status === "failure") assert.equal(readOnlyFailure.issue, "read-only");
    assert.deepEqual(await readOnly.rollback(), { status: "rolled-back" });
    readOnly.release();

    const connectionA = await pool.checkout();
    const connectionB = await pool.checkout();
    if ("status" in connectionA || "status" in connectionB) throw new Error("checkout-failed");
    const transactionA = await connectionA.begin();
    const transactionB = await connectionB.begin();
    if ("status" in transactionA || "status" in transactionB) throw new Error("begin-failed");
    await transactionA.query(request("driver.deadlock-a-lock", "UPDATE public.driver_conflict_probe SET value = value + 1 WHERE id = 1"));
    await transactionB.query(request("driver.deadlock-b-lock", "UPDATE public.driver_conflict_probe SET value = value + 1 WHERE id = 2"));
    const waiting = transactionA.query(request("driver.deadlock-a-wait", "UPDATE public.driver_conflict_probe SET value = value + 1 WHERE id = 2"));
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    const crossing = transactionB.query(request("driver.deadlock-b-cross", "UPDATE public.driver_conflict_probe SET value = value + 1 WHERE id = 1"));
    const deadlockResults = await Promise.all([waiting, crossing]);
    assert.equal(deadlockResults.some((result) => result.status === "failure" && result.issue === "retryable-conflict"), true);
    await transactionA.rollback();
    await transactionB.rollback();
    transactionA.release();
    transactionB.release();

    const serialConnectionA = await pool.checkout();
    const serialConnectionB = await pool.checkout();
    if ("status" in serialConnectionA || "status" in serialConnectionB) throw new Error("checkout-failed");
    const serialA = await serialConnectionA.begin();
    const serialB = await serialConnectionB.begin();
    if ("status" in serialA || "status" in serialB) throw new Error("begin-failed");
    await serialA.query(request("driver.serial-a-mode", "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE"));
    await serialB.query(request("driver.serial-b-mode", "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE"));
    await serialA.query(request("driver.serial-a-read", "SELECT value FROM public.driver_conflict_probe WHERE id = 1", [], "single"));
    await serialB.query(request("driver.serial-b-read", "SELECT value FROM public.driver_conflict_probe WHERE id = 1", [], "single"));
    await serialA.query(request("driver.serial-a-write", "UPDATE public.driver_conflict_probe SET value = value + 1 WHERE id = 1"));
    assert.deepEqual(await serialA.commit(), { status: "committed" });
    serialA.release();
    const serialConflict = await serialB.query(request("driver.serial-b-write", "UPDATE public.driver_conflict_probe SET value = value + 1 WHERE id = 1"));
    assert.equal(serialConflict.status, "failure");
    if (serialConflict.status === "failure") assert.equal(serialConflict.issue, "retryable-conflict");
    await serialB.rollback();
    serialB.release();

    assert.equal(await pool.close(), "closed");
    await environment.pool.query("DROP TABLE public.driver_conflict_probe");
  });
});
