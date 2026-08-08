import assert from "node:assert/strict";
import test from "node:test";
import { withPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";
import {
  createDurableWorkflowTransactionSessionV3,
  type DurableWorkflowDatabaseCapability,
  type DurableWorkflowTransactionContext,
} from "../../lib/server/productionWorkflowRuntime/durableTransaction";
import { PostgreSQLConnectionPoolAdapter } from "../../lib/server/productionWorkflowRuntime/postgresqlDriver";
import { createWorkflowCompletionTransitionRequest } from "../../lib/server/workflowCompletionState";

test("Session V3 keeps completion participant and query capabilities atomic", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    assert.equal(environment.flyway.migrate.succeeded, true);
    assert.equal(environment.flyway.validate.succeeded, true);
    await environment.pool.query("INSERT INTO workflow.workflow_completion_states (workflow_identity_version,workflow_identity_namespace,workflow_identity_value,state,revision) VALUES ('1.0','workflow-completion','session-v3-commit','eligible-for-completion',0),('1.0','workflow-completion','session-v3-rollback','eligible-for-completion',0)");
    const pool = new PostgreSQLConnectionPoolAdapter({ ...environment.connection, maxConnections: 3, connectionTimeoutMs: 5_000, idleTimeoutMs: 5_000, queryTimeoutMs: 5_000, applicationName: "workflow-session-v3", tls: { mode: "disabled" } });
    assert.equal(await pool.start(), "ready");

    const create = async (workflow: string) => {
      const checkedOut = await pool.checkout(); if ("status" in checkedOut) throw new Error("checkout-failed");
      const transaction = await checkedOut.begin(); if ("status" in transaction) throw new Error("begin-failed");
      const database: DurableWorkflowDatabaseCapability = Object.freeze({ capabilityVersion: "1.0", execute: async () => Object.freeze({ status: "success", rows: Object.freeze([]), rowCount: 0 }) });
      const context: DurableWorkflowTransactionContext = Object.freeze({ contextVersion: "2.0", scope: "opaque-production-durable-transaction-scope", startedAt: "2026-08-08T00:00:00.000Z", deadlineMonotonicMilliseconds: 100, externalIoAllowed: false, database, state: () => "active", registerAfterCommit: () => "registered" });
      const session = createDurableWorkflowTransactionSessionV3(Object.freeze({ constructionVersion: "1.0", transactionConnection: transaction, transactionContextV2: context, transactionOwnerEvidence: Object.freeze({ evidenceVersion: "1.0", transactionOwner: "workflow-owner", transactionState: "active" }) }));
      const request = createWorkflowCompletionTransitionRequest({ workflowIdentity: Object.freeze({ identityVersion: "1.0", namespace: "workflow-completion", protectedValue: workflow }), logicalAttemptIdentity: Object.freeze({ identityVersion: "1.0", namespace: "workflow-completion", protectedValue: `attempt-${workflow}` }), expectedRevision: "0", completionTimestamp: "2026-08-08T00:00:00.000Z", resultReference: Object.freeze({ referenceVersion: "1.0", resultReferenceIdentity: `result-${workflow}` }) });
      if (request.status !== "valid") throw new Error("request-invalid");
      return { session, request: request.request };
    };

    const committed = await create("session-v3-commit");
    assert.equal((await committed.session.workflowCompletionState.transition(committed.request)).status, "transitioned");
    const same = await committed.session.contextV3.sameSessionQuery.executeQuery(Object.freeze({ statementId: "session-v3.state.same", text: "SELECT state FROM workflow.workflow_completion_states WHERE workflow_identity_value='session-v3-commit'", values: Object.freeze([]), expectedResult: "many" }));
    assert.equal(same.status, "success"); if (same.status === "success") assert.equal(same.rows[0]?.state, "completed");
    assert.equal((await environment.pool.query("SELECT state FROM workflow.workflow_completion_states WHERE workflow_identity_value='session-v3-commit'")).rows[0]?.state, "eligible-for-completion");
    assert.equal((await committed.session.databaseV2.execute(Object.freeze({ commandVersion: "1.0", statementId: "slice-a.atomic.lookup", parameters: Object.freeze([Uint8Array.from([1]), Uint8Array.from([2]), Uint8Array.from([3])]), expectedResult: "single" }))).status, "success");
    assert.deepEqual(await committed.session.commit(), { status: "committed" }); committed.session.release();
    assert.equal((await environment.pool.query("SELECT state FROM workflow.workflow_completion_states WHERE workflow_identity_value='session-v3-commit'")).rows[0]?.state, "completed");

    const rolledBack = await create("session-v3-rollback");
    assert.equal((await rolledBack.session.workflowCompletionState.transition(rolledBack.request)).status, "transitioned");
    assert.deepEqual(await rolledBack.session.rollback(), { status: "rolled-back" }); rolledBack.session.release();
    assert.equal((await environment.pool.query("SELECT state FROM workflow.workflow_completion_states WHERE workflow_identity_value='session-v3-rollback'")).rows[0]?.state, "eligible-for-completion");
    assert.equal(await pool.close(), "closed");
  });
});
