import assert from "node:assert/strict";
import test from "node:test";
import { withPostgreSqlTestEnvironment } from "../../lib/postgresqlTestEnvironment";
import {
  constructProductionTransactionSessionCapabilitiesV3,
  type DurableWorkflowDatabaseCapability,
  type DurableWorkflowTransactionContext,
} from "../../lib/server/productionWorkflowRuntime/durableTransaction";
import { PostgreSQLConnectionPoolAdapter } from "../../lib/server/productionWorkflowRuntime/postgresqlDriver";

test("construction authority keeps every capability on the owner's active transaction", async () => {
  await withPostgreSqlTestEnvironment(async (environment) => {
    const pool = new PostgreSQLConnectionPoolAdapter({
      ...environment.connection,
      maxConnections: 3,
      connectionTimeoutMs: 5_000,
      idleTimeoutMs: 5_000,
      queryTimeoutMs: 5_000,
      applicationName: "session-v3-construction-test",
      tls: { mode: "disabled" },
    });
    assert.equal(await pool.start(), "ready");
    const checkedOut = await pool.checkout();
    if ("status" in checkedOut) throw new Error("checkout-failed");
    const transaction = await checkedOut.begin();
    if ("status" in transaction) throw new Error("begin-failed");

    const databaseV1: DurableWorkflowDatabaseCapability = Object.freeze({
      capabilityVersion: "1.0",
      execute: async () => Object.freeze({ status: "success", rows: Object.freeze([]), rowCount: 0 }),
    });
    const contextV2: DurableWorkflowTransactionContext = Object.freeze({
      contextVersion: "2.0",
      scope: "opaque-production-durable-transaction-scope",
      startedAt: "2026-08-08T00:00:00.000Z",
      deadlineMonotonicMilliseconds: 100,
      externalIoAllowed: false,
      database: databaseV1,
      state: () => "active",
      registerAfterCommit: () => "registered",
    });
    const built = constructProductionTransactionSessionCapabilitiesV3(Object.freeze({
      constructionVersion: "1.0",
      transactionConnection: transaction,
      transactionContextV2: contextV2,
      transactionOwnerEvidence: Object.freeze({
        evidenceVersion: "1.0",
        transactionOwner: "workflow-owner",
        transactionState: "active",
      }),
    }));

    const inserted = await built.generalSameSessionQueryCapability.executeQuery(Object.freeze({
      statementId: "session-v3.test.insert",
      text: "INSERT INTO workflow.workflow_completion_states (workflow_identity_version, workflow_identity_namespace, workflow_identity_value, state, revision) VALUES ('1.0', 'workflow-completion', 'session-v3-uncommitted', 'eligible-for-completion', 0) RETURNING workflow_identity_value",
      values: Object.freeze([]),
      expectedResult: "single",
    }));
    assert.equal(inserted.status, "success");

    const sameSession = await built.contextV3.sameSessionQuery.executeQuery(Object.freeze({
      statementId: "session-v3.test.visible",
      text: "SELECT workflow_identity_value FROM workflow.workflow_completion_states WHERE workflow_identity_value = 'session-v3-uncommitted'",
      values: Object.freeze([]),
      expectedResult: "many",
    }));
    assert.equal(sameSession.status, "success");
    if (sameSession.status === "success") assert.equal(sameSession.rowCount, 1);

    const separate = await environment.pool.query(
      "SELECT workflow_identity_value FROM workflow.workflow_completion_states WHERE workflow_identity_value = 'session-v3-uncommitted'",
    );
    assert.equal(separate.rowCount, 0);

    const durable = await built.durableWorkflowDatabaseCapabilityV2.execute(Object.freeze({
      commandVersion: "1.0",
      statementId: "slice-a.atomic.lookup",
      parameters: Object.freeze([
        Uint8Array.from([1]),
        Uint8Array.from([2]),
        Uint8Array.from([3]),
      ]),
      expectedResult: "single",
    }));
    assert.equal(durable.status, "success");

    assert.deepEqual(await transaction.rollback(), { status: "rolled-back" });
    transaction.release();
    assert.equal((await environment.pool.query(
      "SELECT workflow_identity_value FROM workflow.workflow_completion_states WHERE workflow_identity_value = 'session-v3-uncommitted'",
    )).rowCount, 0);
    assert.equal(await pool.close(), "closed");
  });
});
