import assert from "node:assert/strict";
import test from "node:test";
import { withPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";
import { createWorkflowCompletionTransitionRequest } from "../../lib/server/workflowCompletionState";
import { executeWorkflowCompletionStateTransition } from "../../lib/server/workflowCompletionStatePersistence";
import { createDurableWorkflowPostgresqlSameSessionQueryCapability } from "../../lib/server/productionWorkflowRuntime/durableTransaction";
import { PostgreSQLConnectionPoolAdapter } from "../../lib/server/productionWorkflowRuntime/postgresqlDriver";

test("V000005 and same-session executor preserve CAS, visibility, commit, and rollback", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    assert.equal(environment.flyway.migrate.succeeded, true); assert.equal(environment.flyway.validate.succeeded, true);
    const columns = await environment.pool.query("SELECT column_name,is_nullable,data_type FROM information_schema.columns WHERE table_schema='workflow' AND table_name='workflow_completion_states' ORDER BY ordinal_position");
    assert.equal(columns.rowCount, 13);
    assert.equal(columns.rows.find((value) => value.column_name === "revision")?.data_type, "bigint");
    assert.equal(columns.rows.find((value) => value.column_name === "state")?.is_nullable, "NO");
    const seed = async (value: string) => environment.pool.query(`INSERT INTO workflow.workflow_completion_states (workflow_identity_version,workflow_identity_namespace,workflow_identity_value,state,revision) VALUES ('1.0','workflow-completion',$1,'eligible-for-completion',0)`, [value]);
    await seed("rollback-workflow"); await seed("commit-workflow");
    const pool = new PostgreSQLConnectionPoolAdapter({ ...environment.connection, maxConnections: 4, connectionTimeoutMs: 5000, idleTimeoutMs: 5000, queryTimeoutMs: 5000, applicationName: "completion-state-test", tls: { mode: "disabled" } });
    assert.equal(await pool.start(), "ready");
    const run = async (workflow: string) => {
      const checkout = await pool.checkout(); if ("status" in checkout) throw new Error("checkout-failed");
      const tx = await checkout.begin(); if ("status" in tx) throw new Error("begin-failed");
      const built = createWorkflowCompletionTransitionRequest({ workflowIdentity: Object.freeze({ identityVersion: "1.0", namespace: "workflow-completion", protectedValue: workflow }), logicalAttemptIdentity: Object.freeze({ identityVersion: "1.0", namespace: "workflow-completion", protectedValue: `attempt-${workflow}` }), expectedRevision: "0", completionTimestamp: "2026-08-02T00:00:00.000Z", resultReference: Object.freeze({ referenceVersion: "1.0", resultReferenceIdentity: `result-${workflow}` }) });
      if (built.status !== "valid") throw new Error("request-invalid");
      const result = await executeWorkflowCompletionStateTransition({ inputVersion: "1.0", query: createDurableWorkflowPostgresqlSameSessionQueryCapability({ transactionConnection: tx }), transitionRequest: built.request });
      return { tx, result };
    };
    const rollback = await run("rollback-workflow"); assert.equal(rollback.result.status, "transitioned");
    assert.equal((await environment.pool.query("SELECT state FROM workflow.workflow_completion_states WHERE workflow_identity_value='rollback-workflow'")).rows[0]?.state, "eligible-for-completion");
    await rollback.tx.rollback(); rollback.tx.release();
    const committed = await run("commit-workflow"); assert.equal(committed.result.status, "transitioned");
    assert.deepEqual(await committed.tx.commit(), { status: "committed" }); committed.tx.release();
    const row = (await environment.pool.query("SELECT state,revision::text revision,logical_attempt_identity_value,result_reference_identity FROM workflow.workflow_completion_states WHERE workflow_identity_value='commit-workflow'")).rows[0];
    assert.deepEqual(row, { state: "completed", revision: "1", logical_attempt_identity_value: "attempt-commit-workflow", result_reference_identity: "result-commit-workflow" });
    const repeat = await run("commit-workflow"); assert.equal(repeat.result.status, "not-applied"); await repeat.tx.rollback(); repeat.tx.release();
    const missing = await run("missing-workflow"); assert.equal(missing.result.status, "not-applied"); await missing.tx.rollback(); missing.tx.release();
    await assert.rejects(environment.pool.query("INSERT INTO workflow.workflow_completion_states (workflow_identity_version,workflow_identity_namespace,workflow_identity_value,state,revision) VALUES ('1.0','workflow-completion','invalid-completed','completed',1)"));
    assert.equal((await environment.pool.query("SELECT count(*)::int count FROM workflow.workflow_completion_states WHERE workflow_identity_value='invalid-completed'")).rows[0]?.count, 0);
    assert.equal(await pool.close(), "closed");
  });
});
