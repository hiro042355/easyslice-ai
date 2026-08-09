import assert from "node:assert/strict";
import test from "node:test";
import {
  createDurableWorkflowTransactionSessionV3,
  createDurableWorkflowTransactionSessionV3Complete,
  type DurableWorkflowDatabaseCapability,
  type DurableWorkflowTransactionContext,
} from "../../../lib/server/productionWorkflowRuntime/durableTransaction";
import type { PostgreSQLTransactionConnectionV2, PostgreSQLTransactionConnectionV3 } from "../../../lib/server/productionWorkflowRuntime/postgresqlDriver";

const context = (): DurableWorkflowTransactionContext => Object.freeze({
  contextVersion: "2.0",
  scope: "opaque-production-durable-transaction-scope",
  startedAt: "2026-08-08T00:00:00.000Z",
  deadlineMonotonicMilliseconds: 100,
  externalIoAllowed: false,
  database: Object.freeze({ capabilityVersion: "1.0", execute: async () => Object.freeze({ status: "success", rows: Object.freeze([]), rowCount: 0 }) }) as DurableWorkflowDatabaseCapability,
  state: () => "active",
  registerAfterCommit: () => "registered",
});

test("Session V3 exposes constructed capabilities and delegates lifecycle at most once", async () => {
  const calls = { query: 0, commit: 0, rollback: 0, release: 0, discard: 0 };
  const connection: PostgreSQLTransactionConnectionV2 = Object.freeze({
    lifecycleVersion: "2.0",
    state: () => "active",
    query: async () => { calls.query += 1; return Object.freeze({ status: "success", rows: Object.freeze([]), rowCount: 0, command: "SELECT" }); },
    commit: async () => { calls.commit += 1; return Object.freeze({ status: "unknown-outcome" }); },
    rollback: async () => { calls.rollback += 1; return Object.freeze({ status: "rolled-back" }); },
    release: () => { calls.release += 1; return "released"; },
    discard: () => { calls.discard += 1; return Object.freeze({ status: "discarded" }); },
  });
  const session = createDurableWorkflowTransactionSessionV3(Object.freeze({
    constructionVersion: "1.0",
    transactionConnection: connection,
    transactionContextV2: context(),
    transactionOwnerEvidence: Object.freeze({ evidenceVersion: "1.0", transactionOwner: "workflow-owner", transactionState: "active" }),
  }));

  assert.equal(session.sessionVersion, "3.0");
  assert.equal(session.contextV3.contextVersion, "3.0");
  assert.equal(session.workflowCompletionState.participantVersion, "1.0");
  assert.equal(session.manyOnlySameSessionQueryV2.capabilityVersion, "2.0");
  assert.equal("transactionConnection" in session, false);
  assert.equal("client" in session, false);
  assert.equal(calls.query, 0);

  assert.deepEqual(await session.commit(), { status: "unknown-outcome" });
  assert.deepEqual(await session.commit(), { status: "unknown-outcome" });
  assert.equal(calls.commit, 1);
  assert.equal(calls.rollback, 0);
  assert.deepEqual(await session.rollback(), { status: "rolled-back" });
  assert.deepEqual(await session.rollback(), { status: "rolled-back" });
  assert.equal(calls.rollback, 1);
  assert.equal(session.release(), "released");
  assert.equal(session.release(), "released");
  assert.equal(calls.release, 1);
  assert.deepEqual(session.discard(), { status: "discarded" });
  assert.deepEqual(session.discard(), { status: "discarded" });
  assert.equal(calls.discard, 1);
});

test("complete Session V3 additively exposes Context V4 without changing lifecycle", () => {
  let commits = 0;
  const connection: PostgreSQLTransactionConnectionV3 = Object.freeze({
    lifecycleVersion: "2.0",
    queryContractVersion: "2.0",
    state: () => "active",
    query: async () => Object.freeze({ status: "success", rows: Object.freeze([]), rowCount: 0, command: "SELECT" }),
    queryV2: async () => Object.freeze({ status: "success", rows: Object.freeze([]), rowCount: 0, command: "SELECT" }),
    commit: async () => { commits += 1; return Object.freeze({ status: "committed" }); },
    rollback: async () => Object.freeze({ status: "rolled-back" }),
    release: () => "released",
    discard: () => Object.freeze({ status: "discarded" }),
  });
  const session = createDurableWorkflowTransactionSessionV3Complete(Object.freeze({
    constructionVersion: "2.0",
    transactionConnection: connection,
    transactionContextV2: context(),
    transactionOwnerEvidence: Object.freeze({ evidenceVersion: "1.0", transactionOwner: "workflow-owner", transactionState: "active" }),
  }));
  assert.equal(session.sessionVersion, "3.0");
  assert.equal(session.contextV3.contextVersion, "3.0");
  assert.equal(session.completeContext.contextVersion, "4.0");
  assert.equal("transactionConnection" in session, false);
  void session.commit();
  void session.commit();
  assert.equal(commits, 1);
});
