import assert from "node:assert/strict";
import test from "node:test";

import { withPostgreSqlTestEnvironment } from "@/lib/postgresqlTestEnvironment";
import {
  createDefaultPostgresqlDurableWorkflowDatabaseCapabilityV2,
  createDurableWorkflowGeneralPostgresqlSameSessionQueryCapabilityV1,
} from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import {
  PostgreSQLConnectionPoolAdapter,
  type PostgreSQLConnectionConfig,
} from "@/lib/server/productionWorkflowRuntime/postgresqlDriver";
import {
  projectPostgreSQLFinalResultRowV2,
  projectPostgreSQLOutboxRowV2,
} from "@/lib/server/productionWorkflowRuntime/postgresqlStores";

const digest = (seed: number) => new Uint8Array(32).fill(seed);
const id = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

test("Production V2 adapter preserves Slice A structured rows on its injected transaction session", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const config: PostgreSQLConnectionConfig = {
      ...environment.connection,
      maxConnections: 4,
      connectionTimeoutMs: 5_000,
      idleTimeoutMs: 5_000,
      queryTimeoutMs: 5_000,
      applicationName: "durable-database-v2-real",
      tls: { mode: "disabled" },
    };
    const pool = new PostgreSQLConnectionPoolAdapter(config);
    assert.equal(await pool.start(), "ready");
    const checkout = await pool.checkout();
    if ("status" in checkout) throw new Error("checkout-failed");
    const transaction = await checkout.begin();
    if ("status" in transaction) throw new Error("begin-failed");
    const database = createDefaultPostgresqlDurableWorkflowDatabaseCapabilityV2({
      sameSessionQueryCapability: createDurableWorkflowGeneralPostgresqlSameSessionQueryCapabilityV1({
        transactionConnection: transaction,
      }),
    });

    const terminalPayload = { assets: [{ id: "asset-1", scores: [1, 2], metadata: { active: true, note: null } }] };
    const finalInsert = await database.execute(Object.freeze({
      commandVersion: "1.0",
      statementId: "slice-a.final.insert",
      parameters: Object.freeze([
        id(1), digest(1), digest(2), "test-region", "generate-mv", "completed", "0",
        JSON.stringify(terminalPayload), "2027-08-02T00:00:00.000Z", "standard", "active", "none",
      ]),
      expectedResult: "many",
    }));
    assert.equal(finalInsert.status, "success");
    if (finalInsert.status !== "success") throw new Error("final-insert-failed");
    assert.equal(finalInsert.command, "INSERT");
    assert.equal(finalInsert.rowCount, 1);
    const finalRecord = projectPostgreSQLFinalResultRowV2(finalInsert.rows[0]!);
    assert.equal(finalRecord.status, "success");
    if (finalRecord.status === "success") assert.deepEqual(finalRecord.record.terminalPayload, terminalPayload);

    const referenceInsert = await database.execute(Object.freeze({
      commandVersion: "1.0",
      statementId: "slice-a.reference.insert",
      parameters: Object.freeze([
        id(2), digest(3), id(1), "workflow-result", "generate-mv", digest(4), digest(2), "test-region",
        "active", "0", "2027-08-02T00:00:00.000Z", "active", "none",
      ]),
      expectedResult: "many",
    }));
    assert.equal(referenceInsert.status, "success");
    if (referenceInsert.status === "success") assert.deepEqual([referenceInsert.command, referenceInsert.rowCount], ["INSERT", 1]);

    const safePayload = { status: "completed", clips: [{ id: "clip-1", flags: [true, false], note: null }] };
    const outboxInsert = await database.execute(Object.freeze({
      commandVersion: "1.0",
      statementId: "slice-a.outbox.insert",
      parameters: Object.freeze([
        id(3), digest(5), digest(1), id(1), "workflow.result.committed", JSON.stringify(safePayload),
        "2026-08-02T00:00:00.000Z",
      ]),
      expectedResult: "many",
    }));
    assert.equal(outboxInsert.status, "success");
    if (outboxInsert.status !== "success") throw new Error("outbox-insert-failed");
    const outboxRecord = projectPostgreSQLOutboxRowV2(outboxInsert.rows[0]!);
    assert.equal(outboxRecord.status, "success");
    if (outboxRecord.status === "success") assert.deepEqual(outboxRecord.record.safePayload, safePayload);

    const missing = await database.execute(Object.freeze({
      commandVersion: "1.0",
      statementId: "slice-a.final.read",
      parameters: Object.freeze([digest(99)]),
      expectedResult: "single",
    }));
    assert.deepEqual(missing, { status: "not-found", expectedResult: "single", actualRowCount: 0, command: "SELECT" });

    const beforeCommit = await environment.pool.query("SELECT count(*)::int AS count FROM workflow.workflow_final_results WHERE result_id=$1", [id(1)]);
    assert.equal(beforeCommit.rows[0]?.count, 0);
    assert.deepEqual(await transaction.commit(), { status: "committed" });
    assert.equal(transaction.release(), "released");
    const afterCommit = await environment.pool.query("SELECT count(*)::int AS count FROM workflow.workflow_final_results WHERE result_id=$1", [id(1)]);
    assert.equal(afterCommit.rows[0]?.count, 1);
    assert.equal(await pool.close(), "closed");
  });
});
