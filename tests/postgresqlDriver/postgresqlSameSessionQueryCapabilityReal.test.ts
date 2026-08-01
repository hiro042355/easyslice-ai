import assert from "node:assert/strict";
import test from "node:test";
import { withPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";
import { createDurableWorkflowPostgresqlSameSessionQueryCapability } from "../../lib/server/productionWorkflowRuntime/durableTransaction";
import {
  PostgreSQLConnectionPoolAdapter,
  type PostgreSQLConnectionConfig,
  type PostgreSQLParameter,
  type PostgreSQLTransactionConnection,
} from "../../lib/server/productionWorkflowRuntime/postgresqlDriver";

const request = (
  statementId: string,
  text: string,
  values: readonly PostgreSQLParameter[] = [],
) => Object.freeze({ statementId, text, values, expectedResult: "many" as const });

test("real capability preserves same-session visibility, commands, zero rows, and safe failures", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    await environment.pool.query(
      "CREATE TABLE public.same_session_probe (id integer PRIMARY KEY, value text NOT NULL UNIQUE)",
    );
    const config: PostgreSQLConnectionConfig = {
      ...environment.connection,
      maxConnections: 4,
      connectionTimeoutMs: 5_000,
      idleTimeoutMs: 5_000,
      queryTimeoutMs: 100,
      applicationName: "same-session-query-capability-test",
      tls: { mode: "disabled" },
    };
    const pool = new PostgreSQLConnectionPoolAdapter(config);
    assert.equal(await pool.start(), "ready");

    const checkout = await pool.checkout();
    if ("status" in checkout) throw new Error("checkout-failed");
    const transaction = await checkout.begin();
    if ("status" in transaction) throw new Error("begin-failed");
    const capability = createDurableWorkflowPostgresqlSameSessionQueryCapability({
      transactionConnection: transaction,
    });

    const inserted = await capability.executeQuery(request(
      "same-session.insert",
      "INSERT INTO public.same_session_probe (id, value) VALUES ($1::integer, $2::text)",
      [{ kind: "safe-integer", value: 1 }, { kind: "string", value: "uncommitted" }],
    ));
    assert.equal(inserted.status, "success");
    if (inserted.status === "success") assert.equal(inserted.command, "INSERT");

    const visible = await capability.executeQuery(request(
      "same-session.visible",
      "SELECT value FROM public.same_session_probe WHERE id = $1::integer",
      [{ kind: "safe-integer", value: 1 }],
    ));
    assert.equal(visible.status, "success");
    if (visible.status === "success") {
      assert.equal(visible.command, "SELECT");
      assert.equal(visible.rowCount, 1);
      assert.equal(visible.rows[0]?.value, "uncommitted");
    }
    const outside = await environment.pool.query(
      "SELECT value FROM public.same_session_probe WHERE id = 1",
    );
    assert.equal(outside.rowCount, 0);

    const zero = await capability.executeQuery(request(
      "same-session.zero",
      "UPDATE public.same_session_probe SET value = value WHERE id = 999",
    ));
    assert.equal(zero.status, "success");
    if (zero.status === "success") {
      assert.equal(zero.command, "UPDATE");
      assert.equal(zero.rowCount, 0);
    }
    assert.deepEqual(await transaction.rollback(), { status: "rolled-back" });
    assert.equal(transaction.release(), "released");
    assert.equal((await environment.pool.query("SELECT * FROM public.same_session_probe")).rowCount, 0);

    const constraintTransaction = await begin(pool);
    const constraintCapability = createDurableWorkflowPostgresqlSameSessionQueryCapability({
      transactionConnection: constraintTransaction,
    });
    await constraintCapability.executeQuery(request(
      "same-session.constraint-first",
      "INSERT INTO public.same_session_probe (id, value) VALUES (2, 'duplicate'), (3, 'other')",
    ));
    const constraint = await constraintCapability.executeQuery(request(
      "same-session.constraint-second",
      "INSERT INTO public.same_session_probe (id, value) VALUES (4, 'duplicate')",
    ));
    assert.equal(constraint.status, "execution-failure");
    if (constraint.status === "execution-failure") {
      assert.equal(constraint.classification, "constraint-conflict");
      assert.equal(constraint.safeReason, "postgresql-constraint-conflict");
      assert.equal(constraint.sqlStateClass, "23");
      assert.equal(constraint.queryConnectionDisposition, "must-rollback-before-reuse");
      assert.equal("retryMetadata" in constraint, false);
      assert.equal("reconciliationMetadata" in constraint, false);
    }
    await constraintTransaction.rollback();
    constraintTransaction.release();

    const timeoutTransaction = await begin(pool);
    const timeoutCapability = createDurableWorkflowPostgresqlSameSessionQueryCapability({
      transactionConnection: timeoutTransaction,
    });
    const timeout = await timeoutCapability.executeQuery(request(
      "same-session.timeout",
      "SELECT pg_sleep(1)",
    ));
    assert.equal(timeout.status, "execution-failure");
    if (timeout.status === "execution-failure") {
      assert.equal(timeout.classification, "timeout");
      assert.equal(timeout.safeReason, "postgresql-timeout");
      assert.equal(timeout.sqlStateClass, "57");
    }
    await timeoutTransaction.rollback();
    timeoutTransaction.release();
    assert.equal(await pool.close(), "closed");
  });
});

async function begin(
  pool: PostgreSQLConnectionPoolAdapter,
): Promise<PostgreSQLTransactionConnection> {
  const checkout = await pool.checkout();
  if ("status" in checkout) throw new Error("checkout-failed");
  const transaction = await checkout.begin();
  if ("status" in transaction) throw new Error("begin-failed");
  return transaction;
}
