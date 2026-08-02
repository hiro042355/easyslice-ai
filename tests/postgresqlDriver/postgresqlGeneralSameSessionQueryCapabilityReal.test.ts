import assert from "node:assert/strict";
import test from "node:test";
import { withPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";
import { createDurableWorkflowGeneralPostgresqlSameSessionQueryCapabilityV1 } from "../../lib/server/productionWorkflowRuntime/durableTransaction";
import {
  PostgreSQLConnectionPoolAdapter,
  type PostgreSQLConnectionConfig,
  type PostgreSQLParameter,
} from "../../lib/server/productionWorkflowRuntime/postgresqlDriver";

const request = (
  statementId: string,
  text: string,
  expectedResult: "single" | "many" | "none",
  values: readonly PostgreSQLParameter[] = [],
) => Object.freeze({ statementId, text, values, expectedResult });

test("general same-session capability preserves all cardinalities and authoritative evidence", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const config: PostgreSQLConnectionConfig = {
      ...environment.connection,
      maxConnections: 4,
      connectionTimeoutMs: 5_000,
      idleTimeoutMs: 5_000,
      queryTimeoutMs: 5_000,
      applicationName: "general-same-session-query-capability-test",
      tls: { mode: "disabled" },
    };
    const pool = new PostgreSQLConnectionPoolAdapter(config);
    assert.equal(await pool.start(), "ready");
    const checkout = await pool.checkout();
    if ("status" in checkout) throw new Error("checkout-failed");
    const transaction = await checkout.begin();
    if ("status" in transaction) throw new Error("begin-failed");
    const capability = createDurableWorkflowGeneralPostgresqlSameSessionQueryCapabilityV1({ transactionConnection: transaction });

    assert.deepEqual(await capability.executeQuery(request("general.create", "CREATE TEMP TABLE general_probe (id integer PRIMARY KEY)", "none")), {
      resultVersion: "1.0", status: "success", rows: [], rowCount: 0, command: "CREATE",
    });
    assert.equal((await capability.executeQuery(request("general.insert", "INSERT INTO general_probe (id) VALUES (1), (2)", "none"))).status, "success");

    const many = await capability.executeQuery(request("general.many", "SELECT id FROM general_probe ORDER BY id", "many"));
    assert.equal(many.status, "success");
    if (many.status === "success") {
      assert.equal(many.rowCount, 2);
      assert.equal(many.command, "SELECT");
    }
    const single = await capability.executeQuery(request("general.single", "SELECT id FROM general_probe WHERE id = 1", "single"));
    assert.equal(single.status, "success");
    if (single.status === "success") assert.equal(single.rowCount, 1);

    assert.deepEqual(await capability.executeQuery(request("general.not-found", "SELECT id FROM general_probe WHERE id = 9", "single")), {
      resultVersion: "1.0", status: "not-found", expectedResult: "single", actualRowCount: 0, command: "SELECT",
    });
    assert.deepEqual(await capability.executeQuery(request("general.single-conflict", "SELECT id FROM general_probe", "single")), {
      resultVersion: "1.0", status: "cardinality-conflict", expectedResult: "single", actualRowCount: 2, command: "SELECT",
    });
    assert.deepEqual(await capability.executeQuery(request("general.none-conflict", "SELECT id FROM general_probe WHERE id = 1", "none")), {
      resultVersion: "1.0", status: "cardinality-conflict", expectedResult: "none", actualRowCount: 1, command: "SELECT",
    });
    assert.equal((await capability.executeQuery(request("general.none-zero", "UPDATE general_probe SET id = id WHERE id = 9", "none"))).status, "success");

    const failure = await capability.executeQuery(request("general.failure", "SELECT missing_column FROM general_probe", "many"));
    assert.equal(failure.status, "execution-failure");
    if (failure.status === "execution-failure") {
      assert.equal(failure.classification, "schema-mismatch");
      assert.equal(failure.safeReason, "postgresql-schema-mismatch");
      assert.equal(failure.sqlStateClass, "42");
      assert.equal(failure.queryConnectionDisposition, "must-rollback-before-reuse");
    }

    assert.deepEqual(await transaction.rollback(), { status: "rolled-back" });
    assert.equal(transaction.release(), "released");
    assert.equal(await pool.close(), "closed");
  });
});
